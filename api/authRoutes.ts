import type { Express, Request, Response } from "express";
import crypto from "crypto";
import { readStoreJson, writeStoreJson } from "./jsonStore.js";

const ACCOUNT_STORE_NAME = "astro-rail-accounts";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const LOCAL_STORE_DIR = ".data/accounts";

export type UserRecord = {
  id: string;
  email: string;
  displayName: string;
  passwordHash: string;
  salt: string;
  createdAt: string;
  updatedAt: string;
};

type EmailIndex = {
  userId: string;
};

type CloudArchive = {
  userId: string;
  archive: any;
  updatedAt: string;
  recordCount: number;
};

type TokenPayload = {
  userId: string;
  email: string;
  exp: number;
};

function normalizeEmail(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function normalizeDisplayName(value: unknown, fallback: string) {
  if (typeof value !== "string") return fallback;
  const displayName = value.trim().slice(0, 24);
  return displayName || fallback;
}

function validatePassword(value: unknown) {
  if (typeof value !== "string" || value.length < 8) {
    throw new Error("密码至少需要 8 位。");
  }
  if (value.length > 72) {
    throw new Error("密码太长了，请控制在 72 位以内。");
  }
  return value;
}

function validateEmail(email: string) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("请输入有效的邮箱地址。");
  }
}

function getSessionSecret() {
  const secret = process.env.AUTH_SESSION_SECRET?.trim() || process.env.SESSION_SECRET?.trim();
  if (secret) return secret;

  const derivationSeed = process.env.DEEPSEEK_API_KEY?.trim();
  if (derivationSeed && derivationSeed.length >= 24) {
    return crypto
      .createHash("sha256")
      .update(`astro-rail-session:${derivationSeed}`, "utf8")
      .digest("hex");
  }

  if (process.env.NODE_ENV === "production" || process.env.NETLIFY === "true") {
    throw accountServiceError();
  }
  return "dev-only-astro-rail-session-secret";
}

function sha256(value: string) {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

function base64url(input: string | Buffer) {
  return Buffer.from(input).toString("base64url");
}

function signToken(payload: TokenPayload) {
  const body = base64url(JSON.stringify(payload));
  const signature = crypto.createHmac("sha256", getSessionSecret()).update(body).digest("base64url");
  return `${body}.${signature}`;
}

function verifyToken(token: string): TokenPayload {
  const parts = token.split(".");
  const [body, signature] = parts;
  if (parts.length !== 2 || !body || !signature) throw authError("登录状态已失效，请重新登录。");

  const expected = crypto.createHmac("sha256", getSessionSecret()).update(body).digest("base64url");
  const expectedBuffer = Buffer.from(expected);
  const signatureBuffer = Buffer.from(signature);
  if (expectedBuffer.length !== signatureBuffer.length || !crypto.timingSafeEqual(expectedBuffer, signatureBuffer)) {
    throw authError("登录状态已失效，请重新登录。");
  }

  let payload: TokenPayload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as TokenPayload;
  } catch {
    throw authError("登录状态已失效，请重新登录。");
  }
  if (!payload || typeof payload.userId !== "string" || !payload.userId || typeof payload.email !== "string" || !payload.email || !Number.isFinite(payload.exp) || payload.exp <= Date.now()) {
    throw authError("登录状态已失效，请重新登录。");
  }
  return payload;
}

function createSession(user: UserRecord) {
  return signToken({
    userId: user.id,
    email: user.email,
    exp: Date.now() + SESSION_TTL_MS,
  });
}

function publicUser(user: UserRecord, archive?: CloudArchive | null) {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    createdAt: user.createdAt,
    archiveUpdatedAt: archive?.updatedAt || null,
    archiveRecordCount: archive?.recordCount || 0,
  };
}

async function hashPassword(password: string, salt = crypto.randomBytes(16).toString("hex")) {
  const derived = await new Promise<Buffer>((resolve, reject) => {
    crypto.scrypt(password, salt, 64, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
  return { salt, passwordHash: derived.toString("hex") };
}

async function verifyPassword(password: string, user: UserRecord) {
  const { passwordHash } = await hashPassword(password, user.salt);
  const expected = Buffer.from(user.passwordHash, "hex");
  const actual = Buffer.from(passwordHash, "hex");
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

async function readJson<T>(key: string): Promise<T | null> {
  try {
    return await readStoreJson<T>(ACCOUNT_STORE_NAME, key, LOCAL_STORE_DIR);
  } catch {
    throw accountServiceError();
  }
}

async function writeJson(key: string, value: unknown) {
  try {
    await writeStoreJson(ACCOUNT_STORE_NAME, key, value, LOCAL_STORE_DIR);
  } catch (error: any) {
    throw accountServiceError(error?.code === "STORE_WRITE_UNCONFIRMED"
      ? "账户变更结果尚未确认，请刷新账户核对后再操作。"
      : undefined);
  }
}

function emailIndexKey(email: string) {
  return `email-index/${sha256(email)}`;
}

function userKey(userId: string) {
  return `users/${userId}`;
}

function archiveKey(userId: string) {
  return `archives/${userId}`;
}

async function findUserByEmail(email: string) {
  const index = await readJson<EmailIndex>(emailIndexKey(email));
  if (!index?.userId) return null;
  return readJson<UserRecord>(userKey(index.userId));
}

function authError(message = "请先登录账户。") {
  const error = new Error(message) as Error & { status: number; code: string };
  error.status = 401;
  error.code = "ACCOUNT_SESSION_INVALID";
  return error;
}

function accountServiceError(message = "账户服务暂时不可用，请稍后再试。") {
  const error = new Error(message) as Error & { status: number; code: string };
  error.status = 503;
  error.code = "ACCOUNT_SERVICE_UNAVAILABLE";
  return error;
}

export async function requireUser(req: Request) {
  const header = req.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : "";
  if (!token) throw authError("请先登录账户。");

  const payload = verifyToken(token);
  const user = await readJson<UserRecord>(userKey(payload.userId));
  if (!user) throw authError("账户不存在，请重新登录。");
  return user;
}

export async function getOptionalUser(req: Request) {
  try {
    return await requireUser(req);
  } catch (error: any) {
    if (error?.code === "ACCOUNT_SESSION_INVALID") return null;
    throw error;
  }
}

function getArchiveRecordCount(archive: any) {
  const data = archive?.data || {};
  const keys = ["profiles", "tarotReadings", "diaryEntries", "simulationHistory", "guardianMessages"];
  return keys.reduce((total, key) => total + (Array.isArray(data[key]) ? data[key].length : 0), 0);
}

function validateArchive(archive: any) {
  if (!archive || typeof archive !== "object" || archive.format !== "astro-rail-local-archive" || typeof archive.data !== "object") {
    throw new Error("云端存档格式不正确。");
  }
  return archive;
}

function sendError(res: Response, error: any, status = 400) {
  res.status(Number(error?.status) || status).json({
    error: {
      message: error?.message || "请求失败，请稍后再试。",
      ...(error?.code ? { code: error.code } : {}),
    },
  });
}

export function registerAuthRoutes(app: Express) {
  app.post("/api/auth/register", async (req, res) => {
    try {
      const email = normalizeEmail(req.body?.email);
      validateEmail(email);
      const password = validatePassword(req.body?.password);
      const existing = await findUserByEmail(email);
      if (existing) throw new Error("这个邮箱已经注册过了，请直接登录。");

      const userId = crypto.randomUUID();
      const now = new Date().toISOString();
      const { salt, passwordHash } = await hashPassword(password);
      const user: UserRecord = {
        id: userId,
        email,
        displayName: normalizeDisplayName(req.body?.displayName, email.split("@")[0] || "星轨旅人"),
        passwordHash,
        salt,
        createdAt: now,
        updatedAt: now,
      };

      await writeJson(userKey(userId), user);
      await writeJson(emailIndexKey(email), { userId });

      res.json({
        token: createSession(user),
        user: publicUser(user),
      });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    try {
      const email = normalizeEmail(req.body?.email);
      validateEmail(email);
      const password = validatePassword(req.body?.password);
      const user = await findUserByEmail(email);
      if (!user || !(await verifyPassword(password, user))) {
        throw new Error("邮箱或密码不正确。");
      }

      const archive = await readJson<CloudArchive>(archiveKey(user.id));
      res.json({
        token: createSession(user),
        user: publicUser(user, archive),
      });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.get("/api/auth/me", async (req, res) => {
    try {
      const user = await requireUser(req);
      const archive = await readJson<CloudArchive>(archiveKey(user.id));
      res.setHeader("Cache-Control", "no-store");
      res.json({ user: publicUser(user, archive) });
    } catch (error) {
      sendError(res, error, 503);
    }
  });

  app.post("/api/auth/archive", async (req, res) => {
    try {
      const user = await requireUser(req);
      const archive = validateArchive(req.body?.archive);
      const record: CloudArchive = {
        userId: user.id,
        archive,
        updatedAt: new Date().toISOString(),
        recordCount: getArchiveRecordCount(archive),
      };
      await writeJson(archiveKey(user.id), record);
      res.json({
        archiveUpdatedAt: record.updatedAt,
        archiveRecordCount: record.recordCount,
      });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.get("/api/auth/archive", async (req, res) => {
    try {
      const user = await requireUser(req);
      const archive = await readJson<CloudArchive>(archiveKey(user.id));
      res.setHeader("Cache-Control", "no-store");
      if (!archive) {
        return res.status(404).json({ error: { message: "这个账户还没有云端存档。" } });
      }
      res.json({
        archive: archive.archive,
        archiveUpdatedAt: archive.updatedAt,
        archiveRecordCount: archive.recordCount,
      });
    } catch (error) {
      sendError(res, error, 503);
    }
  });
}
