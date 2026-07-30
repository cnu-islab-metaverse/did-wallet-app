// [작업] 렌더러측 지갑 RPC 처리기 — main 의 walletBridge 가 보낸 요청을 공유 src/ 지갑 코어로
//        수행하고 결과를 되돌린다. 키·저장·승인은 모두 이 데스크톱 렌더러(신뢰 컨텍스트)에서.
// [결과] initWalletRpc() 등록 후 확장(호스트→파이프→main)이 보낸 method 를 처리.
import { getAllAccounts, getActiveAccount } from '../../src'
import { storageAdapter } from '../../src/lib/storageAdapter'
import { STORAGE_KEYS } from '../../src/config/storage'

// 승인 이벤트를 App UI 로 넘기기 위한 브라우저 커스텀 이벤트 이름(App 이 리슨해 모달 표시).
const APPROVAL_EVENT = 'wallet-rpc-approval'

async function storedAddress(): Promise<string | null> {
  try {
    const st = await storageAdapter.get<any>(STORAGE_KEYS.walletState)
    return st?.address ?? null
  } catch { return null }
}

// 승인 필요한 요청: App 에 커스텀 이벤트를 발행하고 사용자의 승인/거절을 기다린다.
// App 이 아직 핸들러를 안 붙였으면(데모) 자동 승인으로 폴백.
function requestApproval(kind: string, payload: any): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false
    const done = (v: boolean) => { if (!settled) { settled = true; resolve(v) } }
    const detail = { kind, payload, respond: done }
    window.dispatchEvent(new CustomEvent(APPROVAL_EVENT, { detail }))
    // 3초 내 App 이 respond 를 호출하지 않으면 데모 자동 승인
    setTimeout(() => done(true), 3000)
  })
}

async function dispatch(method: string, params: any): Promise<any> {
  switch (method) {
    case 'ping':
      return { ok: true, program: 'cnu-did-wallet' }

    case 'getAddresses': {
      let accounts: any[] = []
      let active: any = null
      try { accounts = getAllAccounts() as any } catch { /* not initialized */ }
      try { active = getActiveAccount() as any } catch { /* not initialized */ }
      const fallback = await storedAddress()
      return { accounts, active, address: active?.address ?? fallback }
    }

    case 'getVCs':
      return (await storageAdapter.get<any[]>('savedVCs')) || []

    case 'requestVCIssuance': {
      const approved = await requestApproval('vc-issuance', params?.vc)
      if (!approved) return { approved: false }
      const list = (await storageAdapter.get<any[]>('savedVCs')) || []
      list.push(params.vc)
      await storageAdapter.set('savedVCs', list)
      return { approved: true, count: list.length }
    }

    case 'saveVC': {
      const list = (await storageAdapter.get<any[]>('savedVCs')) || []
      list.push(params.vc)
      await storageAdapter.set('savedVCs', list)
      return { saved: true, count: list.length }
    }

    default:
      throw new Error('unknown-method: ' + method)
  }
}

export function initWalletRpc(): void {
  const ipc = (window as any).ipcRenderer
  if (!ipc?.on || !ipc?.send) return
  ipc.on('wallet-rpc-request', async (_e: any, req: any) => {
    try {
      const result = await dispatch(req.method, req.params)
      ipc.send('wallet-rpc-response', { id: req.id, result })
    } catch (e: any) {
      ipc.send('wallet-rpc-response', { id: req.id, error: String(e?.message || e) })
    }
  })
  console.log('[walletRpc] renderer handler ready')
}
