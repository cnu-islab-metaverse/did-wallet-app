// [작업] 주소 ↔ DID(did:ethr) 매핑. DID 는 아바타(계정)의 탈중앙 식별자(라벨)일 뿐 —
//        DID 문서 저장소/제출자 서명은 이 단계에서 불필요. 발급 VC 의 credentialSubject.id 와 동일 포맷.
// [결과] addressToDid / didToAddress / didMatchesAddress.

export interface DidOptions { network?: string } // 예: 'sepolia' (기본: 무네트워크 — 파이프라인 정합)

// 주소 표기는 발급 VC(체크섬 케이스)와 맞추기 위해 그대로 사용.
export function addressToDid(address: string, opts: DidOptions = {}): string {
  return opts.network ? `did:ethr:${opts.network}:${address}` : `did:ethr:${address}`
}

export function didToAddress(did: string): string | null {
  const m = String(did).match(/0x[0-9a-fA-F]{40}/)
  return m ? m[0] : null
}

export function didMatchesAddress(did: string, address: string): boolean {
  const d = didToAddress(did)
  return !!d && d.toLowerCase() === address.toLowerCase()
}
