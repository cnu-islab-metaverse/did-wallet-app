import { Router, Request, Response } from 'express'
import Database from 'better-sqlite3'
import * as path from 'path'
import { createHash, createHmac } from 'crypto'

// Load SQLite database
const dbPath = path.join(__dirname, '../../database/residents.db')
const db = new Database(dbPath)

interface Resident {
  id: number
  txid: string
  cxid: string
  name: string
  ihidnum: string
  address: string
  birth: string
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

const issuerInfo = {
  id: "https://gov.example.kr/moi",
  name: "행정안전부",
  publicKey: {
    Ax: '0x2a1f...Ax',
    Ay: '0x3b4e...Ay'
  },
  // Allow verificationMethod to differ from issuer id
  verificationMethod: 'https://www.gov.example.kr/moi/keys/1'
}

export const issueRouter = Router()

// Issue a KR National ID based IdentityCredential VC
issueRouter.post('/vc', async (req: Request, res: Response) => {
  const { name, birth, rrnSuffix, walletAddress, nationalId } = req.body || {}
  if (!walletAddress) {
    return res.status(400).json({ error: 'walletAddress is required' })
  }

  let record: Resident | undefined

  if (nationalId) {
    // Prefer exact lookup by nationalId (cxid)
    const byIdStmt = db.prepare(`SELECT * FROM residents WHERE cxid = ?`)
    record = byIdStmt.get(nationalId) as Resident | undefined
  } else {
    // Fallback to triplet match
    if (!name || !birth || !rrnSuffix) {
      return res.status(400).json({ error: 'name, birth, rrnSuffix are required when nationalId is missing' })
    }
    const birthFormatted = String(birth).replace(/-/g, '')
    const stmt = db.prepare(`
      SELECT * FROM residents 
      WHERE name = ? AND birth = ? AND substr(replace(ihidnum, '-', ''), -2) = ?
    `)
    record = stmt.get(name, birthFormatted, rrnSuffix) as Resident | undefined
  }
  if (!record) return res.status(404).json({ error: 'Resident not found or info mismatch' })

  const vcId = Math.floor(Math.random() * 10000) + 1000
  const nowIso = new Date().toISOString()
  const oneYearMs = 365 * 24 * 60 * 60 * 1000
  const validUntilIso = new Date(Date.now() + oneYearMs).toISOString()

  // Format birth as YYYY-MM-DD for VC
  const birthForVC = record.birth.replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3')

  const vcBase = {
    "@context": [
      "https://www.w3.org/ns/credentials/v2",
      "https://www.w3.org/ns/credentials/examples/v2"
    ],
    "id": `https://gov.example.kr/credentials/${vcId}`,
    "type": ["VerifiableCredential", "IdentityCredential"],
    "issuer": issuerInfo,
    "issuanceDate": nowIso,
    "validFrom": nowIso,
    "validUntil": validUntilIso,
    "credentialSubject": {
      "id": `did:ethr:${walletAddress}`,
      "walletAddress": walletAddress,
      "name": record.name,
      "birthDate": birthForVC,
      "sex": record.sex,
      "nationalId": record.cxid,
      "residentialAddress": record.address,
      "idCard": {
        "rrn": record.ihidnum,
        "title": record.title,
        "issuedOn": record.issude,
        "issuer": record.issuernm,
        "expiryOn": null
      }
    }
  }

  const merkleRoot = computeDeterministicRoot(vcBase)
  const signature = generateDeterministicSignature(merkleRoot)

  const vc = {
    ...vcBase,
    "proof": {
      "type": "BabyJubJubSMTSignature2024",
      "created": new Date().toISOString(),
      "proofPurpose": "verificationMethod",
      "verificationMethod": issuerInfo.verificationMethod || issuerInfo.id,
      "merkleRoot": merkleRoot,
      "signature": signature
    }
  }

  res.json({ ok: true, vc })
})

function computeDeterministicRoot(vc: any): string {
  const json = JSON.stringify(vc)
  const hash = createHash('sha256').update(json).digest()
  return Array.from(hash).join(',')
}

function generateDeterministicSignature(root: string): { R8x: string, R8y: string, S: string } {
  const key = process.env.ISSUER_SIGN_KEY || 'issuer-web-dev-secret'
  const h1 = createHmac('sha256', key).update(root).update(issuerInfo.publicKey.Ax).digest()
  const h2 = createHmac('sha256', key + ':S').update(root).update(issuerInfo.publicKey.Ay).digest()
  const r8xHex = Buffer.from(h1.slice(0, 16)).toString('hex')
  const r8yHex = Buffer.from(h1.slice(16, 32)).toString('hex')
  const sHex = Buffer.from(h2).toString('hex')
  return {
    R8x: (BigInt('0x' + r8xHex)).toString(),
    R8y: (BigInt('0x' + r8yHex)).toString(),
    S: (BigInt('0x' + sHex)).toString()
  }
}


