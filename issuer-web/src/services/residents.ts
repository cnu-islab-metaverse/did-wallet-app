import { Router, Request, Response } from 'express'
import Database from 'better-sqlite3'
import * as path from 'path'

// Load SQLite database
const dbPath = path.join(__dirname, '../../database/residents.db')
const db = new Database(dbPath)

interface Resident {
  id: number
  txid: string
  cxid: string
  name: string
  ihidnum: string // Resident Registration Number
  address: string
  birth: string // YYYYMMDD format
  title: string
  issude: string
  issuernm: string
  foreignflag: string
  dlphotoimage?: string
  converterimage?: string
  provider: string
  resultCode: string
  clientMessage: string
  signType: string
  sex: 'male' | 'female'
  created_at: string
}

export const residentsRouter = Router()

// Verify resident with name + birth + partial rrn (last 2 digits)
residentsRouter.post('/verify', (req: Request, res: Response) => {
  const { name, birth, rrnSuffix } = req.body || {}
  if (!name || !birth || !rrnSuffix) {
    return res.status(400).json({ error: 'name, birth, rrnSuffix are required' })
  }

  // Query database - birth format is YYYYMMDD in DB, might be YYYY-MM-DD from frontend
  const birthFormatted = birth.replace(/-/g, '')
  const stmt = db.prepare(`
    SELECT * FROM residents 
    WHERE name = ? AND birth = ? AND substr(replace(ihidnum, '-', ''), -1) = ?
  `)
  const resident = stmt.get(name, birthFormatted, rrnSuffix) as Resident | undefined

  if (!resident) {
    return res.status(404).json({ error: 'Resident not found or info mismatch' })
  }

  const maskedRrn = resident.ihidnum.replace(/(\d{6})-?(\d{7})/, (_, a: string) => `${a}-*******`)

  res.json({
    ok: true,
    resident: {
      name: resident.name,
      birth: resident.birth,
      sex: resident.sex,
      address: resident.address,
      rrnMasked: maskedRrn,
      rrnSuffix: resident.ihidnum.slice(-1),
      issuedOn: resident.issude,
      expiryOn: null,
      nationalId: resident.cxid,
      title: resident.title,
      issuernm: resident.issuernm,
      profileImage: resident.sex === 'male' ? '/assets/profile-male.svg' : '/assets/profile-female.svg'
    }
  })
})

// Admin lookup (mock)
residentsRouter.get('/:nationalId', (req: Request, res: Response) => {
  const stmt = db.prepare('SELECT * FROM residents WHERE cxid = ?')
  const resident = stmt.get(req.params.nationalId) as Resident | undefined
  if (!resident) return res.status(404).json({ error: 'Resident not found' })
  res.json({ resident })
})


