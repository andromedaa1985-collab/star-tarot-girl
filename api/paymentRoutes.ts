import crypto from "crypto";
import type express from "express";
import { readStoreJson, updateStoreJson } from "./jsonStore.js";
import { PAYMENT_PLANS, type PaymentPlan } from "../src/lib/pricing.js";
import { requireUser } from "./authRoutes.js";

type PaymentOrder = {
  id: string;
  provider: string;
  planId: string;
  amount: string;
  status: "created" | "failed" | "paid";
  createdAt: string;
  userId?: string;
  providerOrderId?: string;
  providerResponse?: unknown;
  paidAt?: string;
};

const PAYMENT_ORDER_STORE_NAME = "astro-payment-orders";
const PAYMENT_ORDER_LOCAL_DIR = ".data/payment-orders";

const ALIPAY_GATEWAYS = {
  sandbox: "https://openapi-sandbox.dl.alipaydev.com/gateway.do",
  production: "https://openapi.alipay.com/gateway.do",
};

export function registerPaymentRoutes(app: express.Express) {
  app.get("/api/payments/plans", (req, res) => {
    const config = getAlipayConfig(req);
    const missing = getMissingAlipayConfig(config);
    const xorpayConfig = getXorPayConfig(req);
    const xunhuPayConfig = getXunhuPayConfig(req);
    const xorpayMissing = getXorPayMissing(xorpayConfig);
    const xunhuPayMissing = getXunhuPayMissing(xunhuPayConfig);

    res.setHeader("Cache-Control", "no-store");
    res.json({
      provider: xorpayMissing.length === 0 ? "xorpay" : xunhuPayMissing.length === 0 ? "xunhupay" : "xorpay",
      enabled: xorpayMissing.length === 0 || xunhuPayMissing.length === 0 || missing.length === 0,
      mode: config.mode,
      missing,
      providers: [
        { id: "xorpay", name: "XorPay", enabled: xorpayMissing.length === 0, missing: xorpayMissing },
        { id: "xunhupay", name: "虎皮椒", enabled: xunhuPayMissing.length === 0, missing: xunhuPayMissing },
        { id: "alipay", name: "支付宝直连调试", enabled: missing.length === 0, missing },
      ],
      plans: PAYMENT_PLANS,
    });
  });

  app.post("/api/payments/xorpay/create", async (req, res) => {
    try {
      const plan = getPlan(req.body.planId);
      const config = getXorPayConfig(req);
      const missing = getXorPayMissing(config);
      if (missing.length > 0) {
        return res.status(400).json({
          error: { message: `XorPay 还没配置好：${missing.join(", ")}`, missing },
        });
      }

      const user = await requireUser(req);
      const orderId = await createOrder(plan, "xorpay", user.id);
      const payType = req.body.payType === "wechat" ? "native" : "alipay";
      const params = {
        name: plan.name,
        pay_type: payType,
        price: plan.amount,
        order_id: orderId,
        notify_url: config.notifyUrl,
        return_url: config.returnUrl,
        order_uid: user.id,
        more: plan.description,
        sign: signXorPayPay(
          { name: plan.name, payType, price: plan.amount, orderId, notifyUrl: config.notifyUrl },
          config.secret!,
        ),
      };

      const response = await fetch(`${config.gateway}/${config.aid}`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams(params).toString(),
        signal: AbortSignal.timeout(10_000),
      });
      const data = await response.json();
      if (!response.ok || data.status !== "ok") {
        await patchPaymentOrder(orderId, { status: "failed", providerResponse: data });
        return res.status(502).json({ error: { message: data.info || data.message || "XorPay 下单失败" } });
      }

      await patchPaymentOrder(orderId, {
        providerOrderId: data.aoid,
        providerResponse: data,
      });
      res.json({
        orderId,
        plan,
        provider: "xorpay",
        payUrl: data?.info?.qr || data?.url || data?.qrcode,
      });
    } catch (error: any) {
      console.error("XorPay Create Error:", error);
      res.status(Number(error?.status) || 500).json({ error: { message: error.message || "XorPay 下单失败" } });
    }
  });

  app.post("/api/payments/xunhupay/create", async (req, res) => {
    try {
      const plan = getPlan(req.body.planId);
      const config = getXunhuPayConfig(req);
      const missing = getXunhuPayMissing(config);
      if (missing.length > 0) {
        return res.status(400).json({
          error: { message: `虎皮椒还没配置好：${missing.join(", ")}`, missing },
        });
      }

      const user = await requireUser(req);
      const orderId = await createOrder(plan, "xunhupay", user.id);
      const tradeType = req.body.payType === "wechat" ? "WAP" : "WAP_ALIPAY";
      const params: Record<string, any> = {
        version: "1.1",
        appid: config.appId,
        trade_order_id: orderId,
        payment: tradeType,
        total_fee: plan.amount,
        title: plan.name,
        time: Math.floor(Date.now() / 1000),
        notify_url: config.notifyUrl,
        return_url: config.returnUrl,
        nonce_str: crypto.randomBytes(12).toString("hex"),
        plugins: "astro-rail",
      };
      params.hash = signXunhuPay(params, config.appSecret!);

      const response = await fetch(config.gateway, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
        signal: AbortSignal.timeout(10_000),
      });
      const data = await response.json();
      if (!response.ok || data.errcode !== 0) {
        await patchPaymentOrder(orderId, { status: "failed", providerResponse: data });
        return res.status(502).json({ error: { message: data.errmsg || "虎皮椒下单失败" } });
      }

      await patchPaymentOrder(orderId, {
        providerOrderId: data.open_order_id,
        providerResponse: data,
      });
      res.json({
        orderId,
        plan,
        provider: "xunhupay",
        payUrl: data.url || data.url_qrcode,
        qrUrl: data.url_qrcode,
      });
    } catch (error: any) {
      console.error("XunhuPay Create Error:", error);
      res.status(Number(error?.status) || 500).json({ error: { message: error.message || "虎皮椒下单失败" } });
    }
  });

  app.post("/api/payments/alipay/create", async (req, res) => {
    try {
      const config = getAlipayConfig(req);
      const missing = getMissingAlipayConfig(config);
      if (missing.length > 0) {
        return res.status(400).json({
          error: {
            message: `支付宝收款还没配置好：${missing.join(", ")}`,
            missing,
          },
        });
      }

      const plan = getPlan(req.body.planId);
      const channel = req.body.channel === "wap" ? "wap" : "page";
      const user = await requireUser(req);
      const orderId = await createOrder(plan, "alipay", user.id);
      const method = channel === "wap" ? "alipay.trade.wap.pay" : "alipay.trade.page.pay";
      const bizContent: Record<string, any> = {
        out_trade_no: orderId,
        total_amount: plan.amount,
        subject: plan.name,
        body: plan.description,
        product_code: channel === "wap" ? "QUICK_WAP_WAY" : "FAST_INSTANT_TRADE_PAY",
        timeout_express: "15m",
      };

      if (channel === "wap") {
        bizContent.quit_url = config.returnUrl;
      }

      const params: Record<string, any> = {
        app_id: config.appId,
        method,
        format: "JSON",
        charset: "UTF-8",
        sign_type: "RSA2",
        timestamp: alipayTimestamp(),
        version: "1.0",
        notify_url: config.notifyUrl,
        return_url: config.returnUrl,
        biz_content: JSON.stringify(bizContent),
      };

      params.sign = signAlipayParams(params, config.privateKey!);
      res.json({
        orderId,
        plan,
        channel,
        formHtml: buildAlipayForm(config.gateway, params),
      });
    } catch (error: any) {
      console.error("Alipay Create Error:", error);
      res.status(Number(error?.status) || 500).json({ error: { message: error.message || "支付宝下单失败" } });
    }
  });

  app.post("/api/payments/xorpay/notify", async (req, res) => {
    try {
      const config = getXorPayConfig(req);
      const params = { ...req.body, ...req.query } as Record<string, string>;
      const order = await getPaymentOrder(params.order_id);
      if (!order || order.provider !== "xorpay" || !config.secret) return res.send("fail");

      const expected = md5(`${params.aoid || ""}${params.order_id || ""}${params.pay_price || ""}${params.pay_time || ""}${config.secret}`);
      const amountMatches = moneyMatches(order.amount, params.pay_price);
      if (!params.sign || params.sign !== expected) return res.send("fail");
      if (!amountMatches) return res.send("fail");

      await confirmPaidOrder(params.order_id, {
        status: "paid",
        providerOrderId: params.aoid,
        paidAt: new Date().toISOString(),
        providerResponse: params,
      });
      res.send("success");
    } catch (error) {
      console.error("XorPay Notify Error:", error);
      res.status(503).send("fail");
    }
  });

  app.post("/api/payments/xunhupay/notify", async (req, res) => {
    try {
      const config = getXunhuPayConfig(req);
      const params = { ...req.body } as Record<string, any>;
      const orderId = params.trade_order_id;
      const order = await getPaymentOrder(orderId);
      if (!order || order.provider !== "xunhupay" || !config.appSecret) return res.send("fail");

      const expected = signXunhuPay(params, config.appSecret);
      const amountMatches = moneyMatches(order.amount, params.total_fee);
      if (!params.hash || params.hash !== expected) return res.send("fail");
      if (!amountMatches) return res.send("fail");

      await confirmPaidOrder(orderId, {
        status: "paid",
        providerOrderId: params.open_order_id,
        paidAt: new Date().toISOString(),
        providerResponse: params,
      });
      res.send("success");
    } catch (error) {
      console.error("XunhuPay Notify Error:", error);
      res.status(503).send("fail");
    }
  });

  app.post("/api/payments/alipay/notify", async (req, res) => {
    try {
      const config = getAlipayConfig(req);
      if (!config.publicKey) return res.send("fail");
      const params = { ...req.body };
      const isValid = verifyAlipayNotify(params, config.publicKey);
      const order = await getPaymentOrder(params.out_trade_no);
      const amountMatches = order && order.provider === "alipay" && moneyMatches(order.amount, params.total_amount);
      const appMatches = !config.appId || params.app_id === config.appId;

      if (!isValid || !amountMatches || !appMatches) {
        console.warn("Alipay notify rejected", { isValid, amountMatches, appMatches, outTradeNo: params.out_trade_no });
        return res.send("fail");
      }

      if (params.trade_status === "TRADE_SUCCESS" || params.trade_status === "TRADE_FINISHED") {
        await confirmPaidOrder(params.out_trade_no, {
          status: "paid",
          providerOrderId: params.trade_no,
          paidAt: new Date().toISOString(),
          providerResponse: params,
        });
      }

      res.send("success");
    } catch (error) {
      console.error("Alipay Notify Error:", error);
      res.status(503).send("fail");
    }
  });

  app.get("/api/payments/alipay/return", (req, res) => {
    const orderId = typeof req.query.out_trade_no === "string" ? req.query.out_trade_no : "";
    res.redirect(`/app/profile?payment=alipay&order=${encodeURIComponent(orderId)}`);
  });

  const readOrder: express.RequestHandler = async (req, res) => {
    try {
      const user = await requireUser(req);
      if (!/^AR[A-Za-z0-9-]{6,80}$/.test(req.params.orderId)) return res.status(400).json({ error: { message: "订单号无效。" } });
      const order = await getPaymentOrder(req.params.orderId);
      if (!order) return res.status(404).json({ error: { message: "订单不存在。" } });
      if (order.userId !== user.id) return res.status(403).json({ error: { message: "这笔订单不属于当前账户。" } });
      res.setHeader("Cache-Control", "no-store");
      res.json({ order: { id: order.id, provider: order.provider, planId: order.planId, amount: order.amount, status: order.status, createdAt: order.createdAt, paidAt: order.paidAt } });
    } catch (error: any) { res.status(Number(error?.status) || 503).json({ error: { message: "订单暂时无法读取，请稍后重试。" } }); }
  };
  app.get("/api/payments/alipay/orders/:orderId", readOrder);
  app.get("/api/payments/orders/:orderId", readOrder);
}

function normalizePem(value?: string) {
  return value?.replace(/\\n/g, "\n").trim();
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function getPlan(planId?: string) {
  const plan = PAYMENT_PLANS.find((item) => item.id === planId);
  if (!plan) throw Object.assign(new Error("无效的商品。"), { status: 400 });
  return plan;
}

function getPublicBaseUrl(req: express.Request) {
  const forwardedProto = req.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const forwardedHost = req.get("x-forwarded-host")?.split(",")[0]?.trim();
  return process.env.PUBLIC_BASE_URL || `${forwardedProto || req.protocol}://${forwardedHost || req.get("host")}`;
}

function moneyMatches(expected: unknown, paid: unknown) {
  const cents = (value: unknown) => {
    const text = String(value ?? "");
    if (!/^\d+(?:\.\d{1,2})?$/.test(text)) return null;
    const [whole, fraction = ""] = text.split(".");
    const result = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
    return Number.isSafeInteger(result) && result > 0 ? result : null;
  };
  const amount = cents(expected);
  return amount !== null && amount === cents(paid);
}

function md5(value: string) {
  return crypto.createHash("md5").update(value, "utf8").digest("hex");
}

async function savePaymentOrder(order: PaymentOrder) {
  await updateStoreJson<PaymentOrder>(PAYMENT_ORDER_STORE_NAME, order.id, PAYMENT_ORDER_LOCAL_DIR, current => {
    if (current) throw Object.assign(new Error("订单已存在，请重新下单。"), { status: 409 });
    return order;
  });
}

export async function getPaymentOrder(orderId?: string): Promise<PaymentOrder | null> {
  if (!orderId) return null;
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(orderId)) return null;
  return readStoreJson<PaymentOrder>(PAYMENT_ORDER_STORE_NAME, orderId, PAYMENT_ORDER_LOCAL_DIR);
}

async function patchPaymentOrder(orderId: string, patch: Partial<PaymentOrder>) {
  return updateStoreJson<PaymentOrder>(PAYMENT_ORDER_STORE_NAME, orderId, PAYMENT_ORDER_LOCAL_DIR, current => {
    if (!current) throw Object.assign(new Error("订单不存在。"), { status: 404 });
    // A repeated callback must not reset payment time or downgrade paid orders.
    return current.status === "paid" ? current : { ...current, ...patch };
  });
}

async function confirmPaidOrder(orderId: string, patch: Partial<PaymentOrder>) {
  const order = await patchPaymentOrder(orderId, patch);
  if (order.userId) {
    // Callback retries and browser returns share the same durable grant ledger.
    const { grantPaidOrderEntitlement } = await import("./entitlementRoutes.js");
    await grantPaidOrderEntitlement(order);
  }
  return order;
}

async function createOrder(plan: PaymentPlan, provider: string, userId?: string) {
  const orderId = `AR${Date.now()}${crypto.randomBytes(12).toString("hex").toUpperCase()}`;
  await savePaymentOrder({
    id: orderId,
    provider,
    planId: plan.id,
    amount: plan.amount,
    status: "created",
    createdAt: new Date().toISOString(),
    userId,
  });
  return orderId;
}

function getXorPayConfig(req: express.Request) {
  const publicBaseUrl = getPublicBaseUrl(req);
  return {
    aid: process.env.XORPAY_AID,
    secret: process.env.XORPAY_APP_SECRET,
    gateway: process.env.XORPAY_GATEWAY || "https://xorpay.com/api/pay",
    notifyUrl: process.env.XORPAY_NOTIFY_URL || `${publicBaseUrl}/api/payments/xorpay/notify`,
    returnUrl: process.env.XORPAY_RETURN_URL || `${publicBaseUrl}/app/profile`,
  };
}

function getXorPayMissing(config: ReturnType<typeof getXorPayConfig>) {
  const missing = [];
  if (!config.aid) missing.push("XORPAY_AID");
  if (!config.secret) missing.push("XORPAY_APP_SECRET");
  return missing;
}

function signXorPayPay(params: { name: string; payType: string; price: string; orderId: string; notifyUrl: string }, secret: string) {
  return md5(`${params.name}${params.payType}${params.price}${params.orderId}${params.notifyUrl}${secret}`);
}

function getXunhuPayConfig(req: express.Request) {
  const publicBaseUrl = getPublicBaseUrl(req);
  return {
    appId: process.env.XUNHUPAY_APPID,
    appSecret: process.env.XUNHUPAY_APPSECRET,
    gateway: process.env.XUNHUPAY_GATEWAY || "https://api.xunhupay.com/payment/do.html",
    notifyUrl: process.env.XUNHUPAY_NOTIFY_URL || `${publicBaseUrl}/api/payments/xunhupay/notify`,
    returnUrl: process.env.XUNHUPAY_RETURN_URL || `${publicBaseUrl}/app/profile`,
  };
}

function getXunhuPayMissing(config: ReturnType<typeof getXunhuPayConfig>) {
  const missing = [];
  if (!config.appId) missing.push("XUNHUPAY_APPID");
  if (!config.appSecret) missing.push("XUNHUPAY_APPSECRET");
  return missing;
}

function signXunhuPay(params: Record<string, any>, secret: string) {
  const content = Object.keys(params)
    .filter((key) => key !== "hash" && params[key] !== undefined && params[key] !== null && params[key] !== "")
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join("&");
  return md5(`${content}${secret}`);
}

function alipayTimestamp() {
  const pad = (num: number) => String(num).padStart(2, "0");
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}

function buildAlipaySignContent(params: Record<string, any>) {
  return Object.keys(params)
    .filter((key) => key !== "sign" && key !== "sign_type" && params[key] !== undefined && params[key] !== null && params[key] !== "")
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join("&");
}

function signAlipayParams(params: Record<string, any>, privateKey: string) {
  const signer = crypto.createSign("RSA-SHA256");
  signer.update(buildAlipaySignContent(params), "utf8");
  signer.end();
  return signer.sign(privateKey, "base64");
}

function verifyAlipayNotify(params: Record<string, any>, publicKey: string) {
  const verifier = crypto.createVerify("RSA-SHA256");
  verifier.update(buildAlipaySignContent(params), "utf8");
  verifier.end();
  return verifier.verify(publicKey, params.sign, "base64");
}

function buildAlipayForm(gateway: string, params: Record<string, any>) {
  const inputs = Object.entries(params)
    .map(([key, value]) => `<input type="hidden" name="${escapeHtml(key)}" value="${escapeHtml(String(value))}" />`)
    .join("\n");
  return `<!doctype html>
<html lang="zh-CN">
<head><meta charset="utf-8"><title>正在打开支付宝</title></head>
<body>
  <form id="alipay_submit" method="post" action="${escapeHtml(gateway)}?charset=UTF-8">
    ${inputs}
  </form>
  <script>document.getElementById('alipay_submit').submit();</script>
</body>
</html>`;
}

function getAlipayConfig(req: express.Request) {
  const mode = process.env.ALIPAY_GATEWAY_MODE === "production" ? "production" : "sandbox";
  const publicBaseUrl = getPublicBaseUrl(req);
  return {
    mode,
    gateway: ALIPAY_GATEWAYS[mode],
    appId: process.env.ALIPAY_APP_ID,
    privateKey: normalizePem(process.env.ALIPAY_PRIVATE_KEY),
    publicKey: normalizePem(process.env.ALIPAY_PUBLIC_KEY),
    notifyUrl: process.env.ALIPAY_NOTIFY_URL || `${publicBaseUrl}/api/payments/alipay/notify`,
    returnUrl: process.env.ALIPAY_RETURN_URL || `${publicBaseUrl}/api/payments/alipay/return`,
  };
}

function getMissingAlipayConfig(config: ReturnType<typeof getAlipayConfig>) {
  const missing = [];
  if (!config.appId) missing.push("ALIPAY_APP_ID");
  if (!config.privateKey) missing.push("ALIPAY_PRIVATE_KEY");
  if (!config.publicKey) missing.push("ALIPAY_PUBLIC_KEY");
  return missing;
}
