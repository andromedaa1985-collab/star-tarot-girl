# 塔罗少女 · Tarot Girl

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

## 离线缓存与更新

生产版 Service Worker 保存公共页面入口和实际访问过的静态资源。已下载的带哈希 JS/CSS 与版本化塔罗图片直接复用缓存；未版本化的图片和字体在后台更新。页面入口和应用清单优先联网，失败时使用当前缓存。新部署通过新资源哈希及缓存版本切换更新。

断网时只能打开资源已缓存的页面，未访问过的懒加载模块仍需联网。AI 解读、登录、支付和云同步需要网络；`/api` 及其子路径均不进入离线缓存。错误响应、错误资源类型、重定向和标记为 private/no-store 的响应不会写入缓存，缓存不可用时仍保留正常网络加载。

## Vercel 部署与 API

导入整个 Git 仓库并将生产分支设为 `main`，使用 Vite 预设、构建命令 `npm run build`、输出目录 `dist`。不要仅上传 `dist`；仓库里的 `api/` 同时部署为 Node.js Functions。Web 前端默认向同一域名的 `/api` 请求，通常不需要设置 `VITE_API_BASE_URL`；只有确实使用独立后端时才设置它，不能填写 localhost。

在项目 Settings → Environment Variables 中设置服务端 `DEEPSEEK_API_KEY`，选择 Production 和需要的 Preview 环境，再重新部署。环境变量不会自动加入已经生成的部署；也不要把密钥改名为 `VITE_DEEPSEEK_API_KEY` 或写进浏览器代码。账户与云端存档还需要稳定的 `AUTH_SESSION_SECRET` 以及持久存储：Upstash 的 URL/token（支持 `UPSTASH_REDIS_REST_*` 或 `KV_REST_API_*`），或者原 Netlify 项目的 `NETLIFY_BLOBS_SITE_ID` 和 `NETLIFY_BLOBS_TOKEN`。这些变量只用于服务端，token 应设为 Secret；支付使用各渠道独立配置。

上线检查分别看 `/api/health`、`/api/time` 与实际 AI 请求。健康接口正常只证明函数能响应，不证明 AI 密钥已经配置。AI 密钥缺失返回 JSON 500；上游超时返回 JSON 504；非 JSON、正文未完成或模型 token 上限截断返回 JSON 错误，不会作为成功生成入账。代理使用完整 JSON 协议并关闭上游流式模式，不自动重试付费请求。

账户失效明确返回 `401 + ACCOUNT_SESSION_INVALID`，登录页保留原工作区归属并要求重新登录。账户存储或配置故障返回 `503 + ACCOUNT_SERVICE_UNAVAILABLE`，不会被视为登录过期；AI 提供方的认证或余额错误返回 502，也不会触发账户跳转或能量购买提示。

迁移已有网站时，Git 和前端构建不会迁移账号数据库。先确认原存储：Netlify 使用原项目的 Blobs，普通 Node/Zeabur 未配置 Redis 时使用 `.data/`，Vercel 需要持久云端存储。恢复原账号需要复用或迁移原账户、邮箱索引、云端存档、权益和订单，并保留用户 ID。显式配置 Netlify Blobs 时，应用继续使用原项目中的三个命名空间，保持原账号、云端内容、权益和订单；不要删除仍承担存储的原 Netlify 项目。原 Netlify 函数继续使用自动运行上下文；跨平台显式配置两项必须同时存在，缺失时返回服务故障，不静默切换到其他库。Netlify 官方访问参数说明见 [Netlify Blobs](https://docs.netlify.com/build/data-and-storage/netlify-blobs/)。新建空 Redis 只能供新账号使用；在确认旧数据保存位置前，不要重启或删除原容器。可先将整套 API 连接仍可用的原后端，但必须核实实际服务域名和 CORS，避免代理到已指向 Vercel 的自定义域名形成循环。

函数执行上限显式设为 60 秒。AI 从请求开始到完整正文使用 50 秒预算，含前置权益检查和联网搜索；权益提交再保留至多 3 秒，Vercel 聊天存储使用每请求独立的绝对 deadline，每次 Upstash 连接与完整正文最多等待 3 秒。守护与沙盘客户端等待 55 秒，留出错误返回时间。这是一组应用预算，不代表所有 Vercel 项目默认只有 60 秒。平台规则见 [Vercel 函数时限](https://vercel.com/docs/functions/configuring-functions/duration)。存储 SET 已发起但未收到完整确认时，可能已经应用，返回“结果尚未确认，请刷新账户核对”，不会自动重试或承诺没有扣费。

## Android

```sh
npm run android:sync
npm run android:apk
```

Android 默认连接现有线上 API。需要连接其他后端时，在构建环境中设置 `VITE_API_BASE_URL`。APK 构建还需要 Android SDK 和 Java 环境；具体打包与分发准备见 `APP_PACKAGING_PREP.md`。

## 产品方向

现有实施记录见 `PRODUCT_WORKSHEET.md` 和 `PRODUCT_OPTIMIZATION_WORKSHEET.md`。优先改善每日主流程、记录延续、等待反馈和失败恢复，保留现有角色与视觉风格。
