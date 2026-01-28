import { ethers, Mnemonic } from 'ethers';
import { WalletAccount, HDWalletState, HDWalletConfig, AccountCreationResult, AccountUpdateResult } from '../types/hdWallet';
import { STORAGE_KEYS } from '../config/storage';
import { storageAdapter } from './storageAdapter';

export class HDWalletService {
  private static instance: HDWalletService;
  private state: HDWalletState | null = null;
  private config: HDWalletConfig = {
    defaultAccountName: 'Account',
    maxAccounts: 10,
    derivationPath: "m/44'/60'/0'/0" // Standard Ethereum derivation path
  };

  private constructor() {}

  static getInstance(): HDWalletService {
    if (!HDWalletService.instance) {
      HDWalletService.instance = new HDWalletService();
    }
    return HDWalletService.instance;
  }

  // Initialize HD wallet from mnemonic
  async initializeFromMnemonic(mnemonic: string, password: string): Promise<boolean> {
    try {
      // Encrypt the mnemonic seed
      const encryptedSeed = await this.encryptSeed(mnemonic, password);
      
      // Create first account (index 0)
      const firstAccount = await this.deriveAccount(mnemonic, 0, 'Account 1');
      
      this.state = {
        seed: encryptedSeed,
        accounts: [firstAccount],
        activeAccountId: firstAccount.id,
        lastDerivationIndex: 0
      };

      await this.saveState();
      return true;
    } catch (error) {
      console.error('Failed to initialize HD wallet:', error);
      return false;
    }
  }

  // Load HD wallet state from storage
  async loadState(): Promise<boolean> {
    try {
      const stored = await storageAdapter.get<HDWalletState>(STORAGE_KEYS.hdWalletState);
      if (stored) {
        this.state = stored;
        return true;
      }
      return false;
    } catch (error) {
      console.error('Failed to load HD wallet state:', error);
      return false;
    }
  }

  // Save HD wallet state to storage
  private async saveState(): Promise<void> {
    if (this.state) {
      await storageAdapter.set(STORAGE_KEYS.hdWalletState, this.state);
    }
  }

  // Decrypt seed with password
  async decryptSeed(password: string): Promise<string | null> {
    if (!this.state) return null;
    
    try {
      // Simple encryption/decryption (in production, use proper encryption)
      // For now, we'll use a placeholder - in real implementation, use proper encryption
      return this.state.seed; // This should be properly decrypted
    } catch (error) {
      console.error('Failed to decrypt seed:', error);
      return null;
    }
  }

  // Encrypt seed with password
  private async encryptSeed(seed: string, password: string): Promise<string> {
    // Simple encryption (in production, use proper encryption like AES)
    // For now, we'll use a placeholder - in real implementation, use proper encryption
    return seed; // This should be properly encrypted
  }

  // Derive account from mnemonic at specific index
  // MetaMask-compatible BIP44 path: m/44'/60'/0'/0/{index}
  private async deriveAccount(mnemonic: string, index: number, name: string): Promise<WalletAccount> {
    // Use Mnemonic to get seed, then create HDNodeWallet from seed to specify exact path
    const mnemonicObj = Mnemonic.fromPhrase(mnemonic);
    const seed = mnemonicObj.computeSeed();
    const rootNode = ethers.HDNodeWallet.fromSeed(seed);
    // MetaMask uses m/44'/60'/0'/0/{index} for account derivation
    const derivedWallet = rootNode.derivePath(`m/44'/60'/0'/0/${index}`);
    
    return {
      id: this.generateAccountId(),
      name: name,
      address: derivedWallet.address,
      derivationIndex: index,
      isActive: false,
      createdAt: Date.now()
    };
  }

  // Generate unique account ID
  private generateAccountId(): string {
    return `account_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Create new account
  async createAccount(name?: string, password: string): Promise<AccountCreationResult> {
    if (!this.state) {
      return { account: {} as WalletAccount, success: false, error: 'HD wallet not initialized' };
    }

    if (this.state.accounts.length >= this.config.maxAccounts) {
      return { account: {} as WalletAccount, success: false, error: 'Maximum number of accounts reached' };
    }

    try {
      const mnemonic = await this.decryptSeed(password);
      if (!mnemonic) {
        return { account: {} as WalletAccount, success: false, error: 'Failed to decrypt seed' };
      }

      const nextIndex = this.state.lastDerivationIndex + 1;
      const accountName = name || `${this.config.defaultAccountName} ${this.state.accounts.length + 1}`;
      
      const newAccount = await this.deriveAccount(mnemonic, nextIndex, accountName);
      
      // Update state
      this.state.accounts.push(newAccount);
      this.state.lastDerivationIndex = nextIndex;
      
      await this.saveState();
      
      return { account: newAccount, success: true };
    } catch (error) {
      console.error('Failed to create account:', error);
      return { account: {} as WalletAccount, success: false, error: 'Failed to create account' };
    }
  }

  // Get all accounts
  getAccounts(): WalletAccount[] {
    return this.state?.accounts || [];
  }

  // Get active account
  getActiveAccount(): WalletAccount | null {
    if (!this.state) return null;
    return this.state.accounts.find(acc => acc.id === this.state!.activeAccountId) || null;
  }

  // Set active account
  async setActiveAccount(accountId: string): Promise<boolean> {
    if (!this.state) return false;
    
    const account = this.state.accounts.find(acc => acc.id === accountId);
    if (!account) return false;

    // Update all accounts to set isActive
    this.state.accounts.forEach(acc => {
      acc.isActive = acc.id === accountId;
    });
    
    this.state.activeAccountId = accountId;
    await this.saveState();
    return true;
  }

  // Update account name
  async updateAccountName(accountId: string, newName: string): Promise<AccountUpdateResult> {
    if (!this.state) {
      return { success: false, error: 'HD wallet not initialized' };
    }

    const account = this.state.accounts.find(acc => acc.id === accountId);
    if (!account) {
      return { success: false, error: 'Account not found' };
    }

    account.name = newName;
    await this.saveState();
    
    return { success: true };
  }

  // Remove account (cannot remove the last account)
  async removeAccount(accountId: string): Promise<AccountUpdateResult> {
    if (!this.state) {
      return { success: false, error: 'HD wallet not initialized' };
    }

    if (this.state.accounts.length <= 1) {
      return { success: false, error: 'Cannot remove the last account' };
    }

    const accountIndex = this.state.accounts.findIndex(acc => acc.id === accountId);
    if (accountIndex === -1) {
      return { success: false, error: 'Account not found' };
    }

    // If removing active account, switch to first remaining account
    if (this.state.activeAccountId === accountId) {
      const remainingAccounts = this.state.accounts.filter(acc => acc.id !== accountId);
      this.state.activeAccountId = remainingAccounts[0].id;
    }

    this.state.accounts.splice(accountIndex, 1);
    await this.saveState();
    
    return { success: true };
  }

  // Get private key for account (for signing transactions)
  async getPrivateKeyForAccount(accountId: string, password: string): Promise<string | null> {
    if (!this.state) return null;

    const account = this.state.accounts.find(acc => acc.id === accountId);
    if (!account) return null;

    try {
      const mnemonic = await this.decryptSeed(password);
      if (!mnemonic) return null;

      // Use Mnemonic to get seed, then create HDNodeWallet from seed to specify exact path
      const mnemonicObj = Mnemonic.fromPhrase(mnemonic);
      const seed = mnemonicObj.computeSeed();
      const rootNode = ethers.HDNodeWallet.fromSeed(seed);
      // MetaMask uses m/44'/60'/0'/0/{index} for account derivation
      const derivedWallet = rootNode.derivePath(`m/44'/60'/0'/0/${account.derivationIndex}`);
      
      return derivedWallet.privateKey;
    } catch (error) {
      console.error('Failed to get private key:', error);
      return null;
    }
  }

  // Check if HD wallet is initialized
  isInitialized(): boolean {
    return this.state !== null;
  }

  // Clear HD wallet state (for logout/reset)
  async clearState(): Promise<void> {
    this.state = null;
    await storageAdapter.remove(STORAGE_KEYS.hdWalletState);
  }
}

// Export singleton instance
export const hdWalletService = HDWalletService.getInstance();
