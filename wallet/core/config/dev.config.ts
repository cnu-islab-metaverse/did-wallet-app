import { isDevelopment } from '../utils/platform';
import { DEV_WALLET } from '../../dev.config';

// ====================================================================
// DEV CONFIG — 실제 설정 노브는 wallet/dev.config.ts 에 있습니다.
// 이 파일은 기존 코드(App/wallet.ts)가 쓰는 DEV_CONFIG/isDevModeEnabled
// 형태를 그대로 유지해 주는 어댑터입니다.
// ====================================================================

export { DEV_WALLET } from '../../dev.config';

export const DEV_CONFIG = {
  // 잠금 정책 스위치 (dev 빌드에서만 적용). 노브는 wallet/dev.config.ts 의 enabled.
  skipAuth: DEV_WALLET.enabled,
  wallet: {
    password: DEV_WALLET.password,
    mnemonic: DEV_WALLET.mnemonic,
    // 하위 호환용(주소/개인키를 직접 참조하는 기존 dev 경로)
    privateKey: '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
    address: '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266',
  },
  network: 'sepolia' as const,
};

export { isDevelopment } from '../utils/platform';

// dev 편의 활성 여부: 개발 빌드 && enabled. 배포 빌드에선 항상 false.
export const isDevModeEnabled = (): boolean => isDevelopment() && DEV_WALLET.enabled;
