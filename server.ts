import express from "express";
import path from "node:path";
import { app } from "./api/index.js";

async function startServer() {
  const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 8080;

  // Keep unknown API requests out of the SPA fallback.
  app.use("/api", (_req, res) => {
    res.status(404).json({ error: { message: "接口不存在。" } });
  });

  const isProduction = process.env.NODE_ENV === "production" || process.env.ZEABUR === "true";
  if (!isProduction) {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(port, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${port}`);
  });
}

startServer();
