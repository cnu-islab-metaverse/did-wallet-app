// ====================================================================
// CONFIG EXPORTS
// ====================================================================
// Central export point for all configuration files.
// To use your own dev credentials:
// 1. Copy dev.config.ts to dev.config.local.ts
// 2. Fill in your real credentials in dev.config.local.ts
// 3. Modify the import below to use dev.config.local instead of dev.config
// ====================================================================

// Default: uses dev.config.ts (safe dummy data)
// For local development with real credentials: use dev.config.local
export * from './dev.config.local';

// Re-export other config files
export * from './app.config';
export * from './deployment.config';
export { STORAGE_KEYS } from './storage';
