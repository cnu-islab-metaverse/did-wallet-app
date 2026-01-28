import { isDevelopment, getPlatform } from '../utils/platform';

// ====================================================================
// DEVELOPMENT CONFIGURATION TEMPLATE
// ====================================================================
// This file contains DUMMY DATA for demonstration and testing.
// For actual development, copy this to `dev.config.local.ts` and fill in your real credentials.
//
// GitHub clone users can run the app immediately with these safe defaults.
// ====================================================================

export const DEV_CONFIG = {
  // Set to true to bypass authentication during development
  skipAuth: false,
  
  wallet: {
    // Example password - replace in dev.config.local.ts
    password: 'test1234',
    // Example mnemonic (12-word) - replace with your own in dev.config.local.ts
    mnemonic: 'test test test test test test test test test test test junk',
    // Example private key - replace in dev.config.local.ts
    privateKey: '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
    // Example address - replace in dev.config.local.ts
    address: '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266',
  },
  // Default network for development
  network: 'sepolia' as const,
};

export { isDevelopment } from '../utils/platform';

export const isDevModeEnabled = () => {
  const devMode = isDevelopment();
  const skipAuth = DEV_CONFIG.skipAuth;
  const result = devMode && skipAuth;
  
  console.log('Dev Config Debug:', {
    isDevelopment: devMode,
    skipAuth: skipAuth,
    isDevModeEnabled: result,
    platform: getPlatform()
  });
  
  return result;
};