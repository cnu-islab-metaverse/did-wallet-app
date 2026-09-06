// [작업] 렌더러측 지갑 RPC 처리기 — main 의 walletBridge 가 보낸 요청을 공유 core 지갑으로
//        수행하고 결과를 되돌린다. 키·저장·승인은 모두 이 데스크톱 렌더러(신뢰 컨텍스트)에서.
//        VC 저장은 활성 계정별 vcStore 로 통일(새 셸과 동일 저장소). 발급은 데스크톱 승인 모달을 거친다.
// [결과] initWalletRpc() 등록 후 확장(호스트→파이프→main)이 보낸 method 를 처리.
import { getActiveAccount, getAllAccounts, hdWalletService, addressToDid, didMatchesAddress, vcStore } from '../../core'
import { storageAdapter } from '../../core/lib/storageAdapter'
import { STORAGE_KEYS } from '../../core/config/storage'

// 승인 요청을 셸 UI 로 넘기는 이벤트 / VC 변경을 셸에 알리는 이벤트.
const APPROVAL_EVENT = 'wallet-rpc-approval'
const VC_UPDATED_EVENT = 'wallet-vc-updated'

async function storedAddress(): Promise<string | null> {
  try {
    const st = await storageAdapter.get<any>(STORAGE_KEYS.walletState)
    return st?.address ?? null
  } catch { return null }
}

function activeAccount(): any | null {
  try { return getActiveAccount() } catch { return null }
}

function emitUpdated(): void {
  try { window.dispatchEvent(new CustomEvent(VC_UPDATED_EVENT)) } catch { /* */ }
}

// 승인 필요한 요청: 셸에 이벤트를 발행하고 사용자의 승인/거절을 기다린다.
// 응답자가 없으면(뷰가 리슨 안 함) 90초 뒤 거절로 폴백(자동승인 없음).
function requestApproval(kind: string, payload: any): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false
    const done = (v: boolean) => { if (!settled) { settled = true; resolve(!!v) } }
    window.dispatchEvent(new CustomEvent(APPROVAL_EVENT, { detail: { kind, payload, respond: done } }))
    setTimeout(() => done(false), 90000)
  })
}

async function dispatch(method: string, params: any): Promise<any> {
  switch (method) {
    case 'ping':
      return { ok: true, program: 'cnu-did-wallet' }

    case 'getAddresses': {
      let accounts: any[] = []
      try { accounts = getAllAccounts() as any } catch { /* not initialized */ }
      const active = activeAccount()
      const address = active?.address ?? (await storedAddress())
      return { accounts, active, address, did: address ? addressToDid(address) : null }
    }

    case 'getVCs': {
      const addr = activeAccount()?.address ?? (await storedAddress())
      return addr ? await vcStore.getVCs(addr) : []
    }

    case 'requestVCIssuance': {
      const vc = params?.vc
      const origin = params?.origin
      const active = activeAccount()
      const addr: string | null = active?.address ?? null
      // 사용자가 승인할 수 있도록 언락 + 활성 계정 필요
      if (!hdWalletService.isUnlocked() || !addr) return { approved: false, error: 'locked' }
      // 형식 검사
      if (!vc || typeof vc !== 'object' || !vc.credentialSubject) return { approved: false, error: 'invalid-vc' }
      // DID(대상 계정) 일치 검사
      const subjId = vc.credentialSubject?.id
      if (subjId && !didMatchesAddress(String(subjId), addr)) return { approved: false, error: 'did-mismatch' }
      // 데스크톱 승인 모달
      const approved = await requestApproval('vc-issuance', { vc, origin, address: addr, did: addressToDid(addr), accountName: active?.name })
      if (!approved) return { approved: false }
      const r = await vcStore.addVC(addr, vc)
      emitUpdated()
      return { approved: true, duplicate: r.duplicate === true, count: (await vcStore.getVCs(addr)).length }
    }

    case 'saveVC': {
      const vc = params?.vc
      const addr = activeAccount()?.address
      if (!addr) return { saved: false, error: 'no-account' }
      const r = await vcStore.addVC(addr, vc)
      emitUpdated()
      return { saved: r.ok, duplicate: r.duplicate === true, count: (await vcStore.getVCs(addr)).length }
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
