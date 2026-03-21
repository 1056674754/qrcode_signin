# PocketBase OIDC / OAuth2 配置步骤

1. **首次启动**：运行 PocketBase，浏览器打开 Admin（如 `http://127.0.0.1:8090/_/`），创建 superuser。
2. **Auth 集合**：使用默认的 `users` 集合（或你命名的 Auth 集合）。
3. **开启 OAuth2**：进入 **Collections → users → 设置（齿轮）→ Auth options**，启用 **OAuth2**。
4. **添加 Provider**：在 OAuth2 配置中添加一个 Provider，例如：
   - **Name / Provider ID**：`google`（前端调用 `authWithOAuth2({ provider: 'google' })` 时使用该 ID）。
   - **Client ID** / **Client Secret**：从 Google Cloud Console（或你的 OIDC 提供商）创建 OAuth 客户端后获取。
   - **Redirect URI**：在提供商后台配置为 `https://你的域名/api/oauth2-redirect`；本地测试为 `http://127.0.0.1:8090/api/oauth2-redirect`。
5. **CORS**：若前端与 PB 不同源，在 PocketBase **Settings → API** 中把前端的 origin 加入 CORS 允许列表（如 `http://localhost:5173`）。

完成以上后，前端即可使用 `pb.collection('users').authWithOAuth2({ provider: 'google' })` 完成登录。
