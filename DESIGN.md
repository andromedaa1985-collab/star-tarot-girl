# 星轨界面设计规范

星轨采用暖白纸感作为新用户默认主题，同时保留用户已经保存的深色偏好。塔罗牌和星轨少女承担品牌视觉，界面用清晰的排版、克制的金色和安静的表面来支持阅读。

## 色彩与表面

统一使用 `src/design-system.css` 中的语义变量；页面通过现有的 `apple-*` Tailwind 色彩别名引用。组件不应自行硬编码另一套日夜颜色。

| 用途 | 浅色 | 深色 |
| --- | --- | --- |
| 页面背景 | `#f7f5ef` | `#171c1c` |
| 内容表面 | `#fdfcf8` | `#202626` |
| 次级表面 | `#eeece4` | `#2a3230` |
| 主要文字 | `#2b302c` | `#efefe7` |
| 次级文字 | `#626a63` | `#a8b3a9` |
| 金色强调 | `#806138` | `#d5bb8c` |
| 分隔边框 | `#dedbd0` | `#36403b` |

普通卡片使用实色表面、细边框和轻阴影。金色用于选中状态、小图标和提示；情绪、图鉴稀有度与图表保持有语义的状态色。主要和次级文字、金色小字在标准表面上达到 4.5:1 对比度。

## 字体与阅读

- 正文与控件：本地 `Railstar Sans` 可变字体，来自 Noto Sans SC 子集；缺字依次回退到系统中文字体。
- 品牌和仪式性标题：本地 `Railstar Serif`，来自 Noto Serif SC 子集；正文保持无衬线。
- 页面标题：手机 28px、桌面 30px，字重 600。
- 内容标题：18px / 1.5；长正文和解读：16px / 1.85–1.9。
- 辅助说明：13px；导航与简短标记：12px。中文不使用大字距。
- 解读使用 `rail-reader`，限制到 68ch，并允许长内容换行。

字体使用 `font-display: swap`，许可证、来源和缺字说明见 `public/fonts/README.md`。

## 布局与组件

桌面宽度达到 1024px 时显示 224px 左侧导航。手机底部和桌面共用「今日、日记、探索、我的」四项主导航，页面与输入区为导航和安全区域留出空间。八字、沙盘、守护和记忆图鉴收在探索页，原有路由保持可用。一般页面正文最大宽度 960px；首页对话区 760px。

首页默认呈现今日抽牌入口，只保留一个实心主按钮；提问按需展开，旧对话由「继续上次解读」进入。签到、牌阵、记忆线索与换装收在「签到与更多」，完整记录始终可以从「牌迹」打开。长解读先显示开头，余下内容可完整展开；追问优先，其余消息操作放在「更多」。首次使用不弹出称呼表单，称呼在个人资料中设置。日记复盘、筛选和账户存档细节采用原生 details，避免用更多卡片和说明占据主流程。

新页面复用 `PageHeader` 和 `rail-page`、`rail-page-content`、`rail-panel`、`rail-field`、`rail-button`、`rail-button-secondary`。主要按钮和表单字段至少 48px 高；字段使用 16px 字号，避免 iPhone 聚焦自动放大。基础组件放在 Tailwind 的 components layer，允许页面 utility 调整布局，优先保证标题、说明与操作的顺序清楚。

弹窗使用原生 `dialog`，或复用 `useDialogFocus` 管理焦点、Escape 与焦点恢复。表单用可见 label，图标按钮提供名称，选择按钮公开 `aria-pressed`。输入法确认候选字时不得触发提交。

动效只服务于状态反馈；支持 `prefers-reduced-motion`，不新增持续发光、模糊背景或装饰动画。

## 参考来源

本次参考其组件组织和设计原则，保留星轨自己的品牌视觉：

- [Microsoft Fluent 语义设计变量](https://github.com/microsoft/fluentui/blob/master/docs/architecture/design-tokens.md)
- [Adobe React Spectrum 的交互与无障碍组件](https://github.com/adobe/react-spectrum)
- [IBM Carbon 的一致组件体系](https://github.com/carbon-design-system/carbon)
- [Adobe Source Han Sans](https://github.com/adobe-fonts/source-han-sans) 与 [Source Han Serif](https://github.com/adobe-fonts/source-han-serif)
