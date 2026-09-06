// [작업] 활동 기록 — 계정 주소별로 실제로 일어난 일을 시간순으로 남긴다.
//        진행 중인 항목도 남기므로 발급 창을 닫아도 어디까지 갔는지 볼 수 있다.
// [결과] listActivity / logActivity / startActivity / updateActivity / clearActivity
import { storageAdapter } from './storageAdapter'

const KEY = 'activity_log.v1'
const LIMIT = 200 // 계정당 보관 개수
export const ACTIVITY_EVENT = 'wallet-activity-updated'

export type ActivityStatus = 'pending' | 'ok' | 'fail'
export type ActivityKind = 'pass' | 'vc' | 'request' | 'account'

export interface ActivityEntry {
  id: string
  ts: number
  kind: ActivityKind
  title: string
  detail?: string
  status: ActivityStatus
  endedAt?: number
  txHash?: string
  tokenId?: string | number
  origin?: string
}

type LogMap = Record<string, ActivityEntry[]>

const key = (address: string) => address.toLowerCase()
let seq = 0

async function load(): Promise<LogMap> {
  return (await storageAdapter.get<LogMap>(KEY)) || {}
}

async function save(map: LogMap): Promise<void> {
  await storageAdapter.set(KEY, map)
  try { window.dispatchEvent(new CustomEvent(ACTIVITY_EVENT)) } catch { /* 비 브라우저 */ }
}

/** 최신순. */
export async function listActivity(address: string): Promise<ActivityEntry[]> {
  if (!address) return []
  const map = await load()
  return [...(map[key(address)] || [])].sort((a, b) => b.ts - a.ts)
}

/** 이미 끝난 일을 기록한다. */
export async function logActivity(
  address: string,
  e: Omit<ActivityEntry, 'id' | 'ts' | 'status'> & { status?: ActivityStatus },
): Promise<string> {
  return startActivity(address, { ...e, status: e.status ?? 'ok' })
}

/** 진행 중인 일을 시작한다. 반환한 id 로 나중에 갱신한다. */
export async function startActivity(
  address: string,
  e: Omit<ActivityEntry, 'id' | 'ts' | 'status'> & { status?: ActivityStatus },
): Promise<string> {
  const id = `a_${Date.now().toString(36)}_${(seq++).toString(36)}`
  if (!address) return id
  const map = await load()
  const k = key(address)
  const entry: ActivityEntry = { ...e, id, ts: Date.now(), status: e.status ?? 'pending' }
  map[k] = [entry, ...(map[k] || [])].slice(0, LIMIT)
  await save(map)
  return id
}

export async function updateActivity(
  address: string,
  id: string,
  patch: Partial<Omit<ActivityEntry, 'id' | 'ts'>>,
): Promise<void> {
  if (!address || !id) return
  const map = await load()
  const list = map[key(address)]
  if (!list) return
  const i = list.findIndex((x) => x.id === id)
  if (i < 0) return
  const done = patch.status === 'ok' || patch.status === 'fail'
  list[i] = { ...list[i], ...patch, ...(done ? { endedAt: Date.now() } : {}) }
  await save(map)
}

export async function clearActivity(address: string): Promise<void> {
  const map = await load()
  delete map[key(address)]
  await save(map)
}

/**
 * 이 지갑에 요청을 보낸 적 있는 사이트들. 별도의 연결 권한 모델이 없으므로
 * "연결된 서비스" 는 기록에 남은 출처에서 유도한다.
 */
export function originsFrom(entries: ActivityEntry[]): { origin: string; last: number; count: number }[] {
  const m = new Map<string, { origin: string; last: number; count: number }>()
  for (const e of entries) {
    if (!e.origin) continue
    const cur = m.get(e.origin)
    if (cur) { cur.count++; cur.last = Math.max(cur.last, e.ts) }
    else m.set(e.origin, { origin: e.origin, last: e.ts, count: 1 })
  }
  return [...m.values()].sort((a, b) => b.last - a.last)
}

/** 상대 시각. 오래된 것은 날짜로 보여준다. */
export function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000)
  if (s < 60) return '방금'
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}분 전`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}시간 전`
  const d = Math.floor(h / 24)
  if (d < 7) return `${d}일 전`
  return new Date(ts).toISOString().slice(0, 10)
}
