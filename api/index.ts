import express from "express";
import dotenv from "dotenv";
import crypto from "crypto";
import { search } from "duck-duck-scrape";
import { registerAnalyticsRoutes } from "./analyticsRoutes.js";
import { registerAuthRoutes } from "./authRoutes.js";
import { registerPaymentRoutes } from "./paymentRoutes.js";

dotenv.config();

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: false, limit: "5mb" }));
registerAuthRoutes(app);
registerPaymentRoutes(app);
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
    const response = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify(bodyPayload)
    });
    res.status(response.status).json(await response.json());
  } catch (error: any) {
    sendApiError(res, error);
  }
});

app.post("/api/siliconflow/generate", async (req, res) => {
  try {
    const apiKey = requireEnv("IMAGE_API_KEY", "SiliconFlow Image API Key");
    const response = await fetch("https://api.siliconflow.cn/v1/images/generations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify(req.body)
    });
    res.status(response.status).json(await response.json());
  } catch (error: any) {
    sendApiError(res, error);
  }
});

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
  res.status(500).json({
    error: {
      message: error.message || "接口请求失败"
    }
  });
}

export { app };

export default function handler(req: express.Request, res: express.Response) {
  return app(req, res);
}
