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
