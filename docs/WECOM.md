# 企业微信登录接入说明

本仓库默认通过 **自建应用网页授权**，由前端跳转企微、`/oauth-callback` 带回 `code` 后由 PocketBase Hook `pb_hooks/wecom_auth.pb.js` 调企微服务端接口换成员身份并 **创建 / 绑定** `users` 记录（占位邮箱：`wecom+…@wecom.qrcheckin.local`），再放行标准 PocketBase JWT。

## 与企业通用 OAuth 的差异

企业微信不使用「code → POST token 端点换 access_token → userinfo」这一标准三联；而是：

1. `GET https://qyapi.weixin.qq.com/cgi-bin/gettoken`（`corpid` + 应用的 `corpsecret`）
2. `GET https://qyapi.weixin.qq.com/cgi-bin/auth/getuserinfo`（`access_token` + OAuth 颁发的 `code`）

因此无法用 PocketBase 内置 OAuth Provider 一步到位，必须使用本仓库自带的 `/api/qrcheck/wecom-auth`。

## 企微后台需配置的项目

在企业微信 **管理后台 → 应用管理 → 你的自建应用**：

1. **网页授权**：获取 `corpId`、`AgentId`、`Secret`，并勾选/允许 OAuth 网页授权登录（按官方界面为准）。
2. **可信域名**：与用户在浏览器访问本系统的 **域名（及端口）** 完全一致（例如本地开发 `localhost:5173` 若在授权链接中使用，也需登记带端口的可信域名）。
3. **OAuth 网页授权回调域**：填写网站根域名一层（不按路径），与实际站点一致。
4. 浏览器最终回调仍为前端路由 **`/oauth-callback`**（与 OIDC 模式相同），形如 `https://你的域名/oauth-callback`。

官方参考：[网页授权构造链接](https://developer.work.weixin.qq.com/document/path/91120)、[获取用户登录身份](https://developer.work.weixin.qq.com/document/path/98176)。

## 环境变量

### 前端（`VITE_`）

| 变量 | 说明 |
|------|------|
| `VITE_AUTH_MODE` | `wecom`（默认）或 `oauth2` |
| `VITE_WECOM_CORP_ID` | 企业 ID `ww…` |
| `VITE_WECOM_AGENT_ID` | 自建应用 `agentid` |

### PocketBase（与 Docker / 宿主进程注入）

| 变量 | 说明 |
|------|------|
| `PB_WECOM_CORP_ID` | 与前端一致的企业 ID |
| `PB_WECOM_AGENT_SECRET` | 应用 **Secret**，仅服务端使用 |
| `PB_WECOM_FETCH_USER_DETAIL` | 可选：`1`、`true`、`yes` 时尝试调用「读取成员」接口同步 `users` 表的 `name`（需在企微为该应用授予通讯录相关权限），否则仅用企微 userid 作为主展示 |

## Docker Compose

参见根目录 [.env.docker.example](../.env.docker.example)：`web` 构建参数与 `pocketbase` 容器均需配置上述变量。

## 切回 OAuth2 / OIDC

将 `VITE_AUTH_MODE=oauth2`，按 [OIDC-PROVIDER.md](OIDC-PROVIDER.md) 配置 `PB_OAUTH2_*`，并在 PocketBase Admin 中维护通用 OAuth Provider；前端登录将走原先的 `authWithOAuth2Code` 流程。
