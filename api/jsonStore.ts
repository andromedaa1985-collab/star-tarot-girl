import fs from "fs/promises";
import path from "path";
import crypto from "node:crypto";
import { getStore, type Store } from "@netlify/blobs";
import { RequestDeadlineError, runStorageOperation } from "./_requestDeadline.js";

let warnedVercelMissingPersistentStore = false;
// API access performs a signed-URL lookup before the payload request. The
// inherited chat deadline still caps this allowance, including its commit.
export const NETLIFY_STORAGE_TIMEOUT_MS = 8_000;

function isNetlifyRuntime() {
  return process.env.NETLIFY === "true" || Boolean(process.env.NETLIFY_BLOBS_CONTEXT);
}

function isVercelRuntime() {
  return process.env.VERCEL === "1" || process.env.VERCEL === "true";
}

function hasUpstashConfig() {
  return Boolean(getRedisRestConfig().url && getRedisRestConfig().token);
}

function getExplicitNetlifyConfig() {
  const siteID = process.env.NETLIFY_BLOBS_SITE_ID?.trim() || "";
  const token = process.env.NETLIFY_BLOBS_TOKEN?.trim() || "";
  if (!siteID && !token) return null;
  if (!siteID || !token) {
    throw new RequestDeadlineError(503, "云端存储暂时不可用，请稍后重试。", "STORE_CONFIGURATION_INVALID");
  }
  return { siteID, token };
}

function getRedisRestConfig() {
  return {
    url: process.env.UPSTASH_REDIS_REST_URL?.trim() || process.env.KV_REST_API_URL?.trim() || "",
    token: process.env.UPSTASH_REDIS_REST_TOKEN?.trim() || process.env.KV_REST_API_TOKEN?.trim() || "",
  };
}

function warnVercelMissingPersistentStore() {
  if (!isVercelRuntime() || warnedVercelMissingPersistentStore) return;
  warnedVercelMissingPersistentStore = true;
  console.warn(
    "Persistent account storage is not configured for this deployment.",
  );
}

function assertPersistentStoreOnVercel() {
  if (!isVercelRuntime() || hasUpstashConfig()) return;
  throw new RequestDeadlineError(503, "云端存储暂时不可用，请稍后重试。", "STORE_CONFIGURATION_INVALID");
}

function scopedKey(storeName: string, key: string) {
  return `${storeName}:${key}`;
}

async function upstashCommand(command: string, ...args: string[]) {
  const config = getRedisRestConfig();
  const url = config.url.replace(/\/+$/, "");
  const token = config.token;
  if (!url || !token) return undefined;

  let submitted = false;
  try {
    return await runStorageOperation(async (signal) => {
      submitted = true;
      const response = await fetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify([command, ...args]),
        signal,
      });
      const raw = await response.text();
      let data: any;
      try { data = JSON.parse(raw); }
      catch { throw new RequestDeadlineError(502, "云端存储返回内容无效，请刷新账户后重试。", "STORE_RESPONSE_INVALID"); }
      if (!response.ok || data?.error) {
        throw new RequestDeadlineError(503, "云端存储暂时不可用，请稍后重试。", "STORE_UPSTREAM_ERROR");
      }
      if (!data || typeof data !== "object" || !("result" in data) || (command === "SET" && data.result !== "OK")) {
        throw new RequestDeadlineError(502, "云端存储未确认操作结果，请刷新账户后重试。", "STORE_RESPONSE_INVALID");
      }
      return data.result;
    });
  } catch (error) {
    // A cancelled/timed-out SET may already have reached Redis. Do not retry
    // the mutation, or tell the user that a debit definitely did not happen.
    if ((command === "SET" || command === "EVAL") && submitted) {
      throw new RequestDeadlineError(503, "账户变更结果尚未确认，请刷新账户核对权益后再操作。", "STORE_WRITE_UNCONFIRMED");
    }
    if (error instanceof RequestDeadlineError) throw error;
    throw new RequestDeadlineError(503, "云端存储连接失败，请稍后重试。", "STORE_UPSTREAM_UNAVAILABLE");
  }
}

async function readUpstashJson<T>(storeName: string, key: string): Promise<T | null> {
  const result = await upstashCommand("GET", scopedKey(storeName, key));
  if (result === null || result === undefined) return null;
  if (typeof result === "string") return JSON.parse(result) as T;
  return result as T;
}

async function writeUpstashJson(storeName: string, key: string, value: unknown) {
  await upstashCommand("SET", scopedKey(storeName, key), JSON.stringify(value));
}

async function withNetlifyStore<T>(
  storeName: string,
  write: boolean,
  operation: (store: Store) => Promise<T>,
  config?: { siteID: string; token: string },
) {
  let submitted = false;
  let fetchFailure: RequestDeadlineError | undefined;
  try {
    return await runStorageOperation(async (signal) => {
      const boundedFetch: typeof fetch = async (input, init) => {
        if (signal.aborted) {
          fetchFailure = new RequestDeadlineError(499, "请求已取消。", "REQUEST_CANCELLED");
          return new Response(null, { status: 400 });
        }
        // The SDK first obtains a signed URL. Only its payload PUT can change
        // stored records; the signed-URL request has no body.
        if (write && init?.method?.toUpperCase() === "PUT" && init.body != null) submitted = true;
        try {
          const response = await fetch(input, { ...init, signal });
          const body = await response.arrayBuffer();
          if (!response.ok && response.status !== 404 && response.status !== 412) {
            fetchFailure = new RequestDeadlineError(503, "云端存储暂时不可用，请稍后重试。", "STORE_UPSTREAM_ERROR");
            return new Response(null, { status: 400 });
          }
          return new Response([204, 205, 304].includes(response.status) ? null : body, {
            status: response.status, headers: response.headers,
          });
        } catch {
          fetchFailure = new RequestDeadlineError(503, "云端存储连接失败，请稍后重试。", "STORE_UPSTREAM_UNAVAILABLE");
          // SDK 10.x retries thrown fetch errors and 429/5xx responses. Return
          // a terminal response so it cannot repeat an uncertain payload PUT.
          return new Response(null, { status: 400 });
        }
      };
      const store = getStore({ name: storeName, ...config, consistency: "strong", fetch: boundedFetch });
      const result = await operation(store);
      if (fetchFailure) throw fetchFailure;
      return result;
    }, NETLIFY_STORAGE_TIMEOUT_MS);
  } catch (error) {
    if (write && submitted) {
      throw new RequestDeadlineError(503, "账户变更结果尚未确认，请刷新账户核对权益后再操作。", "STORE_WRITE_UNCONFIRMED");
    }
    if (error instanceof RequestDeadlineError) throw error;
    if (fetchFailure) throw fetchFailure;
    if (error instanceof SyntaxError) {
      throw new RequestDeadlineError(502, "云端存储返回内容无效，请刷新账户后重试。", "STORE_RESPONSE_INVALID");
    }
    throw new RequestDeadlineError(503, "云端存储暂时不可用，请稍后重试。", "STORE_UPSTREAM_UNAVAILABLE");
  }
}

function localPath(localDir: string, key: string) {
  const root = path.resolve(process.cwd(), localDir);
  const target = path.resolve(root, `${key}.json`);
  if (!target.startsWith(root + path.sep)) throw new Error("无效的存储键。");
  return target;
}

async function readLocalJson<T>(localDir: string, key: string): Promise<T | null> {
  try {
    const content = await fs.readFile(localPath(localDir, key), "utf8");
    return JSON.parse(content) as T;
  } catch (error: any) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

async function writeLocalJson(localDir: string, key: string, value: unknown) {
  const target = localPath(localDir, key);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, JSON.stringify(value, null, 2), "utf8");
}

export async function readStoreJson<T>(storeName: string, key: string, localDir: string): Promise<T | null> {
  if (isNetlifyRuntime()) {
    return withNetlifyStore(storeName, false, (store) => store.get(key, { type: "json" }) as Promise<T | null>);
  }

  const netlifyConfig = getExplicitNetlifyConfig();
  if (netlifyConfig) {
    return withNetlifyStore(storeName, false, (store) => store.get(key, { type: "json" }) as Promise<T | null>, netlifyConfig);
  }

  if (hasUpstashConfig()) {
    return readUpstashJson<T>(storeName, key);
  }

  if (isVercelRuntime()) {
    warnVercelMissingPersistentStore();
    assertPersistentStoreOnVercel();
  }

  return readLocalJson<T>(localDir, key);
}

export async function writeStoreJson(storeName: string, key: string, value: unknown, localDir: string) {
  if (isNetlifyRuntime()) {
    await withNetlifyStore(storeName, true, (store) => store.setJSON(key, value));
    return;
  }

  const netlifyConfig = getExplicitNetlifyConfig();
  if (netlifyConfig) {
    await withNetlifyStore(storeName, true, (store) => store.setJSON(key, value), netlifyConfig);
    return;
  }

  if (hasUpstashConfig()) {
    await writeUpstashJson(storeName, key, value);
    return;
  }

  if (isVercelRuntime()) {
    warnVercelMissingPersistentStore();
    assertPersistentStoreOnVercel();
  }

  await writeLocalJson(localDir, key, value);
}


// Keep existing JSON records unchanged; use provider versions for atomic updates.
export type VersionedJson<T> = { value: T | null; version: string | null };

function netlifyStoreConfig() {
  return isNetlifyRuntime() ? undefined : getExplicitNetlifyConfig() ?? undefined;
}

export async function readVersionedStoreJson<T>(storeName: string, key: string, localDir: string): Promise<VersionedJson<T>> {
  const config = netlifyStoreConfig();
  if (isNetlifyRuntime() || config) {
    const result = await withNetlifyStore(storeName, false, store => store.getWithMetadata(key, { type: "json" }), config);
    if (!result) return { value: null, version: null };
    if (!result.etag) throw new RequestDeadlineError(503, "存储版本未确认，请稍后重试。", "STORE_VERSION_MISSING");
    return { value: result.data as T, version: result.etag };
  }
  if (hasUpstashConfig()) {
    const raw = await upstashCommand("GET", scopedKey(storeName, key));
    return raw == null ? { value: null, version: null } : { value: JSON.parse(raw) as T, version: raw };
  }
  if (isVercelRuntime()) assertPersistentStoreOnVercel();
  try {
    const raw = await fs.readFile(localPath(localDir, key), "utf8");
    return { value: JSON.parse(raw), version: raw };
  } catch (error: any) {
    if (error.code === "ENOENT") return { value: null, version: null };
    throw error;
  }
}

const localWrites = new Map<string, Promise<void>>();

const CAS_SCRIPT = "local current = redis.call('GET', KEYS[1]); if (ARGV[1] == 'missing' and current == false) or (ARGV[1] == 'exists' and current == ARGV[2]) then redis.call('SET', KEYS[1], ARGV[3]); return 1 else return 0 end";

export async function compareAndSetStoreJson(storeName: string, key: string, value: unknown, version: string | null, localDir: string): Promise<boolean> {
  const config = netlifyStoreConfig();
  if (isNetlifyRuntime() || config) {
    // SDK 10.7.6 setJSON drops conditions on the wire; set forwards them correctly.
    const result = await withNetlifyStore(storeName, true, store => store.set(key, JSON.stringify(value), version === null ? { onlyIfNew: true } : { onlyIfMatch: version }), config);
    return result.modified;
  }
  if (hasUpstashConfig()) {
    const result = await upstashCommand("EVAL", CAS_SCRIPT, "1", scopedKey(storeName, key), version === null ? "missing" : "exists", version ?? "", JSON.stringify(value));
    if (result !== 0 && result !== 1) throw new RequestDeadlineError(503, "账户变更结果尚未确认，请刷新账户核对后重试。", "STORE_WRITE_UNCONFIRMED");
    return result === 1;
  }
  if (isVercelRuntime()) assertPersistentStoreOnVercel();
  const target = localPath(localDir, key);
  await fs.mkdir(path.dirname(target), { recursive: true });
  // Local development runs in one Node process. Distributed production updates
  // use the provider CAS above; a process crash cannot leave a permanent lock.
  const previous = localWrites.get(target) || Promise.resolve();
  let release: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  const queued = previous.then(() => held);
  localWrites.set(target, queued);
  await previous;
  const temporary = `${target}.${crypto.randomUUID()}.tmp`;
  try {
    const latest = await readVersionedStoreJson(storeName, key, localDir);
    if (latest.version !== version) return false;
    await fs.writeFile(temporary, JSON.stringify(value), "utf8");
    await fs.rename(temporary, target);
    return true;
  } finally {
    await fs.rm(temporary, { force: true });
    release!();
    if (localWrites.get(target) === queued) localWrites.delete(target);
  }
}

export async function updateStoreJson<T>(storeName: string, key: string, localDir: string, update: (value: T | null) => T | Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < 8; attempt++) {
    const current = await readVersionedStoreJson<T>(storeName, key, localDir);
    const next = await update(current.value);
    if (await compareAndSetStoreJson(storeName, key, next, current.version, localDir)) return next;
  }
  throw new RequestDeadlineError(409, "数据已被其他请求更新，请刷新后重试。", "STORE_CONFLICT");
}
