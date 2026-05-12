import express from "express";
import path from "path";
import dotenv from "dotenv";
import crypto from "crypto";
import { search } from "duck-duck-scrape";

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const PAYMENT_PLANS = [
  {
    id: "plus_monthly",
    name: "星轨 Plus 月卡",
    amount: "9.90",
    description: "每周成长报告、专属牌面与更多每日能量",
    entitlement: { type: "membership", plan: "plus", days: 31, energyFloor: 20 },
    limits: { tarotReadings: 200, dailyCheckInEnergy: 2, dailyMissionEnergy: 6 },
    features: ["完整周报", "200 条牌迹", "Plus 期间抽牌不扣能量", "专属牌面与陪伴细节"],
  },
  {
    id: "energy_pack_30",
    name: "30 点星光能量包",
    amount: "6.00",
    description: "补充占卜与陪伴能量",
    entitlement: { type: "energy", amount: 30 },
    limits: { tarotReadings: 30, dailyCheckInEnergy: 1, dailyMissionEnergy: 3 },
    features: ["立即补充 30 点能量", "适合临时多抽几次"],
  },
];

const alipayOrders = new Map<string, any>();

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
  const publicBaseUrl = process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get("host")}`;
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

  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));

  // API routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  app.get("/api/payments/plans", (req, res) => {
    const config = getAlipayConfig(req);
    const missing = getMissingAlipayConfig(config);
    res.json({
      provider: "alipay",
      enabled: missing.length === 0,
      mode: config.mode,
      missing,
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
      const orderId = `AR${Date.now()}${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
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
      alipayOrders.set(orderId, {
        id: orderId,
        planId: plan.id,
        amount: plan.amount,
        status: "created",
        createdAt: new Date().toISOString(),
      });

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

  // DeepSeek Chat Proxy
  app.post("/api/deepseek/chat", async (req, res) => {
    try {
      const apiKey = process.env.DEEPSEEK_API_KEY;
      if (!apiKey) throw new Error("Missing DeepSeek API Key");

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
      res.json(data);
    } catch (error: any) {
      console.error("DeepSeek Proxy Error:", error);
      res.status(500).json({ error: { message: error.message } });
    }
  });

  // MiniMax TTS Proxy
  app.post("/api/minimax/tts", async (req, res) => {
    try {
      const groupId = process.env.MINIMAX_GROUP_ID;
      const apiKey = process.env.MINIMAX_API_KEY;
      if (!groupId || !apiKey) throw new Error("Missing MiniMax Credentials");
      const response = await fetch(`https://api.minimax.chat/v1/t2a_v2?GroupId=${groupId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify(req.body)
      });
      const data = await response.json();
      res.json(data);
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  });

  // SiliconFlow Image Generation Proxy
  app.post("/api/siliconflow/generate", async (req, res) => {
    try {
      const apiKey = process.env.IMAGE_API_KEY;
      if (!apiKey) throw new Error("Missing SiliconFlow Image API Key");
      const response = await fetch('https://api.siliconflow.cn/v1/images/generations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify(req.body)
      });
      const data = await response.json();
      res.json(data);
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
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
