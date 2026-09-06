import SIGNED_DEMO_VCS from './demoVcs.signed.json'
// [작업] 미리보기용 실제 포맷 데모 VC 6종 — 한 명(홍길동, 대전 유성구)의 일관된 신원.
//        구조는 circuits/vc.json 과 동일(W3C VC + BabyJubJubSMTSignature2024). 값은 가상이나 현실적.
//        공식 VC 표준이 없는 증명서는 합리적인 필드로 구성. (서명값은 데모용 예시)
// [결과] DEMO_VCS(전체 VC 배열), computeStatus(vc), claimRows(vc)(신원정보 키-값).

const HOLDER_DID = 'did:ethr:0x83f03255fC8bBd37Ca7326d6CC79baF056470c9d'
const WALLET = '0x83f03255fC8bBd37Ca7326d6CC79baF056470c9d'
const NAME = '홍길동'
const BIRTH = '1998-03-10'
const ADDRESS = '대전광역시 유성구 대학로 99'

const CTX = ['https://www.w3.org/ns/credentials/v2', 'https://www.w3.org/ns/credentials/examples/v2']
// 데모 테스트 발급기관 공개키(circuits _registry.circom issuerAx/Ay 와 동일)
const PUBKEY = {
  Ax: '13277427435165878497778222415993513565335242147425444199013288855685581939618',
  Ay: '13622229784656158136036771217484571176836296686641868549125388198837476602820',
}
// 정의에는 서명을 넣지 않는다. scripts/sign-demo-vcs.mjs 가 circuits 의 발급기관 키로
// 진짜 EdDSA 서명을 만들어 demoVcs.signed.json 에 기록하고, 아래 DEMO_VCS 가 그걸 쓴다.
// (가짜 서명이면 회로의 EdDSAPoseidonVerifier 에서 검증 실패해 발급이 불가능하다.)
const base = (_issuerId: string, _issuerName: string, extra: Record<string, any> = {}) => ({
  id: HOLDER_DID, walletAddress: WALLET, name: NAME, birthDate: BIRTH, ...extra,
})

export const DEMO_VCS_UNSIGNED: any[] = [
  {
    '@context': CTX, id: 'https://www.mois.go.kr/credentials/1001',
    type: ['VerifiableCredential', 'ResidentRegistrationCredential'],
    issuer: { id: 'did:web:www.mois.go.kr', name: '행정안전부', publicKey: PUBKEY },
    issuanceDate: '2025-10-01T00:00:00.000Z', validFrom: '2025-10-01T00:00:00.000Z', validUntil: null,
    credentialSubject: base('mois', '행정안전부', {
      sex: 'male', nationalId: 'RRN-98031030245', residentialAddress: ADDRESS,
      idCard: { rrn: '980310-3******', issuedOn: '2017-03-15', issuer: '대전광역시 유성구청장' },
    }),
    proofVerificationMethod: 'did:web:www.mois.go.kr#keys-1',
  },
  {
    '@context': CTX, id: 'https://www.police.go.kr/credentials/2002',
    type: ['VerifiableCredential', 'DrivingLicenseCredential'],
    issuer: { id: 'did:web:www.police.go.kr', name: '경찰청', publicKey: PUBKEY },
    issuanceDate: '2025-10-01T00:00:00.000Z', validFrom: '2025-10-01T00:00:00.000Z', validUntil: '2031-12-31T23:59:59.000Z',
    credentialSubject: base('police', '경찰청', {
      residentialAddress: ADDRESS,
      drivingLicense: { licenseNumber: '30-21-123456-01', licenseType: '2종 보통', issuedOn: '2021-05-20', renewalUntil: '2031-12-31', issuer: '대전지방경찰청장' },
    }),
    proofVerificationMethod: 'https://www.police.go.kr/keys/1',
  },
  {
    '@context': CTX, id: 'https://cnu.ac.kr/credentials/3003',
    type: ['VerifiableCredential', 'UniversityAcademicCredential'],
    issuer: { id: 'did:web:cnu.ac.kr:registrar', name: '충남대학교', publicKey: PUBKEY },
    issuanceDate: '2024-02-16T00:00:00.000Z', validFrom: '2024-02-16T00:00:00.000Z', validUntil: '2029-02-28T23:59:59.000Z',
    credentialSubject: base('cnu', '충남대학교', {
      university: '충남대학교', studentId: '201612345', college: '공과대학', department: '컴퓨터융합학부',
      degree: '학사', graduationDate: '2024-02-16', status: '졸업', certificateType: '졸업증명서',
    }),
    proofVerificationMethod: 'did:web:cnu.ac.kr:registrar#keys-1',
  },
  {
    '@context': CTX, id: 'https://cnu.ac.kr/credentials/3004',
    type: ['VerifiableCredential', 'UniversityAcademicCredential'],
    issuer: { id: 'did:web:cnu.ac.kr:registrar', name: '충남대학교', publicKey: PUBKEY },
    issuanceDate: '2020-03-02T00:00:00.000Z', validFrom: '2020-03-02T00:00:00.000Z', validUntil: '2021-03-01T23:59:59.000Z',
    credentialSubject: base('cnu', '충남대학교', {
      university: '충남대학교', studentId: '201612345', college: '공과대학', department: '컴퓨터융합학부',
      status: '재학', certificateType: '재학증명서',
    }),
    proofVerificationMethod: 'did:web:cnu.ac.kr:registrar#keys-1',
  },
  {
    '@context': CTX, id: 'https://www.q-net.or.kr/credentials/4005',
    type: ['VerifiableCredential', 'NationalTechnicalQualificationCredential'],
    issuer: { id: 'did:web:www.hrdkorea.or.kr', name: '한국산업인력공단', publicKey: PUBKEY },
    issuanceDate: '2023-08-25T00:00:00.000Z', validFrom: '2023-08-25T00:00:00.000Z', validUntil: null,
    credentialSubject: base('hrdk', '한국산업인력공단', {
      qualification: { qualificationName: '정보처리기사', grade: '기사', certNumber: '23202030123A', acquiredDate: '2023-08-25', issuer: '한국산업인력공단' },
    }),
    proofVerificationMethod: 'https://www.hrdkorea.or.kr/keys/1',
  },
  {
    '@context': CTX, id: 'https://www.nhis.or.kr/credentials/5006',
    type: ['VerifiableCredential', 'HealthInsuranceCredential'],
    issuer: { id: 'did:web:www.nhis.or.kr', name: '국민건강보험공단', publicKey: PUBKEY },
    issuanceDate: '2026-01-05T00:00:00.000Z', validFrom: '2026-01-05T00:00:00.000Z', validUntil: '2027-01-04T23:59:59.000Z',
    credentialSubject: base('nhis', '국민건강보험공단', {
      healthInsurance: { insuranceType: '직장가입자', acquisitionDate: '2024-03-01', coverageArea: '본인', issuer: '국민건강보험공단' },
    }),
    proofVerificationMethod: 'https://www.nhis.or.kr/keys/1',
  },
]

// 유효기간으로 상태 계산(무기한=유효 / 미래=유효 / 과거=만료)
/**
 * 앱이 실제로 쓰는 시드 VC — scripts/sign-demo-vcs.mjs 가 circuits 의 발급기관 키로 서명한 결과.
 * 위 DEMO_VCS_UNSIGNED 는 정의(단일 소스)이고, 이쪽이 회로 검증을 통과하는 실물이다.
 */
export const DEMO_VCS: any[] = SIGNED_DEMO_VCS as any[]

export function computeStatus(vc: any): { label: string; tone?: 'muted' } {
  const until = vc?.validUntil
  if (!until) return { label: '유효' }
  return new Date(until).getTime() >= Date.now() ? { label: '유효' } : { label: '만료', tone: 'muted' }
}

// 표시용 제목(자격증명 종류 한글)
const TYPE_KO: Record<string, string> = {
  ResidentRegistrationCredential: '주민등록증', DrivingLicenseCredential: '운전면허증',
  UniversityAcademicCredential: '학적 증명서', NationalTechnicalQualificationCredential: '국가기술자격증',
  HealthInsuranceCredential: '건강보험 자격',
}
export function vcTitle(vc: any): string {
  const sub = vc?.credentialSubject
  if (sub?.certificateType) return sub.certificateType // 졸업/재학증명서
  if (sub?.qualification?.qualificationName) return sub.qualification.qualificationName
  const t = Array.isArray(vc?.type) ? vc.type.find((x: string) => x !== 'VerifiableCredential') : undefined
  return TYPE_KO[t] || t || 'VerifiableCredential'
}
export function vcIssuer(vc: any): string {
  return vc?.issuer?.name || vc?.issuer?.id || '알 수 없는 발급기관'
}
// 발급일 / 만료일(없으면 무기한)
export function vcDates(vc: any): { issued: string; until: string | null } {
  const issued = String(vc?.validFrom || vc?.issuanceDate || '').slice(0, 10)
  const until = vc?.validUntil ? String(vc.validUntil).slice(0, 10) : null
  return { issued, until }
}

// 신원정보 키-값(중첩 객체 평탄화 + 한글 라벨)
const KLABEL: Record<string, string> = {
  id: 'DID', walletAddress: '지갑주소', name: '성명', birthDate: '생년월일', sex: '성별',
  nationalId: '신원식별번호', residentialAddress: '주소',
  rrn: '주민등록번호', issuedOn: '발급일', issuer: '발급기관', expiryOn: '만료일',
  university: '대학', studentId: '학번', college: '단과대학', department: '학과(부)', degree: '학위',
  graduationDate: '졸업일', status: '학적상태', certificateType: '증명서종류',
  licenseNumber: '면허번호', licenseType: '종별', renewalUntil: '갱신만료',
  qualificationName: '자격명', grade: '등급', certNumber: '자격번호', acquiredDate: '취득일',
  insuranceType: '가입구분', acquisitionDate: '자격취득일', coverageArea: '적용대상',
}
const fmtVal = (k: string, v: any): string => {
  if (k === 'sex') return v === 'male' ? '남' : v === 'female' ? '여' : String(v)
  return String(v)
}
export function claimRows(vc: any): { label: string; value: string }[] {
  const out: { label: string; value: string }[] = []
  const walk = (obj: any) => {
    for (const [k, v] of Object.entries(obj || {})) {
      if (v == null) continue
      if (typeof v === 'object' && !Array.isArray(v)) { walk(v); continue }
      out.push({ label: KLABEL[k] || k, value: fmtVal(k, v) })
    }
  }
  walk(vc?.credentialSubject)
  return out
}
