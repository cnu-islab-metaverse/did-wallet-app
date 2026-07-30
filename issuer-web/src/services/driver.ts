import { createHash } from 'crypto'

// 데모용 운전면허 정보 파생. 주민 레코드(cxid)에서 결정적으로 생성 → verify/issue 가 동일 값.
// 실제 운전면허 DB 연동 전 실증용. (경찰청/도로교통공단 운전면허증 스타일)

export interface DriverLicense {
  licenseNumber: string   // 지역-연도-일련-검증
  licenseType: string     // 종별 (1종 대형/1종 보통/2종 보통)
  issuedOn: string        // 발급일 YYYY-MM-DD
  renewalFrom: string     // 갱신기간 시작 YYYY-MM-DD
  renewalUntil: string    // 갱신기간 만료 YYYY-MM-DD
  aptitude: string        // 적성검사/갱신 안내
  issuer: string          // 발급 지방경찰청
}

const REGION = ['11', '12', '13', '14', '15', '16', '17', '18', '19', '20', '21', '22', '23', '24', '25', '26', '27', '28']
const TYPES = ['1종 대형', '1종 보통', '2종 보통', '2종 보통']
const OFFICES = [
  '서울지방경찰청장', '부산지방경찰청장', '경기남부지방경찰청장', '인천지방경찰청장',
  '대구지방경찰청장', '광주지방경찰청장', '대전지방경찰청장', '울산지방경찰청장',
]

function digits(hash: Buffer, start: number, len: number): string {
  let s = ''
  for (let i = 0; i < len; i++) s += (hash[start + i] % 10).toString()
  return s
}

// 만 나이 (발급 가능 여부 판단용)
export function ageFromBirth(birthYYYYMMDD: string): number {
  const y = Number(birthYYYYMMDD.slice(0, 4))
  const m = Number(birthYYYYMMDD.slice(4, 6))
  const d = Number(birthYYYYMMDD.slice(6, 8))
  const now = new Date()
  let age = now.getFullYear() - y
  if (now.getMonth() + 1 < m || (now.getMonth() + 1 === m && now.getDate() < d)) age -= 1
  return age
}

export function deriveDriverLicense(cxid: string, birthYYYYMMDD: string, issuerRegionHint?: string): DriverLicense {
  const h = createHash('sha256').update(cxid).digest()
  const region = REGION[h[0] % REGION.length]
  const issuedYear = 2019 + (h[1] % 5)          // 2019~2023
  const mmdd = `${birthYYYYMMDD.slice(4, 6)}-${birthYYYYMMDD.slice(6, 8)}`
  const licenseNumber = `${region}-${String(issuedYear).slice(2)}-${digits(h, 2, 6)}-${digits(h, 8, 2)}`
  const licenseType = TYPES[h[10] % TYPES.length]
  const issuedOn = `${issuedYear}-${mmdd}`
  const renewalFrom = `${issuedYear + 9}-01-01`   // 10년 주기 갱신
  const renewalUntil = `${issuedYear + 10}-12-31`
  const issuer = OFFICES[h[11] % OFFICES.length]
  return {
    licenseNumber,
    licenseType,
    issuedOn,
    renewalFrom,
    renewalUntil,
    aptitude: `${renewalFrom.replace(/-/g, '.')} ~ ${renewalUntil.replace(/-/g, '.')} 갱신`,
    issuer,
  }
}
