// [작업] 렌더러측 지갑 RPC 처리기 — walletBridge 가 보낸 요청을 공유 core 지갑으로 수행한다.
//        키·저장·승인은 모두 이 렌더러(신뢰 컨텍스트)에서. 발급은 데스크톱 승인 모달을 거친다.
// [결과] initWalletRpc() 등록 후 확장(호스트→파이프→main)이 보낸 method 를 처리.
import { getActiveAccount, getAllAccounts, hdWalletService, addressToDid, didMatchesAddress, vcStore, fetchPassRequest, scenariosForVc, SCENARIO_LABEL } from '../../core'
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

    // 확장이 전달한 발급 요청. 사이트가 준 데이터이므로 컨트랙트에 직접 물어 확인한 뒤
    // 승인 모달을 띄운다(붙여넣기 경로와 같은 검사·같은 모달). 승인되면 곧바로 응답하고
    // 증명·트랜잭션은 데스크톱에서 이어간다 — MV3 서비스워커가 그때까지 살아 있지 않다.
    case 'requestPassIssuance': {
      const active = activeAccount()
      const addr: string | null = active?.address ?? null
      if (!hdWalletService.isUnlocked() || !addr) return { accepted: false, error: 'locked' }

      const input = params?.request ?? params?.url
      if (!input) return { accepted: false, error: 'no-request' }

      let checked
      try {
        checked = await fetchPassRequest(input)
      } catch (e: any) {
        return { accepted: false, error: String(e?.message || e) }
      }

      // 전달한 사이트가 요청에 적힌 출처와 다르면 알린다(제3자 중계 가능성).
      const origin = params?.origin
      if (origin && checked.request.origin?.url && !checked.request.origin.url.startsWith(String(origin))) {
        checked.warnings.push(
          `요청을 전달한 사이트(${origin})가 요청에 적힌 출처(${checked.request.origin.url})와 다릅니다.`,
        )
      }

      // 증명할 수 있는 증명서가 없으면 승인을 물을 이유가 없다.
      const held = await vcStore.getVCs(addr)
      if (!held.some((v: any) => scenariosForVc(v).includes(checked.request.scenario))) {
        return {
          accepted: false,
          error: `이 요청에 맞는 증명서가 지갑에 없습니다 (${SCENARIO_LABEL[checked.request.scenario]}).`,
        }
      }

      const approved = await requestApproval('pass-issuance', checked)
      return {
        accepted: approved,
        address: addr,
        contract: checked.request.contract,
        passType: checked.request.passType,
      }
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
