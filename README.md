# Cloudflare Worker 域名分发系统

## 功能
- 用户注册 / 登录（SHA-256 密码加密）
- 管理个人域名列表（JSON 存储在 D1 数据库）
- 调用 Cloudflare API 自动分发子域名
- 前端基于 Bootstrap3，部署在同一 Worker 内

## 部署步骤
1. 修改 `wrangler.toml` 中的变量：
   - CLOUDFLARE_API_TOKEN
   - CLOUDFLARE_ZONE_ID
   - SESSION_SECRET

2. 创建数据库并应用 schema：
   ```bash
   wrangler d1 create subdomain_users
   wrangler d1 execute subdomain_users --file=./schema.sql
   ```

3. 部署：
   ```bash
   wrangler deploy
   ```

## 常见问题
- **登录失败？** 确认密码使用的是 SHA-256 加密。
- **DNS 不生效？** 确认 Cloudflare API Token 权限正确（需要 Zone:DNS 编辑权限）。
