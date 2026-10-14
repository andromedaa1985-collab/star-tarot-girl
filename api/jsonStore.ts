import fs from "fs/promises";
import path from "path";
import { RequestDeadlineError, runStorageOperation } from "./_requestDeadline.js";

let warnedVercelMissingPersistentStore = false;

function isNetlifyRuntime() {
  return process.env.NETLIFY === "true" || Boolean(process.env.NETLIFY_BLOBS_CONTEXT);
}

function isVercelRuntime() {
  return process.env.VERCEL === "1" || process.env.VERCEL === "true";
}

function hasUpstashConfig() {
  return Boolean(getRedisRestConfig().url && getRedisRestConfig().token);
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
    "Persistent JSON store is not configured on Vercel. Configure UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN for account archive persistence.",
  );
}

function assertPersistentStoreOnVercel() {
  if (!isVercelRuntime() || hasUpstashConfig()) return;
  throw new Error(
    "账户存档服务未配置持久化存储。请在 Vercel 配置 UPSTASH_REDIS_REST_URL 和 UPSTASH_REDIS_REST_TOKEN 后再使用账号与云端存档。",
  );
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
    if (command === "SET" && submitted) {
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

async function getNetlifyStore(storeName: string) {
  const { getStore } = await import("@netlify/blobs");
  return getStore(storeName);
}

function localPath(localDir: string, key: string) {
  return path.join(process.cwd(), localDir, `${key}.json`);
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
    const store = await getNetlifyStore(storeName);
    return await store.get(key, { type: "json" }) as T | null;
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
    const store = await getNetlifyStore(storeName);
    await store.setJSON(key, value);
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
