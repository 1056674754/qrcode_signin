# PocketBase Collections 定义

在 Admin (Settings → Collections) 中新建以下两张 Base 表（`users` 为系统自带 Auth 表，只需配置 OIDC）。

## 1. events（活动表）

- **Type**: Base
- **Name**: `events`

| 字段名      | 类型     | 说明 |
|------------|----------|------|
| name       | Text     | 活动名称 |
| owner      | Relation | 单选，关联 `users`，创建者 |
| secret_key | Text     | 用于 HMAC 的密钥，由服务端 Hook 写入，不对外暴露 |

**API 规则**

- **List**: `owner = @request.auth.id`
- **View**: `owner = @request.auth.id`
- **Create**: `@request.auth.id != ""`
- **Update**: `owner = @request.auth.id`
- **Delete**: `owner = @request.auth.id`

**secret_key 字段**：在 Field 设置里可将 View 规则设为 `owner = @request.auth.id`，这样仅活动创建者能通过 API 读取该字段（大屏需用主办账号登录后拉取）。

---

## 2. check_ins（打卡记录表）

- **Type**: Base
- **Name**: `check_ins`

| 字段名 | 类型     | 说明 |
|--------|----------|------|
| user   | Relation | 单选，关联 `users`，打卡人 |
| event  | Relation | 单选，关联 `events`，活动 |
| proof  | Text     | 一次性校验载荷（JSON），Hook 校验通过后可清空或保留作审计 |

**API 规则**

- **List**: `@request.auth.id != ""`（或按需限制为本人/活动主办可见）
- **View**: `@request.auth.id != ""`
- **Create**: `@request.auth.id != "" && user = @request.auth.id`
- **Update**: 可不开放或同 List
- **Delete**: 可不开放或同 List

Create 规则确保客户端只能把 `user` 设为当前登录用户，防止伪造他人打卡。实际的时间码校验在 `pb_hooks/check_ins.pb.js` 中完成。

---

## users（系统自带）

- 使用默认 Auth 集合（通常名为 `users`）。
- 在 Collection 设置中启用 **OAuth2**，添加 Provider（如 Google），填写 Client ID、Client Secret；在 IdP 控制台登记的 Redirect URI 须为前端回调（如本地 `http://127.0.0.1:5173/oauth-callback`）。
- 详见 README 的 OIDC 配置步骤。
