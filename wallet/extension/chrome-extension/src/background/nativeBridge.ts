// [작업] 데스크톱 지갑 프로그램(네이티브 호스트 com.cnu.didwallet)과의 브리지. 확장은 키를 보관하지
//        않는 씬클라이언트 — 모든 지갑 작업을 이 브리지로 데스크톱에 위임한다. MV3 서비스워커가
//        잠들면 포트가 끊기므로 요청 시 지연 재연결한다.
// [결과] request(method, params) → 데스크톱 응답. 프로그램 미설치/미실행 시 program-not-running 등 오류.

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

// 오류 → 사용자 안내 문구. 프로그램 미설치/미실행/미연결을 하나로 안내.
export function friendlyError(e: any): string {
  const m = String(e?.message || e)
  if (m.includes('program-not-running') || m.includes('native-host-unavailable') ||
      m.includes('disconnected') || m.includes('Specified native messaging host not found') ||
      m.includes('not found')) {
    return '데스크톱 지갑 프로그램을 설치하고 실행해 주세요. (확장은 단독으로 동작하지 않습니다)'
  }
  return m
}
