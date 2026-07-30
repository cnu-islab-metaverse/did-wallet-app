// ====================================================================
// APPLICATION CONFIGURATION
// ====================================================================
// General app settings that can be safely committed to GitHub.
// For personal customization, create `app.config.local.ts` (optional).
// ====================================================================

export const APP_CONFIG = {
  appName: 'DID Wallet',
  defaults: {
    theme: 'system' as 'system' | 'light' | 'dark',
    lastActiveTab: 'tokens' as 'tokens' | 'vc' | 'nft' | 'activity',
    currentNetworkChainId: 1,
  },
  dev: {
    seedVCs: true,
  }
} as const;