import fs from "fs/promises";
import path from "path";

const memoryStores = new Map<string, Map<string, unknown>>();

let warnedVercelMemoryFallback = false;

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

function getMemoryStore(storeName: string) {
  const existing = memoryStores.get(storeName);
  if (existing) return existing;
  const next = new Map<string, unknown>();
  memoryStores.set(storeName, next);
  return next;
}

function warnVercelMemoryFallback() {
  if (!isVercelRuntime() || warnedVercelMemoryFallback) return;
  warnedVercelMemoryFallback = true;
  console.warn(
    "Using in-memory JSON store on Vercel. Configure UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN for persistent login.",
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

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify([command, ...args]),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.error) {
    throw new Error(data?.error || `Upstash ${command} failed with ${response.status}`);
  }
  return data?.result;
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
    warnVercelMemoryFallback();
    return (getMemoryStore(storeName).get(key) as T | undefined) || null;
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
    warnVercelMemoryFallback();
    getMemoryStore(storeName).set(key, value);
    return;
  }

  await writeLocalJson(localDir, key, value);
}
