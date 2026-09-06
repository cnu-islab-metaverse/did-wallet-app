import { ethers, Mnemonic } from 'ethers';
import { WalletAccount, HDWalletState, HDWalletConfig, AccountCreationResult, AccountUpdateResult } from '../types/hdWallet';
import { STORAGE_KEYS } from '../config/storage';
import { storageAdapter } from './storageAdapter';
import { encryptSeed as encSeed, decryptSeed as decSeed } from './seedCrypto';
import { addressToDid } from './did';

export class HDWalletService {
  private static instance: HDWalletService;
  private state: HDWalletState | null = null;
  private unlockedMnemonic: string | null = null; // 언락 세션 동안만 인메모리 보관(잠금 시 소거)
  private config: HDWalletConfig = {
    defaultAccountName: 'Account',
    maxAccounts: 10,
    derivationPath: "m/44'/60'/0'/0", // Standard Ethereum derivation path
  };

  private constructor() {}

  static getInstance(): HDWalletService {
    if (!HDWalletService.instance) HDWalletService.instance = new HDWalletService();
    return HDWalletService.instance;
  }

  // 니모닉으로 HD 지갑 초기화(생성/가져오기). 시드는 암호화 저장하고, 생성 직후 언락 상태로 둔다.
  async initializeFromMnemonic(mnemonic: string, password: string): Promise<boolean> {
    try {
      const encryptedSeed = await encSeed(mnemonic, password);
      const firstAccount = this.deriveAccount(mnemonic, 0, 'Account 1');
      this.state = {
        seed: encryptedSeed,
        accounts: [{ ...firstAccount, isActive: true }],
        activeAccountId: firstAccount.id,
        lastDerivationIndex: 0,
      };
      this.unlockedMnemonic = mnemonic;
      await this.saveState();
      return true;
    } catch (error) {
      console.error('Failed to initialize HD wallet:', error);
      return false;
    }
  }

  async loadState(): Promise<boolean> {
    try {
      const stored = await storageAdapter.get<HDWalletState>(STORAGE_KEYS.hdWalletState);
      if (stored) { this.state = stored; return true; }
      return false;
    } catch (error) {
      console.error('Failed to load HD wallet state:', error);
      return false;
    }
  }

  private async saveState(): Promise<void> {
    if (this.state) await storageAdapter.set(STORAGE_KEYS.hdWalletState, this.state);
  }

  // 비밀번호로 언락 → 시드 복호화 후 인메모리 보관. 잘못된 비번은 실패(false).
  async unlock(password: string): Promise<boolean> {
    if (!this.state) return false;
    try {
      this.unlockedMnemonic = await decSeed(this.state.seed, password);
      return true;
    } catch {
      this.unlockedMnemonic = null;
      return false;
    }
  }

  lock(): void { this.unlockedMnemonic = null; }
  isUnlocked(): boolean { return this.unlockedMnemonic !== null; }

  // 시드 확보: 언락 세션 우선, 없으면 비밀번호로 복호화.
  private async resolveMnemonic(password?: string): Promise<string | null> {
    if (this.unlockedMnemonic) return this.unlockedMnemonic;
    if (password && this.state) {
      try { return await decSeed(this.state.seed, password); } catch { return null; }
    }
    return null;
  }

  async decryptSeed(password: string): Promise<string | null> {
    return this.resolveMnemonic(password);
  }

  // 니모닉 + 인덱스 → 계정(주소·DID). MetaMask 호환 m/44'/60'/0'/0/{index}.
  private deriveAccount(mnemonic: string, index: number, name: string): WalletAccount {
    const seed = Mnemonic.fromPhrase(mnemonic).computeSeed();
    const root = ethers.HDNodeWallet.fromSeed(seed);
    const derived = root.derivePath(`m/44'/60'/0'/0/${index}`);
    return {
      id: this.generateAccountId(),
      name,
      address: derived.address,
      did: addressToDid(derived.address),
      derivationIndex: index,
      isActive: false,
      createdAt: Date.now(),
    };
  }

  private generateAccountId(): string {
    return `account_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
  }

  // 새 계정 파생. 언락 세션(또는 password)으로 시드 확보.
  async createAccount(name?: string, password?: string): Promise<AccountCreationResult> {
    if (!this.state) return { account: {} as WalletAccount, success: false, error: 'HD wallet not initialized' };
    if (this.state.accounts.length >= this.config.maxAccounts) {
      return { account: {} as WalletAccount, success: false, error: 'Maximum number of accounts reached' };
    }
    const mnemonic = await this.resolveMnemonic(password);
    if (!mnemonic) return { account: {} as WalletAccount, success: false, error: 'Wallet is locked' };
    try {
      const nextIndex = this.state.lastDerivationIndex + 1;
      const accountName = name || `${this.config.defaultAccountName} ${this.state.accounts.length + 1}`;
      const newAccount = this.deriveAccount(mnemonic, nextIndex, accountName);
      this.state.accounts.push(newAccount);
      this.state.lastDerivationIndex = nextIndex;
      await this.saveState();
      return { account: newAccount, success: true };
    } catch (error) {
      console.error('Failed to create account:', error);
      return { account: {} as WalletAccount, success: false, error: 'Failed to create account' };
    }
  }

  getAccounts(): WalletAccount[] { return this.state?.accounts || []; }
  getActiveAccount(): WalletAccount | null {
    if (!this.state) return null;
    return this.state.accounts.find((a) => a.id === this.state!.activeAccountId) || null;
  }

  async setActiveAccount(accountId: string): Promise<boolean> {
    if (!this.state) return false;
    const account = this.state.accounts.find((a) => a.id === accountId);
    if (!account) return false;
    this.state.accounts.forEach((a) => { a.isActive = a.id === accountId; });
    this.state.activeAccountId = accountId;
    await this.saveState();
    return true;
  }

  async updateAccountName(accountId: string, newName: string): Promise<AccountUpdateResult> {
    if (!this.state) return { success: false, error: 'HD wallet not initialized' };
    const account = this.state.accounts.find((a) => a.id === accountId);
    if (!account) return { success: false, error: 'Account not found' };
    account.name = newName;
    await this.saveState();
    return { success: true };
  }

  async removeAccount(accountId: string): Promise<AccountUpdateResult> {
    if (!this.state) return { success: false, error: 'HD wallet not initialized' };
    if (this.state.accounts.length <= 1) return { success: false, error: 'Cannot remove the last account' };
    const idx = this.state.accounts.findIndex((a) => a.id === accountId);
    if (idx === -1) return { success: false, error: 'Account not found' };
    if (this.state.activeAccountId === accountId) {
      const remaining = this.state.accounts.filter((a) => a.id !== accountId);
      this.state.activeAccountId = remaining[0].id;
      remaining[0].isActive = true;
    }
    this.state.accounts.splice(idx, 1);
    await this.saveState();
    return { success: true };
  }

  // 서명용 개인키(파생). 언락 세션(또는 password) 필요.
  async getPrivateKeyForAccount(accountId: string, password?: string): Promise<string | null> {
    if (!this.state) return null;
    const account = this.state.accounts.find((a) => a.id === accountId);
    if (!account) return null;
    const mnemonic = await this.resolveMnemonic(password);
    if (!mnemonic) return null;
    try {
      const seed = Mnemonic.fromPhrase(mnemonic).computeSeed();
      const root = ethers.HDNodeWallet.fromSeed(seed);
      return root.derivePath(`m/44'/60'/0'/0/${account.derivationIndex}`).privateKey;
    } catch (error) {
      console.error('Failed to get private key:', error);
      return null;
    }
  }

  // 활성(또는 지정) 계정 서명자 — VP 공개신호·mintPass tx 용. 언락 상태에서만.
  getSigner(accountId?: string): ethers.Wallet | null {
    if (!this.state || !this.unlockedMnemonic) return null;
    const id = accountId ?? this.state.activeAccountId;
    const account = this.state.accounts.find((a) => a.id === id);
    if (!account) return null;
    const seed = Mnemonic.fromPhrase(this.unlockedMnemonic).computeSeed();
    const root = ethers.HDNodeWallet.fromSeed(seed);
    return new ethers.Wallet(root.derivePath(`m/44'/60'/0'/0/${account.derivationIndex}`).privateKey);
  }

  isInitialized(): boolean { return this.state !== null; }

  async clearState(): Promise<void> {
    this.state = null;
    this.unlockedMnemonic = null;
    await storageAdapter.remove(STORAGE_KEYS.hdWalletState);
  }
}

export const hdWalletService = HDWalletService.getInstance();
