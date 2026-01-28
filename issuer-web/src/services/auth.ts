import { Router, Request, Response, NextFunction } from 'express'
import { SignJWT, jwtVerify } from 'jose'

const authSecret = new TextEncoder().encode(process.env.AUTH_SECRET || 'issuer-web-dev-secret')

export const authRouter = Router()

authRouter.post('/login', async (req: Request, res: Response) => {
  const { username, password } = req.body || {}
  if (!username || !password) return res.status(400).json({ error: 'Missing credentials' })

  const token = await new SignJWT({ sub: username })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('30m')
    .sign(authSecret)

  res.cookie('issuer_token', token, { httpOnly: true, sameSite: 'lax', secure: false, maxAge: 30 * 60 * 1000 })
  res.json({ ok: true })
})

authRouter.post('/logout', async (_req: Request, res: Response) => {
  res.clearCookie('issuer_token')
  res.json({ ok: true })
})

export async function requireAuth(req: Request & { user?: { id: string } }, res: Response, next: NextFunction) {
  try {
    const token = (req as any).cookies?.issuer_token
    if (!token) return res.status(401).json({ error: 'Unauthorized' })
    const { payload } = await jwtVerify(token, authSecret)
    req.user = { id: payload.sub as string }
    next()
  } catch {
    return res.status(401).json({ error: 'Unauthorized' })
  }
}


