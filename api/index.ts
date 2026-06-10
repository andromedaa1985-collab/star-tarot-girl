import express from "express";
import dotenv from "dotenv";
import crypto from "crypto";
import { search } from "duck-duck-scrape";
import { registerAnalyticsRoutes } from "./analyticsRoutes.js";
import { registerAuthRoutes } from "./authRoutes.js";
import { registerPaymentRoutes } from "./paymentRoutes.js";
import { prepareChatEntitlementCharge, registerEntitlementRoutes } from "./entitlementRoutes.js";

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

const relationshipInvites = new Map<string, { profile: any; createdAt: string; expiresAt: number }>();
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

app.post("/api/relationship/invites", (req, res) => {
  try {
    pruneRelationshipInvites();
    const profile = sanitizeRelationshipProfile(req.body?.profile);
    if (!profile) {
      return res.status(400).json({ error: { message: "请先保存一份完整档案，再生成邀请链接。" } });
    }

    const token = crypto.randomBytes(18).toString("base64url");
    const expiresAt = Date.now() + RELATIONSHIP_INVITE_TTL_MS;
    relationshipInvites.set(token, {
      profile,
      createdAt: new Date().toISOString(),
      expiresAt,
    });

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

app.get("/api/relationship/invites/:token", (req, res) => {
  pruneRelationshipInvites();
  const invite = relationshipInvites.get(req.params.token);
  res.setHeader("Cache-Control", "no-store");
  if (!invite) {
    return res.status(404).json({ error: { message: "邀请链接已失效，请让对方重新生成一次。" } });
  }
  res.json({ profile: invite.profile, expiresAt: new Date(invite.expiresAt).toISOString() });
});

app.post("/api/deepseek/chat", async (req, res) => {
  try {
    const apiKey = requireEnv("DEEPSEEK_API_KEY", "DeepSeek API Key");
    if (isDailyDeepBypassRequest(req)) {
      return res.status(402).json({
        error: {
          message: "今日深解需要先解锁或开通 Plus，请通过正式深解入口继续。",
        },
      });
    }
    const entitlementCharge = await prepareChatEntitlementCharge(req);
    const messages = [...(req.body.messages ?? [])];
    if (req.body.isInternetMode) {
      const lastUserMsg = messages[messages.length - 1];
      if (lastUserMsg?.role === "user" && lastUserMsg.content) {
        try {
          const searchResults = await search(lastUserMsg.content);
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
      ...req.body,
      messages,
    };
    delete bodyPayload.isInternetMode;
    delete bodyPayload.entitlement;
    const response = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify(bodyPayload)
    });
    const data = await response.json();
    if (response.ok && !data?.error && entitlementCharge) {
      data.entitlement = await entitlementCharge.commit();
    }
    res.status(response.status).json(data);
  } catch (error: any) {
    sendApiError(res, error);
  }
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

function pruneRelationshipInvites() {
  const now = Date.now();
  for (const [token, invite] of relationshipInvites.entries()) {
    if (invite.expiresAt <= now) relationshipInvites.delete(token);
  }
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
      message: error.message || "接口请求失败"
    }
  });
}

export { app };

export default function handler(req: express.Request, res: express.Response) {
  return app(req, res);
}
