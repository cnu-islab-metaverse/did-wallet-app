export interface WalletAccount {
  id: string; // UUID or unique identifier
  name: string; // User-defined name (e.g., "Account 1", "My Wallet")
  address: string; // Ethereum address
  derivationIndex: number; // HD derivation index (0, 1, 2, ...)
  isActive: boolean; // Currently selected account
  createdAt: number; // Timestamp
}

export interface HDWalletState {
  seed: string; // Encrypted seed phrase (mnemonic)
  accounts: WalletAccount[];
  activeAccountId: string | null;
  lastDerivationIndex: number; // Track last used index for new accounts
}

export interface HDWalletConfig {
  defaultAccountName: string;
  maxAccounts: number;
  derivationPath: string; // e.g., "m/44'/60'/0'/0"
}

export interface AccountCreationResult {
  account: WalletAccount;
  success: boolean;
  error?: string;
}

export interface AccountUpdateResult {
  success: boolean;
  error?: string;
}
