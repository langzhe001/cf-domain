import { Hono } from 'hono'
import { sha256 } from 'crypto-hash'
import { Context } from 'hono'
import { jwt } from 'hono/jwt'

type Bindings = {
  DB: D1Database
  CLOUDFLARE_API_TOKEN: string
  CLOUDFLARE_ZONE_ID: string
  SESSION_SECRET: string
}

const app = new Hono<{ Bindings: Bindings }>()

// 注册用户
app.post('/api/register', async (c) => {
  const { username, password } = await c.req.json()
  if (!username || !password) return c.json({ error: 'Missing fields' }, 400)

  const hashed = await sha256(password)

  try {
    await c.env.DB.prepare('INSERT INTO users (username, password) VALUES (?, ?)')
      .bind(username, hashed)
      .run()
    return c.json({ success: true })
  } catch (e) {
    return c.json({ error: 'User exists' }, 400)
  }
})

// 登录
app.post('/api/login', async (c) => {
  const { username, password } = await c.req.json()
  const hashed = await sha256(password)

  const row = await c.env.DB.prepare('SELECT * FROM users WHERE username = ? AND password = ?')
    .bind(username, hashed)
    .first()

  if (!row) return c.json({ error: 'Invalid credentials' }, 401)

  const token = await jwt.sign({ username }, c.env.SESSION_SECRET)
  return c.json({ token })
})

// 获取用户域名
app.get('/api/domains', async (c) => {
  const auth = c.req.header('authorization')
  if (!auth) return c.json({ error: 'No auth' }, 401)
  try {
    const user = await jwt.verify(auth.replace('Bearer ', ''), c.env.SESSION_SECRET)
    const row = await c.env.DB.prepare('SELECT domains FROM users WHERE username = ?')
      .bind(user.username)
      .first()
    return c.json({ domains: JSON.parse(row.domains) })
  } catch {
    return c.json({ error: 'Invalid token' }, 401)
  }
})

// 添加域名（调用 Cloudflare API）
app.post('/api/domains', async (c) => {
  const { subdomain, target } = await c.req.json()
  const auth = c.req.header('authorization')
  if (!auth) return c.json({ error: 'No auth' }, 401)

  try {
    const user = await jwt.verify(auth.replace('Bearer ', ''), c.env.SESSION_SECRET)
    const apiUrl = `https://api.cloudflare.com/client/v4/zones/${c.env.CLOUDFLARE_ZONE_ID}/dns_records`
    const resp = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${c.env.CLOUDFLARE_API_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        type: 'CNAME',
        name: `${subdomain}`,
        content: target,
        ttl: 3600
      })
    })
    const result = await resp.json()

    if (!result.success) return c.json({ error: 'Cloudflare API failed' }, 500)

    // 更新用户数据库
    const row = await c.env.DB.prepare('SELECT domains FROM users WHERE username = ?')
      .bind(user.username)
      .first()
    let domains = JSON.parse(row.domains)
    domains.push({ subdomain, target })
    await c.env.DB.prepare('UPDATE users SET domains = ? WHERE username = ?')
      .bind(JSON.stringify(domains), user.username)
      .run()

    return c.json({ success: true, domain: `${subdomain}` })
  } catch {
    return c.json({ error: 'Invalid token' }, 401)
  }
})

export default app
