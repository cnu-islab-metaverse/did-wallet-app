// [작업] 증명서(VC) 보관소 — 활성 계정 주소별로 storage 에 저장/로드.
//        구조: { [lowercased address]: VC[] } 를 STORAGE_KEYS.savedVCs 아래 단일 맵으로.
//        같은 자격증명을 재발급받으면 새 항목이 아니라 "이력"으로 쌓인다(vcLineage 로 묶음).
// [결과] getVCs / addVC / removeVC / seedVCsIfEmpty + 안정 id(vcId) + 이력 묶음(groupVCs).
import { storageAdapter } from './storageAdapter'
import { STORAGE_KEYS } from '../config/storage'

export type StoredVC = any // W3C VC 객체
type VCMap = Record<string, StoredVC[]>

// 시드를 이미 넣은 주소 기록. 이게 없으면 사용자가 시드 VC 를 전부 지워도
// 다음 로드에서 되살아나 "삭제가 안 되는" 것처럼 보인다.
const SEEDED_KEY = 'saved_vcs.seeded.v1'
type SeededMap = Record<string, true>

const key = (address: string) => address.toLowerCase()

async function loadMap(): Promise<VCMap> {
  return (await storageAdapter.get<VCMap>(STORAGE_KEYS.savedVCs)) || {}
}
async function saveMap(map: VCMap): Promise<void> {
  await storageAdapter.set(STORAGE_KEYS.savedVCs, map)
}
async function loadSeeded(): Promise<SeededMap> {
  return (await storageAdapter.get<SeededMap>(SEEDED_KEY)) || {}
}

/**
 * VC 인스턴스의 안정 id.
 * 재발급본은 발급일시·서명이 달라지므로 서로 다른 id 를 갖는다 — 같은 종류라도 별개 버전으로 쌓인다.
 * (vc.id 만 쓰면 발급기관이 id 를 재사용할 때 재발급이 중복으로 막힌다.)
 */
export function vcId(vc: any): string {
  const sig = vc?.proof?.signature
  const s = JSON.stringify({
    id: vc?.id ?? null,
    issued: vc?.issuanceDate ?? vc?.validFrom ?? null,
    sig: sig ? [sig.R8x, sig.R8y, sig.S] : null,
    i: vc?.issuer,
    t: vc?.type,
    u: vc?.validUntil,
  })
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return 'vc_' + h.toString(36)
}

/**
 * 재발급본을 묶는 계보 키 = 발급기관 + 증명서 종류 + 세부 구분.
 *
 * 세부 구분이 필요한 이유: 한 발급기관이 같은 VC 타입으로 성격이 다른 증명서를 낸다.
 * 충남대의 재학증명서와 졸업증명서는 둘 다 UniversityAcademicCredential 이지만 서로
 * 재발급본이 아니다. 이걸 묶으면 한쪽이 다른 쪽의 이력으로 숨어버린다.
 * (만료된 재학증명서가 졸업증명서 뒤로 사라지던 실제 버그.)
 */
export function vcLineage(vc: any): string {
  const iss = vc?.issuer
  const issuer = typeof iss === 'string' ? iss : (iss?.id ?? iss?.name ?? '?')
  const types: string[] = Array.isArray(vc?.type) ? vc.type : [vc?.type].filter(Boolean)
  const specific = types.find((t) => t && t !== 'VerifiableCredential') ?? 'VerifiableCredential'
  const s = vc?.credentialSubject ?? {}
  // 같은 타입 안에서 증명서를 구별하는 필드. 값이 바뀌면 다른 증명서로 본다.
  const variant = [s.status, s.degree, s.certificate, s.qualification?.qualificationName, s.licenseType]
    .filter((v) => v != null)
    .join('|')
  return variant ? `${issuer}::${specific}::${variant}` : `${issuer}::${specific}`
}

/** 발급 시점(최신 우선 정렬용). 값이 없으면 0. */
function issuedAt(vc: any): number {
  const d = vc?.issuanceDate ?? vc?.validFrom ?? vc?.proof?.created
  const t = d ? Date.parse(d) : NaN
  return Number.isNaN(t) ? 0 : t
}

export interface VCGroup {
  lineage: string
  /** 최신 발급본 — 목록·증명에 쓰는 대표 */
  current: StoredVC
  /** 이전 발급본들(최신순). 비어 있으면 재발급 이력이 없다. */
  history: StoredVC[]
}

/**
 * 같은 계보의 VC 를 하나로 묶는다. 각 묶음의 대표는 가장 최근 발급본.
 * 목록에 재발급본이 중복 카드로 늘어서지 않게 하는 것이 목적이다.
 */
export function groupVCs(list: StoredVC[]): VCGroup[] {
  const byLineage = new Map<string, StoredVC[]>()
  for (const vc of list) {
    const k = vcLineage(vc)
    const arr = byLineage.get(k)
    if (arr) arr.push(vc)
    else byLineage.set(k, [vc])
  }
  const groups: VCGroup[] = []
  for (const [lineage, vcs] of byLineage) {
    // 발급 시점 최신순. 동률이면 저장 순서(addVC 가 앞에 넣으므로 앞이 최신)를 유지한다.
    const sorted = [...vcs].sort((a, b) => issuedAt(b) - issuedAt(a))
    groups.push({ lineage, current: sorted[0], history: sorted.slice(1) })
  }
  // 묶음끼리도 최신 발급 순
  return groups.sort((a, b) => issuedAt(b.current) - issuedAt(a.current))
}

export async function getVCs(address: string): Promise<StoredVC[]> {
  const map = await loadMap()
  return map[key(address)] || []
}

/** 이력으로 묶인 목록. UI 는 보통 이쪽을 쓴다. */
export async function getVCGroups(address: string): Promise<VCGroup[]> {
  return groupVCs(await getVCs(address))
}

export async function addVC(address: string, vc: StoredVC): Promise<{ ok: boolean; duplicate?: boolean; reissue?: boolean }> {
  const map = await loadMap()
  const k = key(address)
  const list = map[k] || []
  const id = vcId(vc)
  if (list.some((v) => vcId(v) === id)) return { ok: false, duplicate: true }
  // 같은 계보가 이미 있으면 재발급으로 본다(이력에 쌓인다).
  const lineage = vcLineage(vc)
  const reissue = list.some((v) => vcLineage(v) === lineage)
  map[k] = [{ ...vc }, ...list]
  await saveMap(map)
  return { ok: true, reissue }
}

export async function removeVC(address: string, id: string): Promise<void> {
  const map = await loadMap()
  const k = key(address)
  map[k] = (map[k] || []).filter((v) => vcId(v) !== id)
  await saveMap(map)
}

/** 한 계보를 통째로(재발급 이력 포함) 삭제. */
export async function removeLineage(address: string, lineage: string): Promise<void> {
  const map = await loadMap()
  const k = key(address)
  map[k] = (map[k] || []).filter((v) => vcLineage(v) !== lineage)
  await saveMap(map)
}

/**
 * 개발/데모 편의용 초기 데이터 주입. 주소당 딱 한 번만 넣는다.
 * "비어 있으면 넣는다" 가 아니라 "넣은 적 없으면 넣는다" 이므로,
 * 사용자가 시드 VC 를 지우면 지워진 채로 남는다(재발급으로 다시 추가할 수 있다).
 */
export async function seedVCsIfEmpty(address: string, vcs: StoredVC[]): Promise<void> {
  const k = key(address)
  const seeded = await loadSeeded()
  if (seeded[k]) return

  const map = await loadMap()
  if (!map[k] || map[k].length === 0) {
    map[k] = vcs.map((v) => ({ ...v }))
    await saveMap(map)
  }
  seeded[k] = true
  await storageAdapter.set(SEEDED_KEY, seeded)
}

/** 시드 기록을 지운다 — 설정의 "개발 상태 리셋" 같은 곳에서 다시 시드하고 싶을 때. */
export async function resetSeedMark(address: string): Promise<void> {
  const seeded = await loadSeeded()
  delete seeded[key(address)]
  await storageAdapter.set(SEEDED_KEY, seeded)
}
