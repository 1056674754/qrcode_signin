# 扫码签到（PocketBase + 动态二维码）

基于 PocketBase 的签到系统：OIDC 登录、主办创建活动、大屏展示每 3 秒更新的二维码、参与者扫码打卡。动态码采用 HMAC-SHA256 时间步（3 秒）校验，防止截图/转发滥用。

## 目录结构

```
docker-compose.yml   # 可选：PocketBase + nginx 前端
pb_hooks/            # 服务端 JS 钩子（events / check_ins）
pb_data/             # 运行后生成（Docker 或本地 PB 数据，勿提交）
web/                 # Vite + React + TypeScript 前端
docs/                # Collections 与 OIDC 配置说明
pocketbase/          # 若不用 Docker：可放本地下载的可执行文件
```

## 启动顺序

1. **安装 PocketBase**  
   从 [pocketbase.io](https://pocketbase.io/docs/) 下载对应平台二进制，放到 `pocketbase/` 目录（或 PATH）。PocketBase 默认在 **可执行文件所在目录** 下查找 `pb_hooks`，因此请将本仓库的 `pb_hooks` 复制或链接为 `pocketbase/pb_hooks`，然后在 `pocketbase/` 目录下执行 `./pocketbase serve`（或从项目根执行并指定工作目录）。详见官方 [JS Hooks](https://pocketbase.io/docs/js-event-hooks/) 文档。

2. **首次运行**  
   启动后访问 Admin（如 `http://127.0.0.1:8090/_/`），创建 superuser。

3. **建表与规则**  
   按 [docs/COLLECTIONS.md](docs/COLLECTIONS.md) 创建 `events`、`check_ins` 表及 API 规则；按 [docs/OIDC.md](docs/OIDC.md) 配置 OAuth2/OIDC。

4. **前端**  
   ```bash
   cd web
   npm install
   cp .env.example .env   # 编辑 VITE_POCKETBASE_URL 指向 PB 地址
   npm run dev
   ```
   访问 `http://localhost:5173`，先 OIDC 登录，再使用「我的活动」「大屏展示」「扫码签到」。

### Docker Compose（推荐生产环境）

项目根目录提供 [docker-compose.yml](docker-compose.yml)：**nginx 反向代理**统一入口，前端与 PocketBase API 同源，避免 CORS。

```bash
cp .env.docker.example .env   # 生产环境：VITE_POCKETBASE_URL 留空（同源）
docker compose up -d --build
```

**架构**：
- **nginx**（端口 80，可通过 `NGINX_PORT` 环境变量修改）：统一入口
  - `/` → 前端静态文件
  - `/api/*` → 代理到 `pocketbase:8090/api/*`
  - `/_/*` → 代理到 `pocketbase:8090/_/*`（Admin）
- **pocketbase**：仅内部暴露 8090，不对外映射
- **web**：仅构建静态文件到 `./web/dist`，由 nginx 托管

**访问**：
- 前端：<http://localhost>（或你配置的端口）
- Admin：<http://localhost/_/>（通过 nginx 代理）

**生产部署**：
1. 设置域名 DNS 指向服务器
2. 配置 SSL（Let's Encrypt / 证书），nginx 监听 443
3. `.env` 中 `VITE_POCKETBASE_URL` 留空（前端用相对路径 `/api`）
4. 在你的 OIDC 提供商（IdP）后台，重定向 URL 填：`https://你的域名/oauth-callback`（与前端 `Login.tsx` / `OAuthCallback.tsx` 中的 `redirect_uri` 一致）

首次仍需在 Admin 中建表并配置 OAuth2（见 [docs/COLLECTIONS.md](docs/COLLECTIONS.md) 与 [docs/OIDC-PROVIDER.md](docs/OIDC-PROVIDER.md)）。

## 环境变量里的 `VITE_` 前缀

[Vite](https://vitejs.dev/guide/env-and-mode.html#env-files) 约定：**只有以 `VITE_` 开头的变量才会被打进前端包**，并通过 `import.meta.env.VITE_*` 暴露给浏览器代码。这样可以把「仅服务端使用」的密钥（如数据库连接串）放在 `.env` 里，而不会被误打包进 JS，避免泄露到用户浏览器。本项目中 `VITE_POCKETBASE_URL`、`VITE_OAUTH_PROVIDER` 必须在浏览器里使用，因此需要 `VITE_` 前缀；纯 Node 脚本若不用 Vite，则不必遵守此前缀。

## CORS 与回调 URL

- **CORS**：前端与 PocketBase 不同源时，在 Admin → **Settings → API** 中把前端 origin（如 `http://localhost:5173`）加入 CORS 允许列表。
- **OAuth 回调**：在 OIDC 提供商后台配置的 Redirect URI 必须与前端使用的回调地址一致（`window.location.origin + '/oauth-callback'`），例如：
  - 本地（Vite 默认）：`http://localhost:5173/oauth-callback` 或 `http://127.0.0.1:5173/oauth-callback`
  - 生产（与前端同源）：`https://你的域名/oauth-callback`

## 安全与可选防重放

- **密钥**：`events.secret_key` 仅由服务端 Hook 生成，且通过 API 规则仅对活动 owner 可见；大屏请使用主办已登录的浏览器打开，避免泄露密钥。
- **动态码**：二维码内容为 `{ v, e, c, m }`，其中 `m` 为当前 3 秒时间步的 HMAC-SHA256(secret, `${counter}|${eventId}`) 的 hex；服务端在 `pb_hooks/check_ins.pb.js` 中对 `counter` 做容差校验（默认约 ±4 个时间步），通过后才写入打卡记录。
- **防重放（可选）**：当前实现允许同一用户在有效时间窗口内多次提交同一码；若需「同一 3 秒窗口内每人仅能打卡一次」，可在 `check_ins` 表增加 `counter` 字段并在 Hook 中查库去重，或对 `(user, event, counter)` 建唯一约束。

## 技术说明

- **HMAC 对齐**：前端使用 Web Crypto `crypto.subtle.sign('HMAC', key, data)` 输出 hex；服务端使用 PocketBase `$security.hs256(text, secret)`。若遇校验失败，请确认两边消息格式一致（`${counter}|${eventId}`）及 hex 大小写一致。
- **扫码**：支持 Barcode Detection API 的浏览器会使用摄像头实时扫码；否则可点击「上传二维码图片」使用 jsQR 解码。
