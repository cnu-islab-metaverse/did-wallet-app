export const COLORS = {
  Reset: '\x1b[0m',
  Bright: '\x1b[1m',
  Dim: '\x1b[2m',
  Underscore: '\x1b[4m',
  Blink: '\x1b[5m',
  Reverse: '\x1b[7m',
  Hidden: '\x1b[8m',
  FgBlack: '\x1b[30m',
  FgRed: '\x1b[31m',
  FgGreen: '\x1b[32m',
  FgYellow: '\x1b[33m',
  FgBlue: '\x1b[34m',
  FgMagenta: '\x1b[35m',
  FgCyan: '\x1b[36m',
  FgWhite: '\x1b[37m',
  BgBlack: '\x1b[40m',
  BgRed: '\x1b[41m',
  BgGreen: '\x1b[42m',
  BgYellow: '\x1b[43m',
  BgBlue: '\x1b[44m',
  BgMagenta: '\x1b[45m',
  BgCyan: '\x1b[46m',
  BgWhite: '\x1b[47m',
} as const;

// Centralized error codes with default english messages.
export const ERROR_CODES = {
  // Wallet
  EXTENSION_POPUP_OPEN_FAILED: { code: 'EXTENSION_POPUP_OPEN_FAILED', defaultMessage: 'Failed to open extension popup' },
  USER_RESPONSE_TIMEOUT: { code: 'USER_RESPONSE_TIMEOUT', defaultMessage: 'User response timed out' },

  // VC verification / issuance
  VC_VERIFY_FAILED: { code: 'VC_VERIFY_FAILED', defaultMessage: 'VC verification failed' },
  VC_SAVE_FAILED: { code: 'VC_SAVE_FAILED', defaultMessage: 'Failed to save VC' },
  VC_DELETE_FAILED: { code: 'VC_DELETE_FAILED', defaultMessage: 'Failed to delete VC' },
  VC_NOT_FOUND: { code: 'VC_NOT_FOUND', defaultMessage: 'VC not found' },

  // Address
  ADDRESS_REQUEST_FAILED: { code: 'ADDRESS_REQUEST_FAILED', defaultMessage: 'Wallet address request failed' },
} as const;
