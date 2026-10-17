import express from "express";
import dotenv from "dotenv";
import crypto from "crypto";
import { search } from "duck-duck-scrape";
import { registerAnalyticsRoutes } from "./analyticsRoutes.js";
import { requireUser, registerAuthRoutes } from "./authRoutes.js";
import { registerPaymentRoutes } from "./paymentRoutes.js";
import { prepareChatEntitlementCharge, registerEntitlementRoutes } from "./entitlementRoutes.js";
import { CHAT_UPSTREAM_TIMEOUT_MS, requestChatCompletion, runOptionalSearchWithDeadline } from "./_chatProxy.js";
import { readStoreJson, updateStoreJson } from "./jsonStore.js";
import { CHAT_REQUEST_TOTAL_TIMEOUT_MS, runWithRequestDeadline } from "./_requestDeadline.js";

dotenv.config();

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: false, limit: "5mb" }));

function isAllowedCorsOrigin(origin: string) {
  if (
    origin === "capacitor://localhost" ||
    origin === "ionic://localhost" ||
    origin === "https://star-tarot-girl.vercel.app" ||
    origin === "https://zjhrail.xyz"
  ) {
    return true;
  }
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin);
}

app.use((req, res, next) => {
  const origin = req.get("origin");
  if (origin && isAllowedCorsOrigin(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Max-Age", "86400");
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  next();
});

registerAuthRoutes(app);
registerPaymentRoutes(app);
registerEntitlementRoutes(app);
registerAnalyticsRoutes(app);

type RelationshipInvite = { profile: any; ownerId: string; createdAt: string; expiresAt: number };
const RELATIONSHIP_INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.get("/api/time", (_req, res) => {
  const now = new Date();
  res.setHeader("Cache-Control", "no-store");
  res.json({
    now: now.toISOString(),
    timestampMs: now.getTime(),
    timezone: "Asia/Shanghai",
  });
});

app.post("/api/relationship/invites", async (req, res) => {
  try {
    const user = await requireUser(req);
    const profile = sanitizeRelationshipProfile(req.body?.profile);
    if (!profile) {
      return res.status(400).json({ error: { message: "请先保存一份完整档案，再生成邀请链接。" } });
    }

    const token = crypto.randomBytes(18).toString("base64url");
    const expiresAt = Date.now() + RELATIONSHIP_INVITE_TTL_MS;
    await updateStoreJson<any>("astro-invite-budgets", user.id, ".data/invite-budgets", current => {
      const date = new Date().toISOString().slice(0, 10);
      const count = current?.date === date ? current.count : 0;
      if (count >= 10) throw Object.assign(new Error("今天创建的邀请较多，请明天再试。"), { status: 429 });
      return { date, count: count + 1 };
    });
    await updateStoreJson<RelationshipInvite>("astro-relationship-invites", token, ".data/relationship-invites", () => ({ profile, ownerId: user.id, createdAt: new Date().toISOString(), expiresAt }));

    res.setHeader("Cache-Control", "no-store");
    res.json({
      token,
      inviteUrl: buildRelationshipInviteUrl(req, token),
      expiresAt: new Date(expiresAt).toISOString(),
    });
  } catch (error: any) {
    sendApiError(res, error);
  }
});

app.get("/api/relationship/invites/:token", async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  try {
    const token = req.params.token;
    if (!/^[A-Za-z0-9_-]{24}$/.test(token)) return res.status(404).json({ error: { message: "邀请链接无效。" } });
    const invite = await readStoreJson<RelationshipInvite>("astro-relationship-invites", token, ".data/relationship-invites");
    if (!invite || invite.expiresAt <= Date.now()) return res.status(404).json({ error: { message: "邀请链接已失效，请让对方重新生成一次。" } });
    res.json({ profile: invite.profile, expiresAt: new Date(invite.expiresAt).toISOString() });
  } catch (error: any) { sendApiError(res, error); }
});

app.post("/api/deepseek/chat", async (req, res) => {
  const requestStartedAt = Date.now();
  const controller = new AbortController();
  const cancelAbortedRequest = () => controller.abort();
  const cancelDisconnectedResponse = () => { if (!res.writableEnded) controller.abort(); };
  // IncomingMessage.close also occurs when a normal request body finishes.
  // Only an aborted body or an unfinished response closing cancels upstream.
  req.once("aborted", cancelAbortedRequest);
  res.once("close", cancelDisconnectedResponse);
  return runWithRequestDeadline({ expiresAt: requestStartedAt + CHAT_REQUEST_TOTAL_TIMEOUT_MS, signal: controller.signal }, async () => {
  let entitlementCharge: Awaited<ReturnType<typeof prepareChatEntitlementCharge>>;
  const releaseCharge = async () => {
    if (!entitlementCharge) return;
    const charge = entitlementCharge;
    await runWithRequestDeadline({ expiresAt: Math.min(requestStartedAt + CHAT_REQUEST_TOTAL_TIMEOUT_MS, Date.now() + 3000) }, () => charge.release());
    entitlementCharge = null;
  };
  try {
    const apiKey = requireEnv("DEEPSEEK_API_KEY", "DeepSeek API Key");
    if (isDailyDeepBypassRequest(req)) {
      return res.status(402).json({
        error: {
          message: "今日深解需要先解锁或开通 Plus，请通过正式深解入口继续。",
        },
      });
    }
    const validatedPayload = validateChatPayload(req.body);
    entitlementCharge = await prepareChatEntitlementCharge(req);
    const messages = [...(req.body.messages ?? [])];
    if (req.body.isInternetMode) {
      const lastUserMsg = messages[messages.length - 1];
      if (lastUserMsg?.role === "user" && lastUserMsg.content) {
        try {
          const searchResults = await runOptionalSearchWithDeadline(
            () => search(lastUserMsg.content, undefined, { open_timeout: 1500, response_timeout: 1500, read_timeout: 1500 }),
            controller.signal,
            Math.min(4_000, Math.max(0, CHAT_UPSTREAM_TIMEOUT_MS - (Date.now() - requestStartedAt))),
          );
          if (searchResults?.results?.length) {
            const topResults = searchResults.results
              .slice(0, 5)
              .map((item) => `- ${item.title}: ${item.description}`)
              .join("\n");
            if (messages[0]?.role === "system") {
              messages[0].content += `\n\n【实时联网参考】\n${topResults}`;
            }
          }
        } catch (searchError) {
          console.error("Internet mode search failed:", searchError);
        }
      }
    }
    const bodyPayload = {
      ...validatedPayload,
      thinking: { type: "disabled" },
      messages,
    };

    if (controller.signal.aborted) return;
    const { status, data } = await requestChatCompletion(bodyPayload, apiKey, {
      signal: controller.signal,
      timeoutMs: CHAT_UPSTREAM_TIMEOUT_MS - (Date.now() - requestStartedAt),
    });
    if (controller.signal.aborted) return;
    if (status >= 200 && status < 300 && !data?.error && entitlementCharge) {
      data.entitlement = await entitlementCharge.commit();
      entitlementCharge = null;
    } else { await releaseCharge(); }
    if (!controller.signal.aborted) res.status(status).json(data);
  } catch (error: any) {
    try { await releaseCharge(); } catch (cleanupError) { error = cleanupError; }
    if (!controller.signal.aborted && !res.destroyed) sendApiError(res, error);
  } finally {
    if (entitlementCharge) {
      try { await releaseCharge(); }
      catch (error) { console.error("AI reservation cleanup deferred until expiry", error); }
    }
    req.removeListener("aborted", cancelAbortedRequest);
    res.removeListener("close", cancelDisconnectedResponse);
  }
  });
});

// Keep API errors as JSON in every host, including Vercel and Netlify, where
// server.ts (and its SPA fallback) does not run.
app.use("/api", (_req, res) => {
  res.status(404).json({ error: { message: "接口不存在。" } });
});
app.use((error: any, _req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (res.headersSent) return next(error);
  const status = Number(error?.status) || 500;
  res.status(status).json({ error: { message: status === 400 ? "请求 JSON 格式无效。" : status === 413 ? "请求内容过大。" : "接口请求失败。" } });
});

const DAILY_DEEP_API_STRONG_KEYWORDS = ["今日深解", "深解", "深度解读", "深度分析", "完整解读", "完整分析"];
const DAILY_DEEP_API_DETAIL_KEYWORDS = ["讲细", "讲详细", "详细讲", "展开", "细说", "深入", "多讲一点", "再讲一点", "更完整"];
const DAILY_DEEP_API_SUBJECT_KEYWORDS = ["今日运势", "每日运势", "今天", "今日", "这张牌", "这张", "牌面", "塔罗", "运势", "刚才"];

function includesAnyKeyword(text: string, keywords: string[]) {
  const normalized = text.toLowerCase();
  return keywords.some((keyword) => normalized.includes(keyword.toLowerCase()));
}

function isDailyDeepIntent(text: string) {
  const normalized = text.trim();
  if (!normalized) return false;
  if (includesAnyKeyword(normalized, DAILY_DEEP_API_STRONG_KEYWORDS)) return true;
  return includesAnyKeyword(normalized, DAILY_DEEP_API_DETAIL_KEYWORDS) && includesAnyKeyword(normalized, DAILY_DEEP_API_SUBJECT_KEYWORDS);
}

function getContentText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.map((part) => {
      if (typeof part === "string") return part;
      if (part && typeof part === "object" && "text" in part) return String((part as { text?: unknown }).text ?? "");
      return "";
    }).join("\n");
  }
  return "";
}

function getClientUserIntents(messages: unknown[]) {
  const intents: string[] = [];
  const intentPattern = /(?:用户这次追问|用户问题|用户原始输入)：([^\n]+)/g;
  for (const message of messages) {
    if (!message || typeof message !== "object") continue;
    const content = getContentText((message as { content?: unknown }).content);
    for (const match of content.matchAll(intentPattern)) {
      const intent = match[1]?.trim();
      if (intent) intents.push(intent);
    }
  }
  return intents;
}

function isDailyDeepBypassRequest(req: express.Request) {
  if (req.body?.entitlement?.type !== "tarot_message") return false;
  const messages = Array.isArray(req.body?.messages) ? req.body.messages : [];
  return getClientUserIntents(messages).some(isDailyDeepIntent);
}

function validateChatPayload(body: any) {
  if (!Array.isArray(body?.messages) || body.messages.length > 60) throw Object.assign(new Error("消息格式无效或消息过多。"), { status: 400 });
  if (JSON.stringify(body.messages).length > 60_000) throw Object.assign(new Error("消息过长，请缩短后重试。"), { status: 413 });
  for (const message of body.messages) {
    if (!message || !["system", "user", "assistant"].includes(message.role) || typeof message.content !== "string") throw Object.assign(new Error("消息格式无效。"), { status: 400 });
  }
  const operation = body.entitlement?.type || "tarot_message";
  const limits: Record<string, number> = { tarot_message: 760, daily_deep: 1400, bazi: 1400, guardian: 420, simulator: 1100, diary_review: 760 };
  const model = operation === "tarot_message" ? "deepseek-v4-flash" : "deepseek-v4-pro";
  const maximum = limits[operation] || 760;
  const maxTokens = Number(body.max_tokens);
  return {
    model,
    messages: body.messages,
    max_tokens: Number.isFinite(maxTokens) ? Math.min(maximum, Math.max(1, Math.floor(maxTokens))) : maximum,
    temperature: Math.min(1.5, Math.max(0, Number(body.temperature) || 0.7)),
    ...(body.response_format?.type === "json_object" ? { response_format: { type: "json_object" } } : {}),
  };
}

function requireEnv(name: string, label: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${label} 未配置。请在部署平台或本地 .env 里设置 ${name}。`);
  }
  return value;
}

function getPublicBaseUrl(req: express.Request) {
  const forwardedProto = req.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const forwardedHost = req.get("x-forwarded-host")?.split(",")[0]?.trim();
  return process.env.PUBLIC_BASE_URL || `${forwardedProto || req.protocol}://${forwardedHost || req.get("host")}`;
}

function buildRelationshipInviteUrl(req: express.Request, token: string) {
  const baseUrl = getPublicBaseUrl(req).replace(/\/$/, "");
  return `${baseUrl}/app/bazi?invite=${encodeURIComponent(token)}`;
}

function sanitizeRelationshipProfile(input: any) {
  const profile = input && typeof input === "object" ? input : {};
  const name = typeof profile.name === "string" ? profile.name.trim().slice(0, 24) : "";
  const birthDate = typeof profile.birthDate === "string" ? profile.birthDate.trim().slice(0, 10) : "";
  const birthTime = typeof profile.birthTime === "string" ? profile.birthTime.trim().slice(0, 5) : "";
  if (!name || !birthDate || !birthTime) return null;
  return {
    name,
    gender: profile.gender === "female" ? "female" : "male",
    birthDate,
    birthTime,
    birthLocation: typeof profile.birthLocation === "string" ? profile.birthLocation.trim().slice(0, 48) : "",
    currentLocation: typeof profile.currentLocation === "string" ? profile.currentLocation.trim().slice(0, 48) : "",
  };
}

function sendApiError(res: express.Response, error: Error) {
  res.status(Number((error as any)?.status) || 500).json({
    error: {
      message: error.message || "接口请求失败",
      ...((error as any)?.code ? { code: (error as any).code } : {}),
    }
  });
}

export { app };

export default function handler(req: express.Request, res: express.Response) {
  return app(req, res);
}
