# 扫码签到（PocketBase + 动态二维码）

基于 PocketBase 的签到系统：**默认企业微信网页授权登录**（也可用通用 OAuth2/OIDC）；主办创建活动、大屏展示每 3 秒更新的二维码、参与者扫码打卡。动态码采用 HMAC-SHA256 时间步（3 秒）校验，防止截图/转发滥用。

## 目录结构

```
docker-compose.yml   # 可选：PocketBase + nginx 前端
pb_hooks/            # 服务端 JS 钩子（events / check_ins）
pb_data/             # 运行后生成（Docker 或本地 PB 数据，勿提交）
web/                 # Vite + React + TypeScript 前端
docs/                # Collections、企业微信与 OIDC 配置说明
pocketbase/          # 若不用 Docker：可放本地下载的可执行文件
```

## 启动顺序

1. **安装 PocketBase**  
   从 [pocketbase.io](https://pocketbase.io/docs/) 下载对应平台二进制，放到 `pocketbase/` 目录（或 PATH）。PocketBase 默认在 **可执行文件所在目录** 下查找 `pb_hooks`，因此请将本仓库的 `pb_hooks` 复制或链接为 `pocketbase/pb_hooks`，然后在 `pocketbase/` 目录下执行 `./pocketbase serve`（或从项目根执行并指定工作目录）。详见官方 [JS Hooks](https://pocketbase.io/docs/js-event-hooks/) 文档。

2. **首次运行**  
   启动后访问 Admin（如 `http://127.0.0.1:8090/_/`），创建 superuser。

3. **建表与登录**  
   按 [docs/COLLECTIONS.md](docs/COLLECTIONS.md) 创建 `events`、`check_ins` 表及 API 规则。  
   **企业微信**：见 [docs/WECOM.md](docs/WECOM.md)（默认）。  
   **通用 OAuth2 / OIDC**：见 [docs/OIDC.md](docs/OIDC.md)。

4. **前端**  
   ```bash
   cd web
   npm install
   cp .env.example .env   # 填入 VITE_WECOM_* 或（oauth2）VITE_POCKETBASE_URL / VITE_OAUTH_PROVIDER
   npm run dev
   ```
   访问 `http://localhost:5173`，先完成登录（企微或 OIDC），再使用「我的活动」「大屏展示」「扫码签到」。

### Docker Compose（推荐生产环境）

**前端构建前置门禁已调整**：`web/Dockerfile` 只接收已在镜像外构建、完成私有 sourcemap 上传并核验的精确静态产物，不再在镜像里安装依赖或运行 Vite。现有 Compose 的前端 build args 不再负责构建配置；OAuth/企微的公开配置须在镜像外构建时提供。操作顺序、凭据边界、未验证项见 [.monitoring-readme.md](.monitoring-readme.md)。未通过上传门禁，镜像构建必须失败；不能直接沿用下方旧的首次启动命令跳过前置步骤。

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
4. 在生产 **企业微信** 管理后台为自建应用填写 **可信域名** 与回调域；在使用 **通用 OAuth / IdP** 时，重定向 URL 填：`https://你的域名/oauth-callback`（与前端同源）。

初次部署仍需在 Admin 中建集合；OAuth2 Provider 仅在 `VITE_AUTH_MODE=oauth2` 时需要在 Admin 或通过 `PB_OAUTH2_*`（见 [docs/OIDC-PROVIDER.md](docs/OIDC-PROVIDER.md)）注入。企业微信见 [docs/WECOM.md](docs/WECOM.md)。

[Vite](https://vitejs.dev/guide/env-and-mode.html#env-files) 约定：**只有以 `VITE_` 开头的变量才会被打进前端包**，并通过 `import.meta.env.VITE_*` 暴露给浏览器代码。这样可以把「仅服务端使用」的密钥（如数据库连接串）放在 `.env` 里，而不会被误打包进 JS，避免泄露到用户浏览器。本项目中 `VITE_AUTH_MODE`、`VITE_WECOM_CORP_ID`、`VITE_WECOM_AGENT_ID`、以及沿用 OIDC 时的 `VITE_OAUTH_PROVIDER`，均须在浏览器中使用，因此前缀为 `VITE_`。仅服务端密钥（企微 Agent Secret、OAuth client secret）只能通过 PocketBase/Docker 环境变量注入。

## CORS 与回调 URL

- **CORS**：前端与 PocketBase 不同源时，在 Admin → **Settings → API** 中把前端 origin（如 `http://localhost:5173`）加入 CORS 允许列表。
- **OAuth**：使用通用 IdP 时，Redirect URI 须为同源 `…/oauth-callback`。**企业微信**：按 [docs/WECOM.md](docs/WECOM.md) 填写可信域名与授权回调（页面仍落在 `/oauth-callback`）。
  - Vite：`http://localhost:5173/oauth-callback`
  - 生产：`https://你的域名/oauth-callback`


## 安全与可选防重放

- **服务器签发**：主办打开大屏后，每 3 秒调用 `GET /api/qrcheck/events/{eventId}/proof`。接口要求登录且为活动 owner，按服务器时间生成 `{ v, e, c, m, server_time_ms, expires_at_ms }`，响应禁止缓存；不返回活动密钥。浏览器不再用本机时间签名。
- **失效保护**：展示端用 `performance.now()` 计算请求耗时和显示期限，不依赖电脑日期。网络错误、断网、隐藏页面立即清空二维码；单次请求最多等待 5 秒，每份码最多展示到请求开始后 6 秒。恢复网络、回到前台或恢复页面时重新获取；迟到的响应/绘图不会重新显示旧码。
- **密钥**：`events.secret_key` 仅供服务端签发；活动 API 响应隐藏该字段，不修改数据库里的原值。新展示页与隐藏密钥的 Hook 必须配套发布，旧展示页需要刷新。
- **动态码**：二维码仍使用 v1 `{ v, e, c, m }` 协议，`m` 为服务器 3 秒时间步的 HMAC-SHA256(secret, `${counter}|${eventId}`) hex；服务端在 `pb_hooks/check_ins.pb.js` 中保持 ±4 个时间步校验，不放宽旧码有效期。`expires_at_ms` 是当前后端校验窗口的上界，不是新增的长期授权。
- **登录延迟**：外部扫码后登录仍会消耗二维码有效期；若登录结束时已过期，需要重新扫描实时码。本改动不延长有效期，也不解决所有登录链路问题。
- **防重放（可选）**：当前实现允许同一用户在有效时间窗口内多次提交同一码；若需「同一 3 秒窗口内每人仅能打卡一次」，可在 `check_ins` 表增加 `counter` 字段并在 Hook 中查库去重，或对 `(user, event, counter)` 建唯一约束。

## 回归验证

前端构建沿用 `cd web && npm run build`。服务器签发与展示生命周期回归不新增依赖，使用 Node.js 22.6+：

```bash
node --experimental-strip-types --test .tests/*.test.mjs
```

覆盖服务端签名与现有校验兼容、主办/非主办权限、密钥不出库、客户端日期前后偏移一天、断网恢复、请求超时、页面暂停和迟到响应。生产发布前还应在独立 PocketBase 数据目录验证真实 HTTP 与浏览器动线；不要将测试用户/活动写入生产数据库。

## 技术说明

- **HMAC 对齐**：服务器签发与校验均使用 PocketBase `$security.hs256(text, secret)`，消息保持 `${counter}|${eventId}`；浏览器只将服务器载荷画成二维码，不参与签名或授时。
- **扫码**：支持 Barcode Detection API 的浏览器会使用摄像头实时扫码；否则可点击「上传二维码图片」使用 jsQR 解码。
