# 生产部署指南

## 架构说明

生产环境使用 **nginx 反向代理**统一入口，前端与 PocketBase API **同源**，避免 CORS 问题。

```
用户浏览器
  ↓
nginx:80/443 (统一入口)
  ├─ / → 前端静态文件
  ├─ /api/* → 代理到 pocketbase:8090/api/*
  └─ /_/* → 代理到 pocketbase:8090/_/* (Admin)
```

## 部署步骤

### 1. 服务器准备

- Docker 和 Docker Compose
- 域名 DNS 指向服务器 IP
- 防火墙开放 80/443 端口

### 2. 配置环境变量

```bash
cp .env.docker.example .env
```

编辑 `.env`：

```env
# 前端：生产留空 = 同源（nginx 代理）
VITE_POCKETBASE_URL=
VITE_AUTH_MODE=wecom
VITE_WECOM_CORP_ID=你的企业corpId
VITE_WECOM_AGENT_ID=自建应用AgentId

# OAuth2/OIDC（仅当 VITE_AUTH_MODE=oauth2）
# VITE_OAUTH_PROVIDER=oidc

# Nginx（默认 80，生产建议 443）
NGINX_PORT=80

# PocketBase Admin（可选）
PB_ADMIN_PASSWORD=your-secure-password

# ----- 企业微信（VITE_AUTH_MODE=wecom 时必填）
PB_WECOM_CORP_ID=与前端一致的企业ID
PB_WECOM_AGENT_SECRET=应用Secret
# PB_WECOM_FETCH_USER_DETAIL=1

# ----- OAuth2（仅 oauth2 模式；端点参见 IdP 文档）
PB_OAUTH2_PROVIDER_NAME=oidc
PB_OAUTH2_CLIENT_ID=你的client_id
PB_OAUTH2_CLIENT_SECRET=你的client_secret
PB_OAUTH2_AUTH_URL=https://你的IdP域名/oauth/authorize
PB_OAUTH2_TOKEN_URL=https://你的IdP域名/oauth/token
PB_OAUTH2_USER_URL=https://你的IdP域名/oauth/userinfo
PB_OAUTH2_SCOPE=read email profile openid
```

说明：环境变量全貌以根目录 [.env.docker.example](../.env.docker.example) 为准。**企业微信**步骤见 [WECOM.md](WECOM.md)。

### 3. 配置 SSL（HTTPS）

**选项 A：Let's Encrypt（推荐）**

使用 [certbot](https://certbot.eff.org/) 或 [acme.sh](https://github.com/acmesh-official/acme.sh) 获取证书，然后修改 `nginx/nginx.conf` 添加 SSL 配置：

```nginx
server {
    listen 443 ssl http2;
    server_name yourdomain.com;

    ssl_certificate /etc/nginx/ssl/fullchain.pem;
    ssl_certificate_key /etc/nginx/ssl/privkey.pem;

    # ... 其他配置同默认
}

server {
    listen 80;
    server_name yourdomain.com;
    return 301 https://$server_name$request_uri;
}
```

在 `docker-compose.yml` 的 nginx 服务中添加证书卷：

```yaml
volumes:
  - ./nginx/nginx.conf:/etc/nginx/conf.d/default.conf:ro
  - ./web/dist:/usr/share/nginx/html:ro
  - /etc/letsencrypt:/etc/nginx/ssl:ro  # Let's Encrypt 证书
```

**选项 B：已有证书**

将证书文件放到 `nginx/ssl/`，修改 nginx 配置指向该路径。

### 4. 启动服务

```bash
docker compose up -d --build
```

### 5. 回调与授权域名

使用 **通用 OAuth/OIDC** 时，在 IdP 侧登记重定向：`https://你的域名/oauth-callback`。  
使用 **企业微信**时，须在企微自建应用中配置网页授权可信域名（及回调域）；浏览器最终仍落到 `/oauth-callback`，参见 [docs/WECOM.md](WECOM.md)。

### 6. OAuth Provider（oauth2 模式）

若使用 `pb_hooks/oauth2.pb.js`，一般无需再在 Admin 中手填 OAuth Provider；仍以 [docs/OIDC-PROVIDER.md](OIDC-PROVIDER.md) 为准。

### 7. 建表

按 [docs/COLLECTIONS.md](COLLECTIONS.md) 在 Admin 中创建 `events` 和 `check_ins` 表。

## 维护

- **查看日志**：`docker compose logs -f`
- **重启服务**：`docker compose restart`
- **更新代码**：`docker compose up -d --build web nginx`
- **备份数据**：`./pb_data` 目录（SQLite 数据库）

## 故障排查

- **502 Bad Gateway**：检查 `pocketbase` 容器是否运行（`docker compose ps`）
- **404 on /api**：检查 nginx 配置中的 `proxy_pass` 是否正确
- **OAuth**：IdP / 通用 OAuth 控制台中的回调地址须与前端一致
- **企业微信**：校验可信域名是否与访问 URL 完全一致（包括端口）；服务器未配置环境变量时出现「企业微信登录未配置」，参见 `.env.docker.example`
