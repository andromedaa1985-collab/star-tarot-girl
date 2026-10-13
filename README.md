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

## Android

```sh
npm run android:sync
npm run android:apk
```

Android 默认连接现有线上 API。需要连接其他后端时，在构建环境中设置 `VITE_API_BASE_URL`。APK 构建还需要 Android SDK 和 Java 环境；具体打包与分发准备见 `APP_PACKAGING_PREP.md`。

## 产品方向

现有实施记录见 `PRODUCT_WORKSHEET.md` 和 `PRODUCT_OPTIMIZATION_WORKSHEET.md`。优先改善每日主流程、记录延续、等待反馈和失败恢复，保留现有角色与视觉风格。
