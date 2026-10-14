# 星轨塔罗少女 · Railstar

中文塔罗陪伴应用，围绕每日运势、牌迹、日记复盘和个人档案展开。前端使用 React、TypeScript 和 Vite；Express 提供账户、AI、权益和支付接口。

## 本地开发

需要 Node.js 20 或更新版本。

```sh
npm ci
```

把 `.env.example` 复制为项目根目录的 `.env`。文本解读使用服务端的 `DEEPSEEK_API_KEY`，账户会话使用 `AUTH_SESSION_SECRET`；其他支付、图像和云端存储配置按需填写。不要提交 `.env`，也不要把服务端密钥放到 `VITE_*` 变量里。

```sh
npm run dev
```

默认预览地址为 `http://localhost:8080`，可用环境变量 `PORT` 指定端口。未配置 AI 密钥时仍可检查页面和抽牌流程，解读会显示本地兜底内容。

## 验证与生产运行

```sh
npm run lint
npm test
npm run build
npm start
```

`lint` 执行 TypeScript 检查。回归测试覆盖备份合并、图片等待、中文输入和共享 API；外部 AI 请求使用本地模拟，不产生模型费用。`npm start` 在 Windows、macOS 和 Linux 上以生产模式运行 Express，并提供 `dist` 中的构建结果。

`server.ts` 与 Vercel、Netlify 使用同一套 `api/index.ts` 路由，保证接口状态码、CORS 和权益校验一致。Vercel 配置见 `vercel.json`，Netlify 配置见 `netlify.toml`。

## Vercel 部署与 API

导入整个 Git 仓库并将生产分支设为 `main`，使用 Vite 预设、构建命令 `npm run build`、输出目录 `dist`。不要仅上传 `dist`；仓库里的 `api/` 同时部署为 Node.js Functions。Web 前端默认向同一域名的 `/api` 请求，通常不需要设置 `VITE_API_BASE_URL`；只有确实使用独立后端时才设置它，不能填写 localhost。

在项目 Settings → Environment Variables 中设置服务端 `DEEPSEEK_API_KEY`，选择 Production 和需要的 Preview 环境，再重新部署。环境变量不会自动加入已经生成的部署；也不要把密钥改名为 `VITE_DEEPSEEK_API_KEY` 或写进浏览器代码。账户与云端存档还需要 `AUTH_SESSION_SECRET` 和 Upstash 的 URL/token（支持 `UPSTASH_REDIS_REST_*` 或 `KV_REST_API_*`），支付使用各渠道独立配置。

上线检查分别看 `/api/health`、`/api/time` 与实际 AI 请求。健康接口正常只证明函数能响应，不证明 AI 密钥已经配置。AI 密钥缺失返回 JSON 500；上游超时返回 JSON 504；非 JSON、正文未完成或模型 token 上限截断返回 JSON 错误，不会作为成功生成入账。代理使用完整 JSON 协议并关闭上游流式模式，不自动重试付费请求。

函数执行上限显式设为 60 秒。AI 从请求开始到完整正文使用 50 秒预算，含前置权益检查和联网搜索；权益提交再保留至多 3 秒，Vercel 聊天存储使用每请求独立的绝对 deadline，每次 Upstash 连接与完整正文最多等待 3 秒。守护与沙盘客户端等待 55 秒，留出错误返回时间。这是一组应用预算，不代表所有 Vercel 项目默认只有 60 秒。平台规则见 [Vercel 函数时限](https://vercel.com/docs/functions/configuring-functions/duration)。存储 SET 已发起但未收到完整确认时，可能已经应用，返回“结果尚未确认，请刷新账户核对”，不会自动重试或承诺没有扣费。

## Android

```sh
npm run android:sync
npm run android:apk
```

Android 默认连接现有线上 API。需要连接其他后端时，在构建环境中设置 `VITE_API_BASE_URL`。APK 构建还需要 Android SDK 和 Java 环境；具体打包与分发准备见 `APP_PACKAGING_PREP.md`。

## 产品方向

现有实施记录见 `PRODUCT_WORKSHEET.md` 和 `PRODUCT_OPTIMIZATION_WORKSHEET.md`。优先改善每日主流程、记录延续、等待反馈和失败恢复，保留现有角色与视觉风格。
