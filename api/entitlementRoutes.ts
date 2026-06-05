import type express from "express";
import crypto from "crypto";
import { requireUser } from "./authRoutes.js";
import { readStoreJson, writeStoreJson } from "./jsonStore.js";
import { getPaymentOrder } from "./paymentRoutes.js";
import { PAYMENT_PLANS, type PaymentPlan } from "../src/lib/pricing.js";
import {
  activatePlusDays,
  activateTesterAccess,
  addDailyFortuneDeepCredits,
  addFeatureUnlock,
  consumeDailyFortuneDeepCredit,
  defaultMembership,
  hasDailyFortuneDeepAccess,
  isPlusActive,
  isTesterActive,
  normalizeMembership,
  startPlusTrial,
  type MembershipState,
  type PremiumFeature,
} from "../src/lib/membership.js";

type EntitlementRecord = {
  userId: string;
  membership: MembershipState;
  energy: number;
  grantedOrderIds: string[];
  redeemedCodeHashes: string[];
  createdAt: string;
  updatedAt: string;
};

const ENTITLEMENT_STORE_NAME = "astro-entitlements";
const ENTITLEMENT_LOCAL_DIR = ".data/entitlements";
const DEFAULT_ENERGY = 5;

type ChatEntitlementType = "tarot_message" | "daily_deep";

export function registerEntitlementRoutes(app: express.Express) {
  app.get("/api/entitlements/me", async (req, res) => {
    try {
      const user = await requireUser(req);
      const record = await readEntitlementRecord(user.id);
      res.setHeader("Cache-Control", "no-store");
      res.json(toEntitlementSnapshot(record));
    } catch (error: any) {
      sendError(res, error, 401);
    }
  });

  app.post("/api/entitlements/trial", async (req, res) => {
    try {
      const user = await requireUser(req);
      const record = await readEntitlementRecord(user.id);
      const before = record.membership;
      const nextMembership = startPlusTrial(before);
      if (nextMembership === before || nextMembership.source !== "trial") {
        return res.status(409).json({ error: { message: "Plus 试用已经使用过了。" } });
      }

      record.membership = nextMembership;
      record.energy = Math.max(record.energy, 12);
      await saveEntitlementRecord(record);
      res.setHeader("Cache-Control", "no-store");
      res.json({
        ...toEntitlementSnapshot(record),
        message: "已开通 24 小时 Plus 试用，能量补到至少 12 点。",
      });
    } catch (error: any) {
      sendError(res, error, 401);
    }
  });

  app.post("/api/entitlements/redeem", async (req, res) => {
    try {
      const user = await requireUser(req);
      const code = normalizeRedeemCode(req.body?.code);
      if (!code) return res.status(400).json({ error: { message: "请输入兑换码。" } });

      const allowedCodes = getTesterRedeemCodes();
      if (allowedCodes.length === 0) {
        return res.status(503).json({ error: { message: "兑换码服务暂未配置。" } });
      }
      if (!allowedCodes.includes(code)) {
        return res.status(400).json({ error: { message: "兑换码无效，请检查后再试。" } });
      }

      const codeHash = hashCode(code);
      const record = await readEntitlementRecord(user.id);
      if (!record.redeemedCodeHashes.includes(codeHash)) {
        record.redeemedCodeHashes.push(codeHash);
      }
      record.membership = activateTesterAccess();
      record.energy = 999999;
      await saveEntitlementRecord(record);
      res.setHeader("Cache-Control", "no-store");
      res.json({
        ...toEntitlementSnapshot(record),
        message: "兑换成功：测试权限和能量已经由后端入账。",
      });
    } catch (error: any) {
      sendError(res, error);
    }
  });

  app.post("/api/entitlements/apply-order", async (req, res) => {
    try {
      const user = await requireUser(req);
      const orderId = typeof req.body?.orderId === "string" ? req.body.orderId.trim() : "";
      if (!orderId) return res.status(400).json({ error: { message: "缺少订单号。" } });

      const order = await getPaymentOrder(orderId);
      if (!order) {
        return res.status(404).json({ error: { message: "订单不存在或服务已重启，请重新下单。" } });
      }
      if (order.userId && order.userId !== user.id) {
        return res.status(403).json({ error: { message: "这笔订单不属于当前登录账号。" } });
      }
      if (order.status !== "paid") {
        res.setHeader("Cache-Control", "no-store");
        return res.status(202).json({ status: "waiting", order });
      }

      const record = await readEntitlementRecord(user.id);
      if (!record.grantedOrderIds.includes(order.id)) {
        const plan = getPlan(order.planId);
        applyPlanEntitlement(record, plan);
        record.grantedOrderIds.push(order.id);
        await saveEntitlementRecord(record);
      }

      res.setHeader("Cache-Control", "no-store");
      res.json({
        status: "paid",
        order,
        ...toEntitlementSnapshot(record),
        message: "权益已经由后端确认入账。",
      });
    } catch (error: any) {
      sendError(res, error, 401);
    }
  });
}

export async function prepareChatEntitlementCharge(req: express.Request) {
  const entitlement = req.body?.entitlement;
  if (!entitlement) return null;

  const type = entitlement.type as ChatEntitlementType;
  if (type !== "tarot_message" && type !== "daily_deep") {
    throw entitlementError("未知的权益校验类型。", 400);
  }

  const user = await requireUser(req);
  const record = await readEntitlementRecord(user.id);
  let shouldSave = false;

  if (!isTesterActive(record.membership) && !isPlusActive(record.membership)) {
    if (type === "daily_deep") {
      if (!hasDailyFortuneDeepAccess(record.membership)) {
        throw entitlementError("今日深解次数不足，请先解锁今日深解或开通 Plus。", 402);
      }
      record.membership = consumeDailyFortuneDeepCredit(record.membership);
      shouldSave = true;
    } else {
      const energyCost = Math.min(20, Math.max(1, normalizeEnergy(entitlement.energyCost ?? 1)));
      if (record.energy < energyCost) {
        throw entitlementError("能量不足，请先补充能量或开通 Plus。", 402);
      }
      record.energy -= energyCost;
      shouldSave = true;
    }
  }

  return {
    async commit() {
      if (shouldSave) {
        await saveEntitlementRecord(record);
      }
      return toEntitlementSnapshot(record);
    },
  };
}

async function readEntitlementRecord(userId: string) {
  const record = await readStoreJson<EntitlementRecord>(
    ENTITLEMENT_STORE_NAME,
    entitlementKey(userId),
    ENTITLEMENT_LOCAL_DIR,
  );
  return normalizeEntitlementRecord(userId, record);
}

async function saveEntitlementRecord(record: EntitlementRecord) {
  record.updatedAt = new Date().toISOString();
  await writeStoreJson(ENTITLEMENT_STORE_NAME, entitlementKey(record.userId), record, ENTITLEMENT_LOCAL_DIR);
}

function normalizeEntitlementRecord(userId: string, record: EntitlementRecord | null): EntitlementRecord {
  const now = new Date().toISOString();
  return {
    userId,
    membership: normalizeMembership(record?.membership || defaultMembership),
    energy: normalizeEnergy(record?.energy),
    grantedOrderIds: Array.isArray(record?.grantedOrderIds) ? record.grantedOrderIds.filter(Boolean) : [],
    redeemedCodeHashes: Array.isArray(record?.redeemedCodeHashes) ? record.redeemedCodeHashes.filter(Boolean) : [],
    createdAt: typeof record?.createdAt === "string" ? record.createdAt : now,
    updatedAt: typeof record?.updatedAt === "string" ? record.updatedAt : now,
  };
}

function normalizeEnergy(value: unknown) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return DEFAULT_ENERGY;
  return Math.max(0, Math.floor(numeric));
}

function entitlementKey(userId: string) {
  return `users/${userId}`;
}

function getPlan(planId?: string) {
  return PAYMENT_PLANS.find((item) => item.id === planId) || PAYMENT_PLANS[0];
}

function applyPlanEntitlement(record: EntitlementRecord, plan: PaymentPlan) {
  const entitlement = plan.entitlement as Record<string, any>;
  const energyBonus = normalizeEnergy(entitlement.energyBonus || 0);

  if (entitlement.type === "credit" && entitlement.credit === "daily_fortune_deep") {
    record.membership = addDailyFortuneDeepCredits(record.membership, Number(entitlement.count) || 1);
    record.energy += energyBonus;
    return;
  }

  if (entitlement.type === "report") {
    record.membership = addReportUnlock(record.membership, entitlement.report);
    record.energy += energyBonus;
    return;
  }

  if (entitlement.type === "bundle") {
    const reports = Array.isArray(entitlement.reports) ? entitlement.reports : [];
    record.membership = reports.reduce((membership, report) => addReportUnlock(membership, report), record.membership);
    if (entitlement.bundle === "bazi_archive") {
      record.membership = addFeatureUnlock(record.membership, "bazi");
    }
    record.energy += energyBonus;
    return;
  }

  if (entitlement.type === "membership") {
    record.membership = activatePlusDays(record.membership, Number(entitlement.days) || undefined);
    if (entitlement.plan === "plus") {
      const floor = normalizeEnergy(entitlement.energyFloor || 0);
      record.energy = Math.max(record.energy, floor);
    }
    return;
  }

  record.membership = activatePlusDays(record.membership);
}

function addReportUnlock(membership: MembershipState, report: unknown) {
  const feature = reportToFeature(report);
  return feature ? addFeatureUnlock(membership, feature) : membership;
}

function reportToFeature(report: unknown): PremiumFeature | null {
  if (report === "tarot") return "tarot_deep_report";
  if (report === "bazi") return "bazi";
  if (report === "relationship") return "relationship_report";
  if (report === "relationship_weekly") return "relationship_weekly";
  return null;
}

function toEntitlementSnapshot(record: EntitlementRecord) {
  return {
    membership: record.membership,
    energy: record.energy,
    updatedAt: record.updatedAt,
  };
}

function normalizeRedeemCode(value: unknown) {
  return typeof value === "string" ? value.trim().toUpperCase() : "";
}

function getTesterRedeemCodes() {
  return (process.env.ASTRORAIL_TESTER_REDEEM_CODES || process.env.TESTER_REDEEM_CODES || "")
    .split(",")
    .map((code) => normalizeRedeemCode(code))
    .filter(Boolean);
}

function hashCode(code: string) {
  return crypto.createHash("sha256").update(`astro-redeem:${code}`, "utf8").digest("hex");
}

function sendError(res: express.Response, error: any, status = 400) {
  res.status(Number(error?.status) || status).json({
    error: {
      message: error?.message || "请求失败，请稍后再试。",
    },
  });
}

function entitlementError(message: string, status: number) {
  const error = new Error(message) as Error & { status: number };
  error.status = status;
  return error;
}
