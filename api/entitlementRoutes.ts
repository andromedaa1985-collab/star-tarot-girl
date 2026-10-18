import { consumeRequestLimit, requestNetworkKey } from "./requestLimits.js";
import type express from "express";
import crypto from "crypto";
import { requireUser } from "./authRoutes.js";
import { readStoreJson, updateStoreJson } from "./jsonStore.js";
import { getPaymentOrder } from "./paymentRoutes.js";
import { PAYMENT_PLANS, type PaymentPlan } from "../src/lib/pricing.js";
import {
  activatePlusDays,
  activateFeatureDays,
  activateTesterAccess,
  addDailyFortuneDeepCredits,
  addFeatureUnlock,
  consumeDailyFortuneDeepCredit,
  defaultMembership,
  hasDailyFortuneDeepAccess,
  hasFeatureAccess,
  getDailyCheckInEnergy,
  getDailyMissionEnergy,
  isPlusActive,
  isTesterActive,
  normalizeMembership,
  startPlusTrial,
  TESTER_ACCESS_DAYS,
  type MembershipState,
  type PremiumFeature,
} from "../src/lib/membership.js";

type EntitlementRecord = {
  userId: string;
  membership: MembershipState;
  energy: number;
  grantedOrderIds: string[];
  redeemedCodeHashes: string[];
  testerRedeemedAt?: string;
  relationshipEntitlementsVersion?: 1;
  createdAt: string;
  updatedAt: string;
  pendingCharges?: { id: string; resource: "energy" | "deep" | "none"; amount: number; expiresAt: number; activity?: string }[];
  rewardDays?: Record<string, string>;
  activity?: { date: string; tarot?: boolean; simulator?: boolean };
  activeDates?: string[];
  checkInStreak?: number;
  revision?: number;
};

const ENTITLEMENT_STORE_NAME = "astro-entitlements";
const ENTITLEMENT_LOCAL_DIR = ".data/entitlements";
const DEFAULT_ENERGY = 5;
const BUILTIN_TESTER_REDEEM_CODE_HASHES = [
  "8a6fa05a5c3f6c71b18b47fbf268b2e18cef6a7fa73f8820a9703ab65d2c70d1",
  "e1cf97804c26919d75045fb964fe67ba0ab928cb2cb31620fe5c60e569d312c1",
];

type ChatEntitlementType = "tarot_message" | "daily_deep" | "bazi" | "guardian" | "simulator" | "diary_review";

export function registerEntitlementRoutes(app: express.Express) {
  app.get("/api/entitlements/me", async (req, res) => {
    try {
      const user = await requireUser(req);
      let record = await readEntitlementRecord(user.id);
      if (record.pendingCharges?.some(item => item.expiresAt <= Date.now())) {
        await mutateEntitlement(user.id, () => {});
        record = await readEntitlementRecord(user.id);
      }
      res.setHeader("Cache-Control", "no-store");
      res.json(toEntitlementSnapshot(record));
    } catch (error: any) {
      sendError(res, error, 401);
    }
  });

  app.post("/api/entitlements/trial", async (req, res) => {
    try {
      const user = await requireUser(req);
      const record = await mutateEntitlement(user.id, record => {
        const nextMembership = startPlusTrial(record.membership);
        if (nextMembership === record.membership || nextMembership.source !== "trial") throw entitlementError("Plus 试用已经使用过了。", 409);
        record.membership = nextMembership;
        record.energy = Math.max(record.energy, 12);
      });
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
      if (code.length > 64) throw entitlementError("兑换码无效，请检查后再试。", 400);
      await consumeRequestLimit(`redeem-user:${user.id}`, 10, 60_000);
      await consumeRequestLimit(`redeem-network:${requestNetworkKey(req)}`, 30, 60_000);

      const codeHash = hashCode(code);
      if (!hasTesterRedeemCodes()) {
        return res.status(503).json({ error: { message: "兑换码服务暂未配置。" } });
      }
      if (!isTesterRedeemCodeAllowed(code, codeHash)) {
        return res.status(400).json({ error: { message: "兑换码无效，请检查后再试。" } });
      }

      const record = await mutateEntitlement(user.id, record => {
        if (record.testerRedeemedAt || record.redeemedCodeHashes.length || record.membership.testerExpiresAt || record.membership.plan === "tester") {
          throw entitlementError(`每个账户只能领取一次 ${TESTER_ACCESS_DAYS} 天测试体验。`, 409);
        }
        const now = new Date();
        record.redeemedCodeHashes.push(codeHash);
        record.testerRedeemedAt = now.toISOString();
        record.membership = activateTesterAccess(record.membership, now);
      });
      res.setHeader("Cache-Control", "no-store");
      res.json({
        ...toEntitlementSnapshot(record),
        message: `兑换成功：${TESTER_ACCESS_DAYS} 天全功能体验已生效，72 小时后自动结束，不自动续费。`,
      });
    } catch (error: any) {
      sendError(res, error);
    }
  });

  app.post("/api/entitlements/rewards", async (req, res) => {
    try {
      const user = await requireUser(req);
      const kind = req.body?.kind;
      if (!["checkin", "mission", "return"].includes(kind)) throw entitlementError("奖励类型无效。", 400);
      const today = appDateKey();
      let diaryToday = false;
      if (kind === "mission") {
        const cloud = await readStoreJson<any>("astro-rail-accounts", `archives/${user.id}`, ".data/accounts");
        diaryToday = Array.isArray(cloud?.archive?.data?.diaryEntries) && cloud.archive.data.diaryEntries.some((entry: any) => typeof entry.date === "string" && entry.date.slice(0, 10) === today && typeof entry.content === "string" && entry.content.trim());
      }
      const record = await mutateEntitlement(user.id, record => {
        if (record.rewardDays![kind] === today) return;
        if (kind === "mission" && !(diaryToday && record.activity?.date === today && record.activity.tarot && record.activity.simulator)) throw entitlementError("完成今天的抽牌、日记同步和沙盘后再来领奖。", 409);
        if (kind === "return" && !record.activeDates!.some(date => date < today)) throw entitlementError("持续使用两天后可领取回访奖励。", 409);
        const plus = isPlusActive(record.membership);
        const amount = kind === "checkin" ? getDailyCheckInEnergy(record.membership) : kind === "mission" ? getDailyMissionEnergy(record.membership) : plus ? 3 : 2;
        if (kind === "checkin") {
          const yesterday = appDateKey(new Date(Date.now() - 86_400_000));
          record.checkInStreak = record.rewardDays!.checkin === yesterday ? (record.checkInStreak || 0) + 1 : 1;
        }
        record.energy += amount;
        record.rewardDays![kind] = today;
        record.activeDates = [...new Set([...record.activeDates!, today])].slice(-30);
      });
      res.setHeader("Cache-Control", "no-store");
      res.json(toEntitlementSnapshot(record));
    } catch (error: any) { sendError(res, error); }
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
      if (order.userId !== user.id) {
        return res.status(403).json({ error: { message: "这笔订单不属于当前登录账号。" } });
      }
      if (order.status !== "paid") {
        res.setHeader("Cache-Control", "no-store");
        return res.status(202).json({ status: "waiting", order: publicOrder(order) });
      }

      const record = await grantPaidOrderEntitlement(order);

      res.setHeader("Cache-Control", "no-store");
      res.json({
        status: "paid",
        order: publicOrder(order),
        ...toEntitlementSnapshot(record),
        message: "权益已经由后端确认入账。",
      });
    } catch (error: any) {
      sendError(res, error, 401);
    }
  });
}

export async function grantPaidOrderEntitlement(order: { id: string; status: string; userId?: string; planId: string }) {
  if (order.status !== "paid" || !order.userId) throw entitlementError("订单尚未确认或缺少账户归属，请联系客服核对。", 409);
  return mutateEntitlement(order.userId, record => {
    if (!record.grantedOrderIds.includes(order.id)) {
      applyPlanEntitlement(record, getPlan(order.planId));
      record.grantedOrderIds.push(order.id);
    }
  });
}

// Reserve before calling the model; settle against the latest record, never an old snapshot.
export async function prepareChatEntitlementCharge(req: express.Request) {
  const type = (req.body?.entitlement?.type ?? "tarot_message") as ChatEntitlementType;
  if (!["tarot_message", "daily_deep", "bazi", "guardian", "simulator", "diary_review"].includes(type)) throw entitlementError("未知的权益校验类型。", 400);
  const authenticated = Boolean(req.get("authorization"));
  if (!authenticated) {
    if (type !== "tarot_message") throw entitlementError("请先登录账户再使用此功能。", 401);
    await reserveRequestBudget(req);
    return null;
  }
  const user = await requireUser(req);
  const id = crypto.randomUUID();
  await mutateEntitlement(user.id, async record => {
    const premium = type === "bazi" || type === "guardian" || type === "simulator" ? type : null;
    if (premium && !hasFeatureAccess(record.membership, premium)) {
      const migrated = await readEntitlementRecord(user.id);
      if (!hasFeatureAccess(migrated.membership, premium)) throw entitlementError("请先解锁此功能。", 402);
      record.membership.featureExpiresAt = { ...migrated.membership.featureExpiresAt, ...record.membership.featureExpiresAt };
    }
    if (record.pendingCharges!.length >= 50) throw entitlementError("当前进行中的请求较多，请稍后重试。", 429);
    let resource: "energy" | "deep" | "none" = "none";
    if (!isTesterActive(record.membership) && !isPlusActive(record.membership)) {
      if (type === "daily_deep") {
        if (!hasDailyFortuneDeepAccess(record.membership)) throw entitlementError("今日深解次数不足，请先解锁今日深解或开通 Plus。", 402);
        record.membership = consumeDailyFortuneDeepCredit(record.membership);
        resource = "deep";
      } else {
        if (record.energy < 1) throw entitlementError("能量不足，请先补充能量或开通 Plus。", 402);
        record.energy -= 1;
        resource = "energy";
      }
    }
    record.pendingCharges!.push({ id, resource, amount: resource === "none" ? 0 : 1, expiresAt: Date.now() + 120_000, activity: type });
  });
  try { await reserveRequestBudget(req, user.id); }
  catch (error) { await settle(false); throw error; }
  let committed = false;
  async function settle(success: boolean) {
    return mutateEntitlement(user.id, record => {
      const pending = record.pendingCharges!.find(item => item.id === id);
      if (!pending) return;
      if (!success) refundCharge(record, pending);
      if (success) {
        const date = appDateKey();
        if (record.activity?.date !== date) record.activity = { date };
        if (pending.activity === "tarot_message") record.activity!.tarot = true;
        if (pending.activity === "simulator") record.activity!.simulator = true;
        record.activeDates = [...new Set([...(record.activeDates || []), date])].slice(-30);
      }
      record.pendingCharges = record.pendingCharges!.filter(item => item.id !== id);
    });
  }
  return {
    async commit() { const record = await settle(true); committed = true; return toEntitlementSnapshot(record); },
    async release() { if (!committed) await settle(false); },
  };
}

const dateFormatter = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" });
function appDateKey(date = new Date()) { return dateFormatter.format(date); }

async function reserveRequestBudget(req: express.Request, userId?: string) {
  const network = requestNetworkKey(req);
  await consumeRequestLimit(`ai-network:${network}`, 60, 60_000);
  const identity = userId || network;
  const now = Date.now();
  await updateStoreJson<any>("astro-ai-budgets", identity, ".data/ai-budgets", previous => {
    const current = previous || {};
    const minute = Math.floor(now / 60_000);
    const date = appDateKey();
    const count = current.minute === minute ? current.count || 0 : 0;
    const daily = current.date === date ? current.daily || 0 : 0;
    if (count >= (userId ? 20 : 5) || (!userId && daily >= 5)) throw entitlementError("请求过于频繁或今日体验次数已用完，请稍后重试或登录账户。", 429);
    return { minute, count: count + 1, date, daily: daily + 1 };
  });
}

function refundCharge(record: EntitlementRecord, pending: NonNullable<EntitlementRecord["pendingCharges"]>[number]) {
  if (pending.resource === "energy") record.energy += pending.amount;
  if (pending.resource === "deep") record.membership = addDailyFortuneDeepCredits(record.membership, pending.amount);
}

async function mutateEntitlement(userId: string, change: (record: EntitlementRecord) => void | Promise<void>) {
  return updateStoreJson<EntitlementRecord>(ENTITLEMENT_STORE_NAME, entitlementKey(userId), ENTITLEMENT_LOCAL_DIR, async stored => {
    const record = normalizeEntitlementRecord(userId, stored);
    const now = Date.now();
    for (const pending of record.pendingCharges!) if (pending.expiresAt <= now) refundCharge(record, pending);
    record.pendingCharges = record.pendingCharges!.filter(item => item.expiresAt > now);
    await change(record);
    record.updatedAt = new Date().toISOString();
    record.revision = (record.revision || 0) + 1;
    return record;
  });
}

function publicOrder(order: any) { return { id: order.id, planId: order.planId, status: order.status }; }

async function readEntitlementRecord(userId: string) {
  const stored = await readStoreJson<EntitlementRecord>(
    ENTITLEMENT_STORE_NAME,
    entitlementKey(userId),
    ENTITLEMENT_LOCAL_DIR,
  );
  const record = normalizeEntitlementRecord(userId, stored);
  if (record.relationshipEntitlementsVersion === 1) return record;

  // Older couple purchases only granted ordinary Plus. Reconstruct their
  // relationship expiry from verified paid orders without granting Plus or
  // energy twice. Reads stay read-only: a slow historical lookup must not write
  // an old snapshot over a concurrently completed payment. Normal mutations
  // will persist these derived fields along with their own entitlement change.
  const orders = await Promise.all(record.grantedOrderIds.map((id) => getPaymentOrder(id)));
  const paidAtValues: string[] = [];
  let complete = true;
  for (const order of orders) {
    if (!order || order.status !== 'paid' || (order.userId && order.userId !== userId)) {
      complete = false;
      continue;
    }
    if (order.planId !== 'couple_plus_monthly') continue;
    if (!order.paidAt || !Number.isFinite(Date.parse(order.paidAt))) {
      complete = false;
      continue;
    }
    paidAtValues.push(order.paidAt);
  }

  record.membership = restoreLegacyCoupleFeatureAccess(record.membership, paidAtValues);
  if (complete) record.relationshipEntitlementsVersion = 1;
  return record;
}


function normalizeEntitlementRecord(userId: string, record: EntitlementRecord | null): EntitlementRecord {
  const now = new Date().toISOString();
  return {
    userId,
    membership: normalizeMembership(record?.membership || defaultMembership),
    energy: normalizeEnergy(record?.energy),
    grantedOrderIds: Array.isArray(record?.grantedOrderIds) ? record.grantedOrderIds.filter(Boolean) : [],
    redeemedCodeHashes: Array.isArray(record?.redeemedCodeHashes) ? record.redeemedCodeHashes.filter(Boolean) : [],
    testerRedeemedAt: typeof record?.testerRedeemedAt === "string" ? record.testerRedeemedAt : undefined,
    relationshipEntitlementsVersion: record?.relationshipEntitlementsVersion === 1 ? 1 : undefined,
    createdAt: typeof record?.createdAt === "string" ? record.createdAt : now,
    updatedAt: typeof record?.updatedAt === "string" ? record.updatedAt : now,
    pendingCharges: Array.isArray(record?.pendingCharges) ? record.pendingCharges : [],
    rewardDays: record?.rewardDays || {},
    activity: record?.activity,
    activeDates: Array.isArray(record?.activeDates) ? record.activeDates : [],
    checkInStreak: record?.checkInStreak || 0,
    revision: record?.revision || 0,
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
  const plan = PAYMENT_PLANS.find((item) => item.id === planId);
  if (!plan) throw entitlementError("订单商品不存在，请联系客服核对。", 400);
  return plan;
}

export function applyPlanEntitlement(record: EntitlementRecord, plan: PaymentPlan, now = new Date()) {
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
    const days = Number(entitlement.days) || undefined;
    record.membership = activatePlusDays(record.membership, days, now);
    if (Array.isArray(entitlement.features)) {
      record.membership = activateFeatureDays(record.membership, entitlement.features, days, now);
    }
    if (entitlement.plan === "plus") {
      const floor = normalizeEnergy(entitlement.energyFloor || 0);
      record.energy = Math.max(record.energy, floor);
    }
    return;
  }

  record.membership = activatePlusDays(record.membership, undefined, now);
}

export function restoreLegacyCoupleFeatureAccess(membership: MembershipState, paidAtValues: string[]): MembershipState {
  const entitlement = getPlan('couple_plus_monthly').entitlement;
  const features = Array.isArray(entitlement.features) ? entitlement.features as PremiumFeature[] : [];
  let recovered = normalizeMembership(defaultMembership);
  const times = paidAtValues.map(Date.parse).filter(Number.isFinite).sort((a, b) => a - b);
  for (const timestamp of times) {
    recovered = activateFeatureDays(recovered, features, Number(entitlement.days) || undefined, new Date(timestamp));
  }

  const featureExpiresAt = { ...membership.featureExpiresAt };
  for (const feature of features) {
    const recoveredExpiry = recovered.featureExpiresAt[feature];
    const existingExpiry = featureExpiresAt[feature];
    if (recoveredExpiry && (!existingExpiry || Date.parse(recoveredExpiry) > Date.parse(existingExpiry))) {
      featureExpiresAt[feature] = recoveredExpiry;
    }
  }
  return { ...membership, featureExpiresAt };
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
    revision: record.revision || 0,
    rewards: { ...record.rewardDays, checkInStreak: record.checkInStreak },
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

function getTesterRedeemCodeHashes() {
  const envHashes = (process.env.ASTRORAIL_TESTER_REDEEM_CODE_HASHES || process.env.TESTER_REDEEM_CODE_HASHES || "")
    .split(",")
    .map((hash) => normalizeRedeemCodeHash(hash))
    .filter(Boolean);
  return [...envHashes, ...BUILTIN_TESTER_REDEEM_CODE_HASHES];
}

function hasTesterRedeemCodes() {
  return getTesterRedeemCodes().length > 0 || getTesterRedeemCodeHashes().length > 0;
}

function isTesterRedeemCodeAllowed(code: string, codeHash: string) {
  return getTesterRedeemCodes().includes(code) || getTesterRedeemCodeHashes().includes(codeHash);
}

function normalizeRedeemCodeHash(value: unknown) {
  if (typeof value !== "string") return "";
  const hash = value.trim().toLowerCase();
  return /^[a-f0-9]{64}$/.test(hash) ? hash : "";
}

function hashCode(code: string) {
  return crypto.createHash("sha256").update(`astro-redeem:${code}`, "utf8").digest("hex");
}

function sendError(res: express.Response, error: any, status = 400) {
  res.status(Number(error?.status) || status).json({
    error: {
      message: error?.message || "请求失败，请稍后再试。",
      ...(error?.code ? { code: error.code } : {}),
    },
  });
}

function entitlementError(message: string, status: number) {
  const error = new Error(message) as Error & { status: number };
  error.status = status;
  return error;
}
