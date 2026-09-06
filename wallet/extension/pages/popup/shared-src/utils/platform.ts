/**
 * Platform detection and environment utilities
 * 
 * Shared by Chrome Extension and Desktop App to handle platform-specific behavior
 */

export type Platform = 'extension' | 'desktop';
export type Environment = 'development' | 'production';

export function getPlatform(): Platform {
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id) {
    return 'extension';
  }
  
  return 'desktop';
}

export function isChromeExtension(): boolean {
  return getPlatform() === 'extension';
}

export function isDesktopApp(): boolean {
  return getPlatform() === 'desktop';
}

export function isChromeStorageAvailable(): boolean {
  try {
    return typeof chrome !== 'undefined' && !!chrome.storage?.local;
  } catch {
    return false;
  }
}

/**
 * Detects development environment
 * - Extension: unpacked extension (loaded in developer mode)
 * - Desktop: NODE_ENV=development or running on localhost
 */
export function isDevelopment(): boolean {
  if (isChromeExtension()) {
    try {
      // Unpacked extensions don't have update_url in manifest
      return !chrome.runtime.getManifest().update_url;
    } catch {
      return false;
    }
  }
  
  return (
    process.env.NODE_ENV === 'development' ||
    (typeof window !== 'undefined' && window.location.hostname === 'localhost')
  );
}

export function isProduction(): boolean {
  return !isDevelopment();
}

/**
 * Returns comprehensive environment information for debugging
 */
export function getEnvironmentInfo() {
  return {
    platform: getPlatform(),
    environment: isDevelopment() ? 'development' : 'production',
    isChromeExtension: isChromeExtension(),
    isDesktopApp: isDesktopApp(),
    isDevelopment: isDevelopment(),
    isProduction: isProduction(),
    hasChromeStorage: isChromeStorageAvailable(),
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'N/A',
    nodeEnv: process.env.NODE_ENV || 'N/A',
  };
}
