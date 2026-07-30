import { Router, Request, Response } from 'express'
import * as fs from 'fs'
import * as path from 'path'
import { signVc } from './vcsign'

// 학적 DB (JSON)
const dbPath = path.join(__dirname, '../database/students.json')
const db = JSON.parse(fs.readFileSync(dbPath, 'utf-8'))

interface Student {
  studentId: string
  name: string
  sex: string
  birth: string
  department: string
  college: string
  degree: string
  admissionYear: number
  graduationYear: number | null
  status: string // '재학' | '졸업'
  nationalId: string
  email: string
}

// 발급기관 정보. publicKey 는 회로 호환 서명키(vcsign)에서 채운다.
const issuerInfo = {
  id: 'https://cnu.ac.kr/registrar',
  name: '충남대학교',
  verificationMethod: 'https://cnu.ac.kr/registrar/keys/1',
}

export const issueRouter = Router()

// 학적 증명서 VC 발급 (재학/졸업 모두 발급 — regional_national_univ 시나리오는 둘 다 허용)
issueRouter.post('/vc', async (req: Request, res: Response) => {
  const { studentId, birth, walletAddress } = req.body || {}
  if (!studentId || !birth || !walletAddress) {
    return res.status(400).json({ error: 'studentId, birth, walletAddress 가 필요합니다.' })
  }

  const record: Student = db.students.find((s: Student) => s.studentId === studentId && s.birth === birth)
  if (!record) return res.status(404).json({ error: '학적 정보를 찾을 수 없거나 생년월일이 일치하지 않습니다.' })

  const nowIso = new Date().toISOString()
  const vcId = Math.floor(Math.random() * 10000) + 1000

  // 유효기간(클레임 성질별): 졸업증명서 = 졸업 후 5년, 재학증명서 = 발급 후 1년.
  let validUntilIso: string
  if (record.status === '졸업' && record.graduationYear) {
    validUntilIso = new Date(`${record.graduationYear + 5}-02-28T23:59:59.000Z`).toISOString()
  } else {
    validUntilIso = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
  }

  const certType = record.status === '졸업' ? '졸업증명서' : '재학증명서'

  const vcBase = {
    '@context': [
      'https://www.w3.org/ns/credentials/v2',
      'https://www.w3.org/ns/credentials/examples/v2',
    ],
    id: `https://cnu.ac.kr/credentials/${vcId}`,
    type: ['VerifiableCredential', 'UniversityAcademicCredential'],
    issuer: issuerInfo,
    issuanceDate: nowIso,
    validFrom: nowIso,
    validUntil: validUntilIso,
    credentialSubject: {
      id: `did:ethr:${walletAddress}`,
      walletAddress,
      name: record.name,
      birthDate: record.birth,
      university: '충남대학교', // ★ witness/vcsign 의 UNIV_CODE 키와 일치 → regional_national_univ
      studentId: record.studentId,
      college: record.college,
      department: record.department,
      degree: record.degree,
      status: record.status, // 재학/졸업 (SMT 클레임 아님 — 메타데이터)
      certificateType: certType,
    },
  }

  // 회로 호환 서명(EdDSA+SMT). circuits regional_national_univ 가 university·validUntil 로 검증.
  const signed = await signVc(vcBase)
  ;(vcBase as any).issuer = { ...vcBase.issuer, publicKey: signed.publicKey }

  const vc = {
    ...vcBase,
    proof: {
      type: 'BabyJubJubSMTSignature2024',
      created: new Date().toISOString(),
      proofPurpose: 'verificationMethod',
      verificationMethod: issuerInfo.verificationMethod,
      merkleRoot: signed.merkleRoot,
      signature: signed.signature,
    },
  }

  res.json({ ok: true, vc, certificateType: certType })
})
