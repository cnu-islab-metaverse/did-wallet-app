import { buildPoseidon, buildEddsa, newMemEmptyTrie } from 'circomlibjs'

// [작업] 회로 호환 VC 서명 — circuits/witness.mjs 와 "동일한" SMT 구성 + EdDSA(BabyJubJub) 서명.
//        발급 VC 의 클레임을 정규 스키마로 SMT 에 넣어 root 를 만들고, 고정 테스트 발급키로 서명한다.
//        지갑/검증자(circuits)가 buildWitness 로 같은 root 를 재구성 → 서명 검증 통과.
// [결과] { publicKey:{Ax,Ay}, merkleRoot, signature:{R8x,R8y,S} } — proof 로 VC 에 넣는다.
//
// ★ 아래 상수·인코딩은 circuits/witness.mjs 와 반드시 일치해야 한다(불일치 시 root 가 달라져 검증 실패).

const LEVELS = 64

// 대학명 → 공식 학교코드 (circuits/witness.mjs UNIV_CODE 와 동일)
const UNIV_CODE: Record<string, number> = {
  강원대학교: 3, 경북대학교: 5, 경상국립대학교: 7, 부산대학교: 14, 전남대학교: 23,
  전북대학교: 25, 제주대학교: 27, 충남대학교: 29, 충북대학교: 30,
}

// 시도 법정동코드 (정식·약어 대응). circuits/witness.mjs SIDO 와 동일.
const SIDO: { code: number; p: string[] }[] = [
  { code: 11, p: ['서울특별시', '서울시', '서울'] },
  { code: 26, p: ['부산광역시', '부산시', '부산'] },
  { code: 27, p: ['대구광역시', '대구시', '대구'] },
  { code: 28, p: ['인천광역시', '인천시', '인천'] },
  { code: 29, p: ['광주광역시', '광주시', '광주'] },
  { code: 30, p: ['대전광역시', '대전시', '대전'] },
  { code: 31, p: ['울산광역시', '울산시', '울산'] },
  { code: 36, p: ['세종특별자치시', '세종시', '세종'] },
  { code: 41, p: ['경기도', '경기'] },
  { code: 42, p: ['강원특별자치도', '강원도', '강원'] },
  { code: 43, p: ['충청북도', '충북'] },
  { code: 44, p: ['충청남도', '충남'] },
  { code: 45, p: ['전북특별자치도', '전라북도', '전북'] },
  { code: 46, p: ['전라남도', '전남'] },
  { code: 47, p: ['경상북도', '경북'] },
  { code: 48, p: ['경상남도', '경남'] },
  { code: 50, p: ['제주특별자치도', '제주도', '제주'] },
]

// 클레임 → SMT 고정 키 (circuits/witness.mjs CLAIM_KEY 와 동일)
const CLAIM_KEY: Record<string, number> = { name: 0, birthDate: 1, residence: 2, university: 3, validUntil: 4 }

// 이 발급기관의 개인키 — 충남대학교 학적과.
// ★ circuits/witness.mjs 의 ISSUERS.cnu.prv 와 동일해야 하고, 그 공개키가
//    circuits/scenarios/_registry.circom 의 시나리오별 화이트리스트에 들어 있어야 한다.
//    기관마다 키가 다르므로, 이 앱이 발급한 VC 로는 이 기관이 증명해줄 수 있는 사실만 증명된다.
//    데모 전용 고정값.
export const ISSUER_PRV = Buffer.from(
  '0001020304050607080900010203040506070809000102030405060708090003',
  'hex',
)

function toYmd(dateStr: string): number {
  const [y, m, d] = String(dateStr).slice(0, 10).split('-').map(Number)
  return y * 10000 + m * 100 + d
}
function regionCode(addr: string): number {
  const a = String(addr).trim()
  for (const s of SIDO) if (s.p.some((pre) => a.startsWith(pre))) return s.code
  throw new Error(`주소에서 시도를 못 찾음: ${addr}`)
}

// circomlibjs 초기화 캐시 (프로세스 1회)
let _p: any, _e: any
async function primitives() {
  if (!_p) _p = await buildPoseidon()
  if (!_e) _e = await buildEddsa()
  return { poseidon: _p, eddsa: _e }
}

export interface VcSignResult {
  publicKey: { Ax: string; Ay: string }
  merkleRoot: string
  signature: { R8x: string; R8y: string; S: string }
}

// VC(credentialSubject + validUntil)로부터 SMT root 를 만들고 EdDSA 서명한다.
export async function signVc(vc: any): Promise<VcSignResult> {
  const { poseidon, eddsa } = await primitives()
  const tree = await newMemEmptyTrie()
  const F = tree.F
  const subj = vc.credentialSubject || {}

  // VC 에 있는 클레임만 정규 스키마로 인코딩 (부분 신용증명 허용). ★ witness.mjs 와 동일 규칙.
  const claims: Record<string, string | number> = {}
  if (subj.name != null) claims.name = subj.name
  if (subj.birthDate != null) claims.birthDate = toYmd(subj.birthDate)
  if (subj.residentialAddress != null) claims.residence = regionCode(subj.residentialAddress)
  if (subj.university != null) {
    const c = UNIV_CODE[subj.university]
    if (c === undefined) throw new Error(`학교코드 없음(대학 목록 밖): ${subj.university}`)
    claims.university = c
  }
  if (vc.validUntil != null) claims.validUntil = toYmd(vc.validUntil)

  const toField = (v: string | number) =>
    typeof v === 'string' ? F.e(poseidon([Buffer.from(v, 'utf8')])) : F.e(v)
  for (const [k, v] of Object.entries(claims)) await tree.insert(BigInt(CLAIM_KEY[k]), toField(v))

  const pub = eddsa.prv2pub(ISSUER_PRV)
  const msg = F.e(tree.root)
  const sig = eddsa.signPoseidon(ISSUER_PRV, msg)

  return {
    publicKey: { Ax: F.toObject(pub[0]).toString(), Ay: F.toObject(pub[1]).toString() },
    merkleRoot: F.toObject(tree.root).toString(),
    signature: {
      R8x: F.toObject(sig.R8[0]).toString(),
      R8y: F.toObject(sig.R8[1]).toString(),
      S: sig.S.toString(),
    },
  }
}

// 발급기관 공개키(회로 화이트리스트와 대조용) — registry.circom 의 issuerAx/Ay 와 같아야 함.
export async function issuerPublicKey(): Promise<{ Ax: string; Ay: string }> {
  const { eddsa } = await primitives()
  const tree = await newMemEmptyTrie()
  const F = tree.F
  const pub = eddsa.prv2pub(ISSUER_PRV)
  return { Ax: F.toObject(pub[0]).toString(), Ay: F.toObject(pub[1]).toString() }
}
