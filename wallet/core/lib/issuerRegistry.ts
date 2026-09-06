// [작업] 발급기관 표시 이름을 공개키로 찾는다.
//        VC 의 issuer.name 은 서명 대상이 아니다 — 서명되는 것은 SMT root(클레임)뿐이고,
//        기관을 특정하는 것은 EdDSA 공개키다. 그래서 화면에 쓸 이름은 VC 의 문자열이 아니라
//        회로가 쓰는 것과 같은 공개키 목록에서 가져온다.
// [결과] resolveIssuer(vc, verified) → { name, id, verified, known, note }
import REGISTRY from '../config/issuers.generated.json'

export interface KnownIssuer {
  key: string
  id: string
  name: string
  Ax: string
  Ay: string
}

export interface ResolvedIssuer {
  /** 화면에 쓸 이름. 아는 키면 레지스트리 이름, 모르면 VC 가 주장하는 값. */
  name: string
  id: string
  /** 서명이 실제로 검증됐는가(메인 프로세스에서 확인). */
  verified: boolean
  /** 공개키가 등록된 발급기관의 것인가. */
  known: boolean
  /** 사용자에게 보일 단서. 없으면 정상. */
  note?: string
}

const known: KnownIssuer[] = REGISTRY as KnownIssuer[]
const byKey = new Map(known.map((i) => [`${i.Ax}:${i.Ay}`, i]))

export function knownIssuers(): KnownIssuer[] {
  return known
}

/**
 * verified 는 서명 검증 결과다(모르면 undefined). 검증을 못 했더라도 공개키가 등록된
 * 것인지는 알 수 있으므로, 둘을 나눠서 돌려준다.
 */
export function resolveIssuer(vc: any, verified?: boolean): ResolvedIssuer {
  const iss = vc?.issuer
  const claimedName = (typeof iss === 'string' ? '' : iss?.name) || ''
  const id = (typeof iss === 'string' ? iss : iss?.id) || ''
  const pk = typeof iss === 'string' ? null : iss?.publicKey
  const hit = pk?.Ax != null && pk?.Ay != null ? byKey.get(`${pk.Ax}:${pk.Ay}`) : undefined

  if (!hit) {
    return {
      name: claimedName || id || '알 수 없는 발급기관',
      id,
      verified: false,
      known: false,
      note: pk ? '등록되지 않은 발급기관 키입니다.' : '발급기관 공개키가 없습니다.',
    }
  }

  const note =
    verified === false ? '서명이 검증되지 않았습니다.'
    : claimedName && claimedName !== hit.name ? `증명서에는 "${claimedName}" 으로 적혀 있습니다.`
    : id && id !== hit.id ? `증명서의 발급기관 주소가 등록된 것과 다릅니다.`
    : undefined

  // 이름은 언제나 레지스트리 것을 쓴다 — VC 의 문자열은 누구나 바꿀 수 있다.
  return { name: hit.name, id: hit.id, verified: verified === true, known: true, note }
}

function bridge(): any {
  const w = globalThis as any
  return w?.ipcRenderer ?? null
}

/**
 * 발급기관 서명을 실제로 검증한다(데스크톱 전용). 확인할 수 없는 환경이면 undefined —
 * '검증 실패' 와 '검증 못 함' 은 다르게 다뤄야 한다.
 */
export async function verifyVcSignature(vc: any): Promise<boolean | undefined> {
  const b = bridge()
  if (typeof b?.zkVerifyVc !== 'function') return undefined
  try {
    const r = await b.zkVerifyVc(vc)
    return !!r?.verified
  } catch {
    return undefined
  }
}
