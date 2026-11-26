# 小鱼来了 · uni-app 多端前端

一套代码同时产出 **H5 / 抖音小程序 / 微信小程序**。

## 当前状态

| 目标 | 命令 | 状态 |
|---|---|---|
| H5 | `npm run build:h5` | ✅ 构建通过（42 页） |
| 抖音小程序 | `npm run build:mp-toutiao` | ✅ 构建通过（42 页 / 808 KB，产物在 `dist/build/mp-toutiao`） |
| 微信小程序 | `npm run build:mp-weixin` | 未验证 |

> 构建已验证，**运行未验证**：本机没有抖音开发者工具，且小程序请求需要已备案的域名（当前备案中）。

## 为什么另起一套

现有主站前端是**原生 ESM + hash 路由 SPA**（62 个模块 / 约 35,000 行）：

```js
import * as viewsHome from './views-home.js';   // 浏览器原生模块
location.hash = '#/detail/xxx';                  // hash 路由
document.querySelector('.card')                  // 直接操作 DOM
```

小程序**没有 DOM、没有 `<script type="module">`、没有 hash 路由**，无法直接复用。
uni-app 的价值是：写一次 Vue 组件，编译成 H5 / 抖音 / 微信三端。

## 目录结构

```
src/
├── main.js              应用入口
├── App.vue              全局样式与生命周期
├── pages.json           页面与 tabBar 配置
├── manifest.json        各端配置（appid 在这里填）
├── uni.scss             设计变量（与主站同色）
├── api/
│   ├── client.js        跨端请求封装（uni.request / uni.uploadFile）
│   └── index.js         后端接口封装
├── store/
│   └── user.js          登录态（token + 用户，存 storage）
└── pages/
    ├── home/            首页：搜索入口 + OPC 入口 + 分类 + 列表 + 下拉刷新 + 触底加载
    ├── search/          搜索：输入防抖 + 联想建议 + 结果列表
    ├── detail/          详情：正文 + AI 解读 + 原生分享
    ├── opc/             OPC 服务专区：7 个服务方向 + 可接真实项目 + 入驻 CTA
    ├── notifications/   消息：未读角标 + 全部已读 + 点击跳转
    ├── mylistings/      我发布的：按状态筛选（全部/已发布/草稿）
    ├── login/           登录：手机验证码 / 抖音授权
    ├── publish/         发布：分类 / 标题 / 正文 / 城市行业
    └── account/         我的：资料 + 消息未读 + 我的发布 + OPC + 退出
```

## 跑起来

```bash
cd xiaoyu-uniapp
npm install            # 首次；本机需 --ignore-scripts 才能装（见下方"已知问题"）

# H5 开发（需要主站后端在跑，默认同源 /api）
npm run dev:h5         # http://localhost:5178

# 抖音小程序：构建后用「抖音开发者工具」导入 dist/build/mp-toutiao
npm run build:mp-toutiao
```

## H5 部署与 API 地址

H5 默认 **同源** 访问 `/api`（`apiBase = ''`）。两种部署方式：

1. **推荐**：把 `dist/build/h5` 的内容放进主站 `public/` 的某个子目录，
   由同一个后端提供，天然同源，无需改代码。
2. 独立域名：页面加载后调 `setApiBase('https://api.example.com')`，
   并确保后端开了 CORS。

小程序端没有同源概念，必须显式配置 `MP_DEFAULT_BASE`（已备案 https 域名）。

## 关键约束（踩过的坑）

### 1. 小程序只能请求已备案的 https 域名

抖音/微信后台都要配「request 合法域名」，且域名必须 **ICP 备案**。
本地调试时在开发者工具里勾「不校验合法域名」。

改默认域名：`src/api/client.js` 里的 `MP_DEFAULT_BASE`。

### 2. 小程序没有 Cookie

登录态只能存 storage + `Authorization` 头。`src/api/client.js` 已经这样做了。

### 3. 抖音返回体把错误放在 `data.error_code`

HTTP 状态码仍是 200，所以后端按 `error_code` 判错，不能只看状态码。

### 4. 小程序不能整页跳外部 OAuth

`login.vue` 里已做分支：H5 直接 `location.href`，小程序用 webview 承载。

### 5. Node 版本

当前用的 uni-app 版本 `3.0.0-alpha-5030820261124002` 要求 **Node ≥ 22.12**，本机是 20.18，
构建能过但会打 `EBADENGINE` 警告。长期建议升级 Node。

### 6. npm 安装需要 `--ignore-scripts`

本机沙箱会拒绝 npm 的生命周期脚本，需加 `--ignore-scripts`：

```bash
npm install --ignore-scripts
```

## 迁移进度（42 页已全部迁移）

### 核心流程
| 主站模块 | uni-app 页面 |
|---|---|
| `views-home.js` | `pages/home` |
| 搜索 | `pages/search` |
| 详情 | `pages/detail` |
| `views-publish.js` | `pages/publish`（文件上传待接） |
| `views-account.js` 登录 | `pages/login` |
| `views-account.js` 我的 | `pages/account` |
| 消息通知 | `pages/notifications` |
| 我的发布 | `pages/mylistings` |
| 收藏 | `pages/favorites` |
| 通讯录 | `pages/contacts` |
| 兴趣标签 | `pages/tags` |
| 账号绑定 | `pages/bindings` |
| 会员权益 | `pages/membership` |
| 推广有礼 | `pages/referral` |
| 反馈 | `pages/feedback` |

### 业务专区
| 主站模块 | uni-app 页面 |
|---|---|
| `views-opc.js` | `pages/opc` |
| `views-brainco.js` | `pages/brainco` |
| `views-invest.js` | `pages/invest` |
| `views-bidding.js` | `pages/bidding` |
| `views-provider.js` | `pages/provider` |
| `views-services.js` | `pages/services` |
| `views-funds.js` | `pages/funds` |
| `views-topic.js` 创业大赛 | `pages/topic` |
| `views-startup.js` | `pages/startup` |
| `views-estate.js` | `pages/estate` |
| `views-overseas.js` | `pages/overseas` |
| `views-metaverse.js` | `pages/metaverse` |
| `views-steward.js` | `pages/steward` |

### 内容
| 主站模块 | uni-app 页面 |
|---|---|
| `views-news.js` | `pages/news` + `pages/news/detail` |
| `views-drama.js` | `pages/drama` |
| `views-shorts.js` | `pages/shorts` |
| `views-forum.js` | `pages/forum` + `pages/forum/posts` |

### 实时（列表版，能力受限）
| 主站模块 | uni-app 页面 | 说明 |
|---|---|---|
| `views-chat.js` | `pages/chat` | 仅房间列表；实时消息需接 WebSocket/SSE 或云开发实时库 |
| `views-meeting.js` | `pages/meeting` | 仅会议列表；参会需 WebRTC 或第三方会议 SDK |
| `views-live.js` | `pages/live` | 仅直播列表；播放需配 video 合法域名 |

### 静态
`pages/about`、`pages/legal`（隐私/协议/免责，按 `?kind=` 切换）、`pages/api`、`pages/card`、`pages/welcome`

### 未迁移（有意不迁）
管理后台（`admin-*` 系列）—— 小程序面向 C 端用户，管理操作仍在网页端。
## 上线前必须完成

1. **ICP 备案**（进行中）—— 没有备案，小程序无法配置合法域名
2. **抖音开放平台小程序** —— 企业账号 + 主体认证（营业执照：杭州硕鱼科技有限公司 91330108MAKRA7J83D）
3. `manifest.json` 填 `mp-toutiao.appid`
4. 抖音后台配置 request / uploadFile / webview 合法域名
5. 提交审核（信息发布类目可能需要额外资质）

## 与主站的关系

- **后端完全共用**：同一套 `/api/*`，不需要改服务端
- **数据完全共用**：同一份 JSON 存储
- **两套前端并存**：主站继续用原生 SPA（功能最全），uni-app 负责小程序端
