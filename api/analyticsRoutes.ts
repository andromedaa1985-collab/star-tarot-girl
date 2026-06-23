import type express from "express";
import crypto from "crypto";
import path from "path";
import { mkdir, readFile, writeFile } from "fs/promises";
import { getDeployStore, getStore } from "@netlify/blobs";

const ANALYTICS_STORE_NAME = "astro-analytics";
const LOCAL_ANALYTICS_DIR = ".data/analytics";
const LOCAL_ANALYTICS_FILE = "events.jsonl";
const MAX_SUMMARY_EVENTS = 5000;

const ALLOWED_EVENTS = new Set([
  "session_start",
  "tarot_draw",
  "daily_fortune_draw",
  "daily_deep_impression",
  "daily_deep_paywall_open",
  "daily_deep_plan_click",
  "daily_deep_generate",
  "daily_check_in",
  "daily_reward",
  "return_reward",
  "trial_start",
  "upgrade_prompt",
  "diary_save",
  "diary_review",
  "guardian_letter",
  "guardian_chat",
  "simulation_run",
]);

type AnalyticsEvent = {
  id: string;
  event: string;
  timestamp: number;
  day: string;
  clientHash: string;
  meta?: Record<string, string | number | boolean | null>;
};

export function registerAnalyticsRoutes(app: express.Express) {
  app.post("/api/analytics/event", async (req, res) => {
    try {
      const event = sanitizeAnalyticsEvent(req.body);
      if (!event) {
        return res.status(400).json({ error: { message: "无效的统计事件。" } });
      }
      const persisted = await writeAnalyticsEvent(event);
      res.setHeader("Cache-Control", "no-store");
      res.json({ ok: true, persisted });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message || "统计事件写入失败" } });
    }
  });

  app.get("/api/analytics/summary", async (req, res) => {
    try {
      const token = process.env.ANALYTICS_ADMIN_TOKEN?.trim();
      const providedToken = String(req.query.token || req.get("x-analytics-token") || "").trim();
      const isLocal = ["localhost", "127.0.0.1", "::1"].some((host) => req.get("host")?.includes(host));
      if (token && providedToken !== token) {
        return res.status(401).json({ error: { message: "统计后台 token 不正确。" } });
      }
      if (!token && !isLocal) {
        return res.status(403).json({ error: { message: "请先配置 ANALYTICS_ADMIN_TOKEN 后再查看线上统计。" } });
      }

      const events = await readAnalyticsEvents();
      res.setHeader("Cache-Control", "no-store");
      res.json(buildAnalyticsSummary(events));
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message || "统计汇总读取失败" } });
    }
  });
}

function sanitizeAnalyticsEvent(input: any): AnalyticsEvent | null {
  const event = typeof input?.event === "string" ? input.event : "";
  if (!ALLOWED_EVENTS.has(event)) return null;

  const timestamp = Number.isFinite(Number(input?.timestamp)) ? Number(input.timestamp) : Date.now();
  const id = typeof input?.id === "string" && input.id ? input.id.slice(0, 160) : `${event}-${timestamp}`;
  const clientId = typeof input?.clientId === "string" && input.clientId ? input.clientId.slice(0, 160) : "anonymous";
  const day = new Date(timestamp).toISOString().slice(0, 10);
  const meta = sanitizeMeta(input?.meta);

  return {
    id,
    event,
    timestamp,
    day,
    clientHash: hashClientId(clientId),
    meta,
  };
}

function sanitizeMeta(input: any): AnalyticsEvent["meta"] {
  if (!input || typeof input !== "object") return {};
  const result: AnalyticsEvent["meta"] = {};
  for (const [key, rawValue] of Object.entries(input).slice(0, 12)) {
    const safeKey = key.slice(0, 40);
    if (typeof rawValue === "string") result[safeKey] = rawValue.slice(0, 80);
    else if (typeof rawValue === "number" && Number.isFinite(rawValue)) result[safeKey] = rawValue;
    else if (typeof rawValue === "boolean") result[safeKey] = rawValue;
    else if (rawValue === null) result[safeKey] = null;
  }
  return result;
}

function hashClientId(clientId: string) {
  const salt = process.env.ANALYTICS_HASH_SALT || "astro-rail-local";
  return crypto.createHash("sha256").update(`${salt}:${clientId}`).digest("hex").slice(0, 18);
}

async function writeAnalyticsEvent(event: AnalyticsEvent) {
  try {
    const store = getAnalyticsStore();
    await store.setJSON(`events/${event.day}/${event.timestamp}-${event.id}.json`, event);
    return true;
  } catch {
    try {
      await writeLocalAnalyticsEvent(event);
      return true;
    } catch (localError: any) {
      console.warn("Analytics event skipped because no writable analytics store is available:", localError?.message || localError);
      return false;
    }
  }
}

async function readAnalyticsEvents(): Promise<AnalyticsEvent[]> {
  try {
    const store = getAnalyticsStore();
    const listed = await store.list({ prefix: "events/" });
    const keys = listed.blobs
      .map((blob) => blob.key)
      .sort()
      .slice(-MAX_SUMMARY_EVENTS);
    const events = await Promise.all(keys.map((key) => store.get(key, { type: "json" })));
    return events.filter(isAnalyticsEvent);
  } catch {
    return readLocalAnalyticsEvents();
  }
}

function getAnalyticsStore() {
  const isProduction = process.env.CONTEXT === "production" || process.env.NODE_ENV === "production";
  return isProduction
    ? getStore({ name: `${ANALYTICS_STORE_NAME}-prod`, consistency: "strong" })
    : getDeployStore({ name: `${ANALYTICS_STORE_NAME}-dev`, consistency: "strong" });
}

async function writeLocalAnalyticsEvent(event: AnalyticsEvent) {
  const dir = path.resolve(process.cwd(), LOCAL_ANALYTICS_DIR);
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, LOCAL_ANALYTICS_FILE);
  let current = "";
  try {
    current = await readFile(file, "utf8");
  } catch {
    current = "";
  }
  const lines = current.split(/\r?\n/).filter(Boolean).slice(-(MAX_SUMMARY_EVENTS - 1));
  lines.push(JSON.stringify(event));
  await writeFile(file, `${lines.join("\n")}\n`, "utf8");
}

async function readLocalAnalyticsEvents() {
  const file = path.resolve(process.cwd(), LOCAL_ANALYTICS_DIR, LOCAL_ANALYTICS_FILE);
  try {
    const raw = await readFile(file, "utf8");
    return raw
      .split(/\r?\n/)
      .filter(Boolean)
      .slice(-MAX_SUMMARY_EVENTS)
      .map((line) => JSON.parse(line))
      .filter(isAnalyticsEvent);
  } catch {
    return [];
  }
}

function isAnalyticsEvent(value: any): value is AnalyticsEvent {
  return Boolean(
    value &&
      typeof value.id === "string" &&
      typeof value.event === "string" &&
      typeof value.timestamp === "number" &&
      typeof value.day === "string" &&
      typeof value.clientHash === "string",
  );
}

function buildAnalyticsSummary(events: AnalyticsEvent[]) {
  const sorted = [...events].sort((a, b) => a.timestamp - b.timestamp);
  const uniqueUsers = new Set(sorted.map((event) => event.clientHash));
  const countsByEvent = countBy(sorted, (event) => event.event);
  const planClicks = countBy(
    sorted.filter((event) => event.event === "daily_deep_plan_click"),
    (event) => String(event.meta?.planId || "unknown"),
  );
  const dailyRows = buildDailyRows(sorted);
  const dailyFortuneDraws = countsByEvent.daily_fortune_draw || 0;
  const deepImpressions = countsByEvent.daily_deep_impression || 0;
  const deepPaywallOpens = countsByEvent.daily_deep_paywall_open || 0;
  const deepPlanClicks = countsByEvent.daily_deep_plan_click || 0;
  const deepGenerates = countsByEvent.daily_deep_generate || 0;

  return {
    updatedAt: new Date().toISOString(),
    totalEvents: sorted.length,
    uniqueUsers: uniqueUsers.size,
    countsByEvent,
    funnel: {
      dailyFortuneDraws,
      deepImpressions,
      deepPaywallOpens,
      deepPlanClicks,
      deepGenerates,
      impressionRate: rate(deepImpressions, dailyFortuneDraws),
      paywallOpenRate: rate(deepPaywallOpens, deepImpressions),
      planClickRate: rate(deepPlanClicks, deepPaywallOpens || deepImpressions),
      deepGenerateRate: rate(deepGenerates, deepImpressions),
    },
    planClicks,
    dailyRows,
  };
}

function buildDailyRows(events: AnalyticsEvent[]) {
  const byDay = new Map<string, AnalyticsEvent[]>();
  events.forEach((event) => {
    byDay.set(event.day, [...(byDay.get(event.day) || []), event]);
  });

  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-14)
    .map(([day, dayEvents]) => ({
      day,
      users: new Set(dayEvents.map((event) => event.clientHash)).size,
      sessions: dayEvents.filter((event) => event.event === "session_start").length,
      dailyFortuneDraws: dayEvents.filter((event) => event.event === "daily_fortune_draw").length,
      deepImpressions: dayEvents.filter((event) => event.event === "daily_deep_impression").length,
      deepPaywallOpens: dayEvents.filter((event) => event.event === "daily_deep_paywall_open").length,
      deepPlanClicks: dayEvents.filter((event) => event.event === "daily_deep_plan_click").length,
      deepGenerates: dayEvents.filter((event) => event.event === "daily_deep_generate").length,
    }));
}

function countBy<T>(items: T[], getKey: (item: T) => string) {
  return items.reduce<Record<string, number>>((acc, item) => {
    const key = getKey(item);
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function rate(value: number, base: number) {
  if (!base) return 0;
  return Number(((value / base) * 100).toFixed(1));
}
