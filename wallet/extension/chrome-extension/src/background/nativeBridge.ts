// [작업] 데스크톱 지갑 프로그램(네이티브 호스트 com.cnu.didwallet)과의 브리지. 확장은 키를 갖지
//        않고 모든 작업을 위임한다. MV3 서비스워커가 잠들면 포트가 끊기므로 요청 시 재연결한다.
// [결과] request(method, params) → 데스크톱 응답. 미설치/미실행 시 program-not-running.

const HOST = 'com.cnu.didwallet'

let port: chrome.runtime.Port | null = null
let seq = 0
const pending = new Map<number, { resolve: (v: any) => void; reject: (e: any) => void; timer: any }>()

function failAll(err: Error) {
  for (const [, e] of pending) { clearTimeout(e.timer); e.reject(err) }
  pending.clear()
}

function connect(): chrome.runtime.Port | null {
  try {
    const p = chrome.runtime.connectNative(HOST)
    p.onMessage.addListener((msg: any) => {
      const e = pending.get(msg?.id)
      if (!e) return
      pending.delete(msg.id)
      clearTimeout(e.timer)
      if (msg.error) e.reject(new Error(msg.error))
      else e.resolve(msg.result)
    })
    p.onDisconnect.addListener(() => {
      const msg = chrome.runtime.lastError?.message || 'native-host-disconnected'
      port = null
      failAll(new Error(msg))
    })
    return p
  } catch {
    return null
  }
}

export function request(method: string, params?: any, timeoutMs = 60000): Promise<any> {
  return new Promise((resolve, reject) => {
    if (!port) port = connect()
    if (!port) return reject(new Error('native-host-unavailable'))
    const id = ++seq
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('rpc-timeout')) }, timeoutMs)
    pending.set(id, { resolve, reject, timer })
    try {
      port.postMessage({ id, method, params })
    } catch (e: any) {
      pending.delete(id)
      clearTimeout(timer)
      port = null
      reject(new Error('native-host-unavailable'))
    }
  })
}

// 데스크톱 프로그램 실행 여부 확인(핑).
export async function isDesktopAvailable(): Promise<boolean> {
  try {
    const r = await request('ping', {}, 3000)
    return !!r?.ok
  } catch {
    return false
  }
}

// 두 실패는 원인도 해법도 다르다. 뭉뚱그리면 프로그램을 켜 둔 채로 "설치하라"는 말을 듣게 된다.
//   not-registered — 브라우저가 호스트를 모른다. 한 번 등록하면 끝난다.
//   not-running    — 호스트는 떴는데 지갑이 파이프를 열고 있지 않다. 실행만 하면 된다.
export type BridgeFault = 'not-registered' | 'not-running' | 'other'

export function classify(e: any): BridgeFault {
  const m = String(e?.message || e)
  if (m.includes('program-not-running')) return 'not-running'
  if (m.includes('native-host-unavailable') || m.includes('not found') || m.includes('forbidden')) {
    return 'not-registered'
  }
  return 'other'
}

export function friendlyError(e: any): string {
  switch (classify(e)) {
    case 'not-running':
      return '데스크톱 지갑 프로그램을 실행해 주세요.'
    case 'not-registered':
      return '브라우저가 지갑 프로그램을 아직 모릅니다. wallet/desktop 에서 `yarn register:host` 를 실행한 뒤 브라우저를 재시작하세요.'
    default:
      return String(e?.message || e)
  }
}
