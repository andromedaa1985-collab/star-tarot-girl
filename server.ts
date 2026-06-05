import express from "express";
import path from "path";
import dotenv from "dotenv";
import crypto from "crypto";
import { search } from "duck-duck-scrape";
import { registerAnalyticsRoutes } from "./api/analyticsRoutes";
import { registerAuthRoutes } from "./api/authRoutes";
import { prepareChatEntitlementCharge, registerEntitlementRoutes } from "./api/entitlementRoutes";
import { registerPaymentRoutes } from "./api/paymentRoutes";
import { PAYMENT_PLANS, type PaymentPlan } from "./src/lib/pricing";

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const alipayOrders = new Map<string, any>();
const paymentOrders = alipayOrders;
const relationshipInvites = new Map<string, { profile: any; createdAt: string; expiresAt: number }>();
const RELATIONSHIP_INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const ALIPAY_GATEWAYS = {
  sandbox: "https://openapi-sandbox.dl.alipaydev.com/gateway.do",
  production: "https://openapi.alipay.com/gateway.do",
};

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
  return PAYMENT_PLANS.find((item) => item.id === planId) || PAYMENT_PLANS[0];
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

function md5(value: string) {
  return crypto.createHash("md5").update(value, "utf8").digest("hex");
}

function createOrder(plan: PaymentPlan, provider: string) {
  const orderId = `AR${Date.now()}${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  paymentOrders.set(orderId, {
    id: orderId,
    provider,
    planId: plan.id,
    amount: plan.amount,
    status: "created",
    createdAt: new Date().toISOString(),
  });
  return orderId;
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

async function startServer() {
  const app = express();
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 8080;

  app.use(express.json({ limit: "5mb" }));
  app.use(express.urlencoded({ extended: false, limit: "5mb" }));
  registerAuthRoutes(app);
  registerPaymentRoutes(app);
  registerEntitlementRoutes(app);
  registerAnalyticsRoutes(app);

  // API routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  app.get("/api/time", (req, res) => {
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
      res.status(500).json({ error: { message: error.message || "邀请链接生成失败" } });
    }
  });

  app.get("/api/relationship/invites/:token", (req, res) => {
    pruneRelationshipInvites();
    const token = req.params.token;
    const invite = relationshipInvites.get(token);
    res.setHeader("Cache-Control", "no-store");
    if (!invite) {
      return res.status(404).json({ error: { message: "邀请链接已失效，请让对方重新生成一次。" } });
    }
    res.json({
      profile: invite.profile,
      expiresAt: new Date(invite.expiresAt).toISOString(),
    });
  });

  app.get("/api/payments/plans", (req, res) => {
    const config = getAlipayConfig(req);
    const missing = getMissingAlipayConfig(config);
    const xorpayConfig = getXorPayConfig(req);
    const xunhuPayConfig = getXunhuPayConfig(req);
    const xorpayMissing = getXorPayMissing(xorpayConfig);
    const xunhuPayMissing = getXunhuPayMissing(xunhuPayConfig);
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

  app.post("/api/payments/alipay/create", (req, res) => {
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

      const plan = PAYMENT_PLANS.find((item) => item.id === req.body.planId) || PAYMENT_PLANS[0];
      const channel = req.body.channel === "wap" ? "wap" : "page";
      const orderId = createOrder(plan, "alipay");
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
      res.status(500).json({ error: { message: error.message } });
    }
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

      const orderId = createOrder(plan, "xorpay");
      const payType = req.body.payType === "wechat" ? "native" : "alipay";
      const params = {
        name: plan.name,
        pay_type: payType,
        price: plan.amount,
        order_id: orderId,
        notify_url: config.notifyUrl,
        return_url: config.returnUrl,
        order_uid: req.body.userId || "astro_guest",
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
      });
      const data = await response.json();
      if (!response.ok || data.status !== "ok") {
        paymentOrders.set(orderId, { ...paymentOrders.get(orderId), status: "failed", providerResponse: data });
        return res.status(502).json({ error: { message: data.info || data.message || "XorPay 下单失败" } });
      }

      paymentOrders.set(orderId, {
        ...paymentOrders.get(orderId),
        providerOrderId: data.aoid,
        providerResponse: data,
      });
      res.json({
        orderId,
        plan,
        provider: "xorpay",
        payUrl: data?.info?.qr || data?.url || data?.qrcode,
        providerResponse: data,
      });
    } catch (error: any) {
      console.error("XorPay Create Error:", error);
      res.status(500).json({ error: { message: error.message || "XorPay 下单失败" } });
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

      const orderId = createOrder(plan, "xunhupay");
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
      });
      const data = await response.json();
      if (!response.ok || data.errcode !== 0) {
        paymentOrders.set(orderId, { ...paymentOrders.get(orderId), status: "failed", providerResponse: data });
        return res.status(502).json({ error: { message: data.errmsg || "虎皮椒下单失败" } });
      }

      paymentOrders.set(orderId, {
        ...paymentOrders.get(orderId),
        providerOrderId: data.open_order_id,
        providerResponse: data,
      });
      res.json({
        orderId,
        plan,
        provider: "xunhupay",
        payUrl: data.url || data.url_qrcode,
        qrUrl: data.url_qrcode,
        providerResponse: data,
      });
    } catch (error: any) {
      console.error("XunhuPay Create Error:", error);
      res.status(500).json({ error: { message: error.message || "虎皮椒下单失败" } });
    }
  });

  app.post("/api/payments/alipay/notify", (req, res) => {
    try {
      const config = getAlipayConfig(req);
      if (!config.publicKey) return res.send("fail");
      const params = { ...req.body };
      const isValid = verifyAlipayNotify(params, config.publicKey);
      const order = alipayOrders.get(params.out_trade_no);
      const amountMatches = order && String(order.amount) === String(params.total_amount);
      const appMatches = !config.appId || params.app_id === config.appId;

      if (!isValid || !amountMatches || !appMatches) {
        console.warn("Alipay notify rejected", { isValid, amountMatches, appMatches, outTradeNo: params.out_trade_no });
        return res.send("fail");
      }

      if (params.trade_status === "TRADE_SUCCESS" || params.trade_status === "TRADE_FINISHED") {
        alipayOrders.set(params.out_trade_no, {
          ...order,
          status: "paid",
          tradeNo: params.trade_no,
          paidAt: new Date().toISOString(),
        });
      }

      res.send("success");
    } catch (error) {
      console.error("Alipay Notify Error:", error);
      res.send("fail");
    }
  });

  app.post("/api/payments/xorpay/notify", (req, res) => {
    try {
      const config = getXorPayConfig(req);
      const params = { ...req.body, ...req.query } as Record<string, string>;
      const order = paymentOrders.get(params.order_id);
      if (!order || !config.secret) return res.send("fail");
      const expected = md5(`${params.aoid || ""}${params.order_id || ""}${params.pay_price || ""}${params.pay_time || ""}${config.secret}`);
      const amountMatches = String(order.amount) === String(params.pay_price);
      if (!params.sign || params.sign !== expected) return res.send("fail");
      if (!amountMatches) return res.send("fail");

      paymentOrders.set(params.order_id, {
        ...order,
        status: "paid",
        providerOrderId: params.aoid,
        paidAt: new Date().toISOString(),
        providerResponse: params,
      });
      res.send("success");
    } catch (error) {
      console.error("XorPay Notify Error:", error);
      res.send("fail");
    }
  });

  app.post("/api/payments/xunhupay/notify", (req, res) => {
    try {
      const config = getXunhuPayConfig(req);
      const params = { ...req.body } as Record<string, any>;
      const orderId = params.trade_order_id;
      const order = paymentOrders.get(orderId);
      if (!order || !config.appSecret) return res.send("fail");
      const expected = signXunhuPay(params, config.appSecret);
      const amountMatches = String(order.amount) === String(params.total_fee);
      if (!params.hash || params.hash !== expected) return res.send("fail");
      if (!amountMatches) return res.send("fail");

      paymentOrders.set(orderId, {
        ...order,
        status: "paid",
        providerOrderId: params.open_order_id,
        paidAt: new Date().toISOString(),
        providerResponse: params,
      });
      res.send("success");
    } catch (error) {
      console.error("XunhuPay Notify Error:", error);
      res.send("fail");
    }
  });

  app.get("/api/payments/alipay/return", (req, res) => {
    const orderId = typeof req.query.out_trade_no === "string" ? req.query.out_trade_no : "";
    res.redirect(`/app/profile?payment=alipay&order=${encodeURIComponent(orderId)}`);
  });

  app.get("/api/payments/alipay/orders/:orderId", (req, res) => {
    const order = alipayOrders.get(req.params.orderId);
    if (!order) {
      return res.status(404).json({ error: { message: "订单不存在或服务已重启，请重新下单。" } });
    }
    res.json({ order });
  });

  app.get("/api/payments/orders/:orderId", (req, res) => {
    const order = paymentOrders.get(req.params.orderId);
    if (!order) {
      return res.status(404).json({ error: { message: "订单不存在或服务已重启，请重新下单。" } });
    }
    res.json({ order });
  });

  // DeepSeek Chat Proxy
  app.post("/api/deepseek/chat", async (req, res) => {
    try {
      const apiKey = process.env.DEEPSEEK_API_KEY;
      if (!apiKey) throw new Error("Missing DeepSeek API Key");
      const entitlementCharge = await prepareChatEntitlementCharge(req);

      // Intercept for Internet Mode
      let messages = [...req.body.messages];
      const isInternetMode = req.body.isInternetMode;

      if (isInternetMode) {
        // Assume the last user message is the query
        const lastUserMsg = messages[messages.length - 1];
        if (lastUserMsg && lastUserMsg.role === 'user') {
          console.log(`[Internet Mode] Searching for: ${lastUserMsg.content}`);
          try {
            const searchResults = await search(lastUserMsg.content);
            if (searchResults && searchResults.results && searchResults.results.length > 0) {
              const topResults = searchResults.results.slice(0, 5).map(r => `- ${r.title}: ${r.description}`).join('\n');
              
              // Append search results to the system prompt (first message)
              if (messages[0].role === 'system') {
                messages[0].content += `\n\n【星网最新资讯（实时检索结果）】：\n以下是从现世网络获取的最新信息，请结合这些内容回答用户：\n${topResults}`;
              }
              console.log("[Internet Mode] Search successful, context appended.");
            }
          } catch (searchErr) {
            console.error("DuckDuckGo Search Failed:", searchErr);
            // Non-fatal, continue without search context
          }
        }
      }

      const bodyPayload = {
        ...req.body,
        messages: messages
      };
      
      delete bodyPayload.isInternetMode; // Remove custom parameter before sending to deepseek
      delete bodyPayload.entitlement;

      const response = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify(bodyPayload)
      });
      const data = await response.json();
      if (data.error) {
        console.error("DeepSeek API Error:", data.error);
      }
      if (response.ok && !data.error && entitlementCharge) {
        data.entitlement = await entitlementCharge.commit();
      }
      res.json(data);
    } catch (error: any) {
      console.error("DeepSeek Proxy Error:", error);
      res.status(Number(error?.status) || 500).json({ error: { message: error.message } });
    }
  });

  // Vite middleware for development
  const isProduction = process.env.NODE_ENV === "production" || process.env.ZEABUR === "true";
  
  if (!isProduction) {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
