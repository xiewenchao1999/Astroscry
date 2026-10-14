# 星卜 Astroscry · 项目规范

一站式网页占卜服务：西方占星（本命盘/每日运势）、塔罗、八字四柱、紫微斗数。
**算法核心为确定性规则引擎，AI 大模型仅可作 opt-in 解读润色层（用户自供 key），禁作卜算驱动**（PRD 约束 + ADR-002）。

## 技术约束（不可违背）

- **纯静态前端**：无后端、无数据库、无账号体系。所有排盘计算在浏览器本地完成，用户生日数据不离开浏览器。
- **无构建步骤**：原生 HTML + CSS + ES Modules，vendor 库以 UMD/单文件形式放入 `site/vendor/`。不引入打包器、不引入框架。
- **依赖白名单**：`lunar-javascript`（八字历法）、`iztro`（紫微）、`astronomy-engine`（天文历表），全部 MIT。星盘 SVG 轮自绘（`js/ui/wheel.mjs`）。除此之外加依赖必须先改本规范。
- **隐私不变量（默认零外部请求）**：默认不得向任何外部主机发起网络请求（无第三方 CDN/API/统计脚本）。同源相对路径 fetch 仅限加载 `site/data/*.json` 打包数据。用户输入的生日等信息只进本地计算，不出浏览器。**唯一例外**：用户在设置面显式开启「AI 解读」并自供 API key 时，可将当前排盘的结构化输出 + 用户问题发送至其指定的 LLM 端点，仅限 `ui/ai-reading.mjs` 模块、仅作解读润色、不得参与排盘计算（详见 ADR-002）；关闭态零外部请求；key 与设置存 localStorage 本机，不进代码仓库。

## 目录约定

```
Astroscry/
├── CLAUDE.md              # 本规范；改实践前先改这里
├── package.json           # 仅 npm scripts（test / serve），无依赖、无 type:module（勿加，会破坏 vendor UMD 的 Node 加载）
├── docs/
│   ├── research/          # 开源调研、资料清单（只增不改历史结论）
│   └── design/            # 产品设计、ADR
├── site/                  # 静态站点根（整目录可部署）
│   ├── index.html         # 首页
│   ├── pages/             # bazi.html / ziwei.html / natal.html / horoscope.html / tarot.html / about.html
│   ├── assets/css/        # base.css（全站主题）；命名 kebab-case
│   ├── js/
│   │   ├── core/          # 纯计算模块（无 DOM、无网络）：bazi.mjs ziwei.mjs astro.mjs tarot.mjs calendar.mjs（农历↔公历）
│   │   ├── ui/            # 可复用组件：layout.mjs birth-profile.mjs（共享出生信息，localStorage）wheel.mjs（星盘 SVG 自绘）motion.mjs（动效/忙碌态/无障碍播报）ai-reading.mjs（opt-in AI 解读润色，独立模块，core 禁止依赖）ai-settings.mjs（设置卡片）
│   │   └── pages/         # 页面胶水层：监听表单 → 调 core → 渲染（*-page.mjs）
│   ├── vendor/            # lunar.js iztro.min.js astronomy.min.js（不改动，注明版本）
│   └── data/              # interpret-*.json（解读语料）、cities.json、tarot.json
├── tests/                 # node --test 断言自检：bazi/ziwei/astro/tarot 回归 + no-network（隐私默认零外部请求 + AI 关闭态零请求 + core 不 import ai-reading）
└── tools/                 # 一次性脚本（vendor 下载、语料转换），用完即删，不进部署
```

## 命名与代码

- 文件 kebab-case，导出函数 camelCase；中文文案进 `data/interpret-*.json`，不硬编码在 js 里（长文案）。
- `js/core/` 每个模块只做计算，输入原始参数、输出结构化对象；渲染一律在 pages/ui 层。
- 刻意简化处必须留 `ponytail:` 注释，写明上限与升级路径。
- 密钥不进代码（本项目应无任何密钥）。

## 验证要求（改完必跑）

```powershell
node --test tests/          # 算法回归（八字/紫微/西占/塔罗基准盘断言）
# 本地预览（ESM 需 http）：
python -m http.server 8642 --directory site
```

- 触碰 `js/core/**` 或 `data/**` 后必须跑 `node --test`，全绿才算完成。
- 新增排盘能力 = 同步新增至少一条已知命例断言（基准来源见 docs/research/可解析资料清单.md）。
- 页面改动的验证：浏览器打开对应页面走一遍主流程（输入 → 排盘 → 解读展示）。

## Git

- commit message 英文、描述意图；push 等用户指示，不自动执行。
