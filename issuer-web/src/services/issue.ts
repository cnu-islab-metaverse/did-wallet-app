import { Router, Request, Response } from 'express'
import Database from 'better-sqlite3'
import * as path from 'path'
import { deriveDriverLicense, ageFromBirth } from './driver'
import { signVc } from './vcsign'

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
  // publicKey 는 발급 시 회로 호환 서명키(vcsign)에서 채운다.
  verificationMethod: 'https://www.gov.example.kr/moi/keys/1'
}

export const issueRouter = Router()

// Issue a KR National ID based IdentityCredential VC
issueRouter.post('/vc', async (req: Request, res: Response) => {
  const { name, birth, rrnSuffix, walletAddress, nationalId, credentialType = 'resident' } = req.body || {}
  if (!walletAddress) {
    return res.status(400).json({ error: 'walletAddress is required' })
  }
  if (credentialType !== 'resident' && credentialType !== 'driver') {
    return res.status(400).json({ error: 'credentialType must be "resident" or "driver"' })
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

  // Format birth as YYYY-MM-DD for VC
  const birthForVC = record.birth.replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3')

  // 주민등록증(무기한) vs 운전면허증(발급 성질에 따른 유효기간) — [[circuits-zk-pipeline]] 정책과 정합.
  let vcBase: any
  if (credentialType === 'driver') {
    if (ageFromBirth(record.birth) < 18) {
      return res.status(403).json({ error: '만 18세 미만은 운전면허증을 발급할 수 없습니다.' })
    }
    const dl = deriveDriverLicense(record.cxid, record.birth)
    vcBase = {
      "@context": [
        "https://www.w3.org/ns/credentials/v2",
        "https://www.w3.org/ns/credentials/examples/v2"
      ],
      "id": `https://gov.example.kr/credentials/${vcId}`,
      "type": ["VerifiableCredential", "DrivingLicenseCredential"],
      "issuer": { ...issuerInfo, name: '경찰청' },
      "issuanceDate": nowIso,
      "validFrom": nowIso,
      "validUntil": `${dl.renewalUntil}T23:59:59.000Z`, // 갱신 만료일
      "credentialSubject": {
        "id": `did:ethr:${walletAddress}`,
        "walletAddress": walletAddress,
        "name": record.name,
        "birthDate": birthForVC,
        "sex": record.sex,
        "nationalId": record.cxid,
        "residentialAddress": record.address,
        "drivingLicense": {
          "licenseNumber": dl.licenseNumber,
          "licenseType": dl.licenseType,
          "issuedOn": dl.issuedOn,
          "renewalFrom": dl.renewalFrom,
          "renewalUntil": dl.renewalUntil,
          "issuer": dl.issuer
        }
      }
    }
  } else {
    vcBase = {
      "@context": [
        "https://www.w3.org/ns/credentials/v2",
        "https://www.w3.org/ns/credentials/examples/v2"
      ],
      "id": `https://gov.example.kr/credentials/${vcId}`,
      "type": ["VerifiableCredential", "ResidentRegistrationCredential"],
      "issuer": issuerInfo,
      "issuanceDate": nowIso,
      "validFrom": nowIso,
      "validUntil": null, // 주민등록증: 무기한 (당사자 행사 전제)
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
  }

  // 회로 호환 서명(EdDSA+SMT). circuits/witness.mjs 가 같은 root 를 재구성 → 검증 통과.
  const signed = await signVc(vcBase)
  vcBase.issuer = { ...vcBase.issuer, publicKey: signed.publicKey }

  const vc = {
    ...vcBase,
    "proof": {
      "type": "BabyJubJubSMTSignature2024",
      "created": new Date().toISOString(),
      "proofPurpose": "verificationMethod",
      "verificationMethod": issuerInfo.verificationMethod || issuerInfo.id,
      "merkleRoot": signed.merkleRoot,
      "signature": signed.signature
    }
  }

  res.json({ ok: true, vc })
})


