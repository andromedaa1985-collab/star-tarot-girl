# 星轨界面设计规范

星轨根据用户 2026-10-15 提供的两张 ORISO 编辑器参考图，采用「灰雾空间、深色主画布、悬浮磨砂玻璃」视觉。此方向替代原暖白纸感，同时保留用户已经保存的深色偏好。使用场景是用户拿起手机，安静地抽一张牌、整理心情；塔罗牌与少女承担视觉主体，操作清楚且克制。

## 色彩与表面

统一使用 `src/design-system.css` 中的语义变量；页面通过现有的 `apple-*` Tailwind 色彩别名引用。组件不应自行硬编码另一套日夜颜色。

| 用途 | 浅色 | 深色 |
| --- | --- | --- |
| 页面背景 | `#d9dcde` | `#1d222a` |
| 实色输入表面 | `#f0f2f3` | `#292f39` |
| 次级表面 | `#e0e4e6` | `#363e49` |
| 主要文字 | `#272c32` | `#eef0f2` |
| 次级文字 | `#414b55` | `#b2bcc8` |
| 中性强调 | `#3d4d5c` | `#bdcbd9` |
| 分隔边框 | `#bdc4c9` | `#46515e` |

材质分三层：静态灰雾背景、深色仪式画布、半透明操作表面。`--rail-glass-bg` 用于导航和悬浮面板，配合 22px 背景模糊、细亮边和顶部内高光。`--rail-reading-bg` 用于解读、日记正文和弹窗，浅色 94%、深色 96% 不透明度，保持内容可读。字段继续使用实色 `--app-surface`。不在整页或滚动祖先上增加滤镜；长列表不逐项叠加模糊。无 backdrop-filter 支持或用户减少透明效果时使用实色回退。

金色保留在少量权益提示，情绪、图鉴稀有度与图表保持有语义的状态色。主按钮以深浅明度区分，不用彩色渐变文字。普通正文对比度目标至少 4.5:1，细亮边只承担材质表达。

## 字体与阅读

- 正文与控件：本地 `Railstar Sans` 可变字体，来自 Noto Sans SC 子集；缺字依次回退到系统中文字体。
- 品牌和仪式性标题：本地 `Railstar Serif`，来自 Noto Serif SC 子集；正文保持无衬线。
- 页面标题：手机 28px、桌面 30px，字重 500；首页仪式标题采用衬线 22–36px。
- 内容标题：18px / 1.5；长正文和解读：16px / 1.85–1.9。
- 辅助说明：13px；导航与简短标记：12px。中文不使用大字距。
- 解读使用 `rail-reader`，限制到 68ch，并允许长内容换行。

字体使用 `font-display: swap`，许可证、来源和缺字说明见 `public/fonts/README.md`。

## 布局与组件

桌面宽度达到 1024px 时显示 196px 悬浮磨砂侧栏，离窗口边缘 18px。手机底部和桌面共用「今日、日记、探索、我的」四项主导航。手机导航高 72px，底部间距 10px 加安全区域，页面及输入区通过 `--rail-nav-height: 88px` 留出空间。八字、沙盘、守护和记忆图鉴收在探索页，原有路由保持可用。一般页面正文最大宽度 960px；首页对话区 760px。

首页默认呈现今日抽牌入口，只保留一个实心主按钮；提问按需展开，旧对话由「继续上次解读」进入。签到、牌阵、记忆线索与换装收在「签到与更多」，完整记录始终可以从「牌迹」打开。长解读先显示开头，余下内容可完整展开；追问优先，其余消息操作放在「更多」。首次使用不弹出称呼表单，称呼在个人资料中设置。日记复盘、筛选和账户存档细节采用原生 details，避免用更多卡片和说明占据主流程。

新页面复用 `PageHeader` 和 `rail-page`、`rail-page-content`、`rail-panel`、`rail-field`、`rail-button`、`rail-button-secondary`。主要按钮和表单字段至少 48px 高；字段使用 16px 字号，避免 iPhone 聚焦自动放大。基础组件放在 Tailwind 的 components layer，允许页面 utility 调整布局，优先保证标题、说明与操作的顺序清楚。

弹窗使用原生 `dialog`，或复用 `useDialogFocus` 管理焦点、Escape 与焦点恢复。表单用可见 label，图标按钮提供名称，选择按钮公开 `aria-pressed`。输入法确认候选字时不得触发提交。

塔罗首页与日记使用独立的原生 SVG 装饰图：银色月牙、细轨道、烟灰玻璃牌与书页。图形隐藏于辅助技术，SVG 定义按实例隔离，不增加下载资源或持续动画。动效只服务于状态反馈，支持 `prefers-reduced-motion`；背景色洗与材质模糊保持静态。

## 参考来源

视觉材质与构图以用户本轮提供的 ORISO 两张参考截图为准；保留星轨自己的品牌角色与牌面。以下既有来源继续用于组件组织和设计原则：

- [Microsoft Fluent 语义设计变量](https://github.com/microsoft/fluentui/blob/master/docs/architecture/design-tokens.md)
- [Adobe React Spectrum 的交互与无障碍组件](https://github.com/adobe/react-spectrum)
- [IBM Carbon 的一致组件体系](https://github.com/carbon-design-system/carbon)
- [Adobe Source Han Sans](https://github.com/adobe-fonts/source-han-sans) 与 [Source Han Serif](https://github.com/adobe-fonts/source-han-serif)
