import express from "express";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.post("/api/deepseek/chat", async (req, res) => {
  try {
    const apiKey = requireEnv("DEEPSEEK_API_KEY", "DeepSeek API Key");
    const response = await fetch("https://api.deepseek.com/chat/completions", {
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

app.post("/api/minimax/tts", async (req, res) => {
  try {
    const groupId = requireEnv("MINIMAX_GROUP_ID", "MiniMax Group ID");
    const apiKey = requireEnv("MINIMAX_API_KEY", "MiniMax API Key");
    const response = await fetch(`https://api.minimax.chat/v1/t2a_v2?GroupId=${groupId}`, {
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

function sendApiError(res: express.Response, error: Error) {
  res.status(500).json({
    error: {
      message: error.message || "接口请求失败"
    }
  });
}

export default app;
