import { createHash, createHmac } from 'crypto'

type Kind = 'driver' | 'engineer' | 'diploma' | 'all'

const argvKind = (process.argv[2] as Kind) || 'all'
// Demo-only subject and owner wallet
const subject = { name: '홍길동', birthDate: '1990-05-02', sex: 'male', address: '대전시 유성구' }
const walletAddress = '0x83f03255fC8bBd37Ca7326d6CC79baF056470c9d'

function computeDeterministicRoot(vc: any): string {
  const json = JSON.stringify(vc)
  const hash = createHash('sha256').update(json).digest()
  return Array.from(hash).join(',')
}

function genSig(root: string, Ax: string, Ay: string, secret = process.env.ISSUER_SIGN_KEY || 'issuer-web-dev-secret') {
  const h1 = createHmac('sha256', secret).update(root).update(Ax).digest()
  const h2 = createHmac('sha256', secret + ':S').update(root).update(Ay).digest()
  const r8xHex = Buffer.from(h1.slice(0, 16)).toString('hex')
  const r8yHex = Buffer.from(h1.slice(16, 32)).toString('hex')
  const sHex = Buffer.from(h2).toString('hex')
  return { R8x: BigInt('0x' + r8xHex).toString(), R8y: BigInt('0x' + r8yHex).toString(), S: BigInt('0x' + sHex).toString() }
}

function buildBase(issuer: any, type: string[], subjectFields: any) {
  const nowIso = new Date().toISOString()
  const oneYearMs = 365 * 24 * 60 * 60 * 1000
  const validUntilIso = new Date(Date.now() + oneYearMs).toISOString()
  const vcId = Date.now().toString()
  return {
    "@context": [
      'https://www.w3.org/ns/credentials/v2',
      'https://www.w3.org/ns/credentials/examples/v2'
    ],
    id: vcId,
    type,
    issuer,
    issuanceDate: nowIso,
    validFrom: nowIso,
    validUntil: validUntilIso,
    credentialSubject: {
      id: `did:ethr:${walletAddress}`,
      walletAddress,
      name: subject.name,
      birthDate: subject.birthDate,
      sex: subject.sex,
      ...subjectFields
    }
  }
}

function finalize(base: any, verificationMethod: string) {
  const root = computeDeterministicRoot(base)
  const sig = genSig(root, base.issuer.publicKey.Ax, base.issuer.publicKey.Ay)
  return { ...base, proof: { type: 'BabyJubJubSMTSignature2024', created: new Date().toISOString(), proofPurpose: 'verificationMethod', verificationMethod, merkleRoot: root, signature: sig } }
}

function issueDriver() {
  const issuer = { id: 'https://police.example.kr/dl', name: '경찰청', publicKey: { Ax: '0x2a1f...Ax', Ay: '0x3b4e...Ay' } }
  const base = buildBase(issuer, ['VerifiableCredential', 'DriverLicenseCredential'], {
    residentialAddress: subject.address,
    driverLicense: { number: '11-90-123456-00', class: '2종 보통', issuedOn: '2012-06-15', expiryOn: '2032-06-15', issuer: '대전광역시경찰청장' }
  })
  const verificationMethod = 'https://police.example.kr/dl/keys/1'
  return finalize(base, verificationMethod)
}

function issueEngineer() {
  const issuer = { id: 'https://hrdkorea.example.kr/hrd', name: '한국산업인력공단', publicKey: { Ax: '0x2a1f...Ax', Ay: '0x3b4e...Ay' } }
  const base = buildBase(issuer, ['VerifiableCredential', 'ProfessionalEngineerCredential'], {
    professionalLicense: { name: '정보처리기사', certificateId: 'C-2010-123456', issuedOn: '2015-11-21', issuer: '한국산업인력공단' }
  })
  const verificationMethod = 'https://hrdkorea.example.kr/keys/1'
  return finalize(base, verificationMethod)
}

function issueDiploma() {
  const issuer = { id: 'https://cnu.ac.kr/registrar', name: '충남대학교', publicKey: { Ax: '0x2a1f...Ax', Ay: '0x3b4e...Ay' } }
  const base = buildBase(issuer, ['VerifiableCredential', 'UniversityDiplomaCredential'], {
    studentId: '201612345', university: '충남대학교', major: '컴퓨터공학과', degree: '학사', graduationDate: '2020-02-15'
  })
  const verificationMethod = 'https://cnu.ac.kr/registrar/keys/1'
  return finalize(base, verificationMethod)
}

function main() {
  if (argvKind === 'driver') {
    process.stdout.write(JSON.stringify(issueDriver(), null, 2) + '\n')
    return
  }
  if (argvKind === 'engineer') {
    process.stdout.write(JSON.stringify(issueEngineer(), null, 2) + '\n')
    return
  }
  if (argvKind === 'diploma') {
    process.stdout.write(JSON.stringify(issueDiploma(), null, 2) + '\n')
    return
  }
  // all
  const out = { driver: issueDriver(), engineer: issueEngineer(), diploma: issueDiploma() }
  process.stdout.write(JSON.stringify(out, null, 2) + '\n')
}

main()


