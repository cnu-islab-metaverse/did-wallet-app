// ═══════════════════════════════════════════════════════════════════════
//   DID&SBT Wallet — 개발용 설정 (여기서 dev 동작을 제어합니다)
//   ※ 배포(프로덕션) 빌드에서는 이 설정이 전부 무시되고 실제 잠금 정책이 적용됩니다.
// ═══════════════════════════════════════════════════════════════════════
export const DEV_WALLET = {
  // dev 편의(자동 진입) 사용 여부.
  //   false → 배포와 동일하게 온보딩/잠금해제 흐름을 그대로 사용.
  enabled: true,

  // 시작 방식:
  //   'fixed' → 아래 고정 니모닉으로 지갑을 자동 생성하고 자동 잠금해제 (비번 없이 바로 진입)
  //   'empty' → 지갑 없이 온보딩부터 시작 (새 지갑 생성 / 복구구문 입력) — 온보딩·잠금 흐름 테스트용
  start: 'fixed' as 'fixed' | 'empty',

  // 개발용 계정의 니모닉. 실값은 gitignore 되는 wallet/desktop/.env.local 의 VITE_DEV_MNEMONIC 에 둔다
  // (Sepolia 잔액을 가진 데모 지갑이라 저장소 히스토리에 남기지 않는다).
  // 없으면 아래 Anvil 표준 테스트 니모닉으로 폴백 — 키 없이도 앱은 뜬다(단 온체인 발급은 불가).
  mnemonic:
    ((import.meta as any).env?.VITE_DEV_MNEMONIC as string | undefined) ??
    'test test test test test test test test test test test junk',
  password: 'test1234',
}

export type DevWalletConfig = typeof DEV_WALLET
