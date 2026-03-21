# 通过环境变量配置 OIDC / OAuth2 提供方

`pb_hooks/oauth2.pb.js` 会在启动时从环境变量写入 PocketBase `users` 集合的 OAuth2 Provider（需已存在 `PB_OAUTH2_CLIENT_ID` 等，否则会跳过）。

## 1. 在 IdP（身份提供商）侧配置重定向 URL

在 **你的 OIDC 提供商** 的 OAuth2 应用里，**授权回调 / 重定向 URL** 填：

- 本机：`http://localhost:8090/api/oauth2-redirect` 或 `http://127.0.0.1:8090/api/oauth2-redirect`
- 线上：`https://你的PB域名/api/oauth2-redirect`

## 2. `.env` 中必填项（Docker 见 `.env.docker.example`）

`PB_OAUTH2_AUTH_URL`、`PB_OAUTH2_TOKEN_URL`、`PB_OAUTH2_USER_URL` **无默认值**，必须在 `.env` 中填写你的 IdP 文档给出的端点。

| 变量 | 说明 |
|------|------|
| `PB_OAUTH2_PROVIDER_NAME` | Provider ID，与前端 `VITE_OAUTH_PROVIDER` 一致 |
| `PB_OAUTH2_CLIENT_ID` / `PB_OAUTH2_CLIENT_SECRET` | IdP 控制台发放的凭据 |
| `PB_OAUTH2_AUTH_URL` | 授权端点 |
| `PB_OAUTH2_TOKEN_URL` | Token 端点 |
| `PB_OAUTH2_USER_URL` | UserInfo 端点（若 IdP 使用不同路径，以文档为准） |
| `PB_OAUTH2_SCOPE` | 按需，常见如 `openid profile email` |
| `PB_OAUTH2_DISPLAY_NAME` | 登录按钮展示名（可选） |

## 3. 若未使用 Docker 自动注入

可在 PocketBase Admin → **Collections → users → Auth options → OAuth2** 中手动添加 Provider，字段与上表一致。

## 4. 若登录报错

- **redirect_uri mismatch**：IdP 侧重定向 URL 与 PocketBase 回调完全一致（协议、主机、端口、路径 `/api/oauth2-redirect`）。
- **401 / 403**：检查 Client ID / Secret 是否与 IdP 应用一致。
- **404 或连接错误**：核对 Auth / Token / UserInfo URL 是否与 IdP 文档一致。
