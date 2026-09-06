// Main export for the shared app
export { default as App } from './App';

// Types that might be useful
export interface Platform {
  type: 'desktop' | 'extension';
  version: string;
}

// You can add more exports here as your app grows
export { getDemoVpRequest, buildVpFromRequestAndVc } from './lib/vpRequestHandler';
export type { VerifiablePresentation, Oid4vpRequestLike } from './lib/vpRequestHandler';

// HD Wallet exports
export { 
  initializeHDWallet, 
  getActiveAccount, 
  getAllAccounts, 
  switchAccount, 
  createNewAccount, 
  isHDWalletInitialized, 
  getHDWalletAddress, 
  clearHDWalletState 
} from './lib/wallet';
export type { WalletAccount } from './types/hdWallet';

// 아바타(HD 계정) 상태 훅 + DID(did:ethr) 헬퍼 + 저수준 서비스
export { useWallet } from './state/useWallet';
export type { WalletStatus } from './state/useWallet';
export { hdWalletService } from './lib/hdWalletService';
export { addressToDid, didToAddress, didMatchesAddress } from './lib/did';

// 데스크톱 실 셸(기본 화면). 레거시 App 은 참고용으로 남겨두고 #legacy 로만 진입한다.
export { WalletShell } from './ui/shell/WalletShell';

// ZK 증명 → 온체인 SBT 발급 (데스크톱 전용; 증명은 메인 프로세스에서 수행)
export { issuePass, proveVc, canIssue, circuitReady, scenariosForVc, SCENARIO_LABEL, SCENARIO_PASS_TYPE } from "./lib/passIssuance";
export { fetchOnChainPasses } from "./lib/passIssuance";
export type { Scenario, ProofCalldata, IssueResult, OnChainPass } from "./lib/passIssuance";

// 증명서(VC) 보관소 + 상태 훅
export { useVCs } from './state/useVCs';
export * as vcStore from './lib/vcStore';
