import type { JsonRpcProvider } from 'ethers'
import { Wallet, JsonRpcProvider as EthersJsonRpcProvider, HDNodeWallet, Mnemonic } from 'ethers'
import { DEV_CONFIG, isDevModeEnabled } from '../config'
import { STORAGE_KEYS } from '../config/storage'
import { storageAdapter } from './storageAdapter'
import { validatePassword, validateMnemonic, validatePrivateKey, validateWalletConfig } from './validation'
import { DEFAULT_NETWORKS, type NetworkConfig } from '../types/network'
import { hdWalletService } from './hdWalletService'
import { WalletAccount } from '../types/hdWallet'
export type SupportedNetwork = 'mainnet' | 'sepolia'

export type WalletType = 'mnemonic' | 'privateKey'

export interface StoredState {
  keystoreJson?: string
  address?: string
  selectedNetwork?: SupportedNetwork
  walletType?: WalletType
  hdInitialized?: boolean
}

const STORAGE_KEY = STORAGE_KEYS.walletState

let runtimeWallet: Wallet | HDNodeWallet | null = null
let currentProvider: JsonRpcProvider | null = null

async function readStoredState(): Promise<StoredState> {
  try {
    const state = await storageAdapter.get<StoredState>(STORAGE_KEY)
    return state || {}
  } catch {
    return {}
  }
}

async function writeStoredState(update: Partial<StoredState>): Promise<void> {
  const current = await readStoredState()
  const next = { ...current, ...update }
  await storageAdapter.set(STORAGE_KEY, next)
}

export async function hasEncryptedKeystore(): Promise<boolean> {
  const state = await readStoredState()
  return !!state?.keystoreJson
}

export async function getWalletType(): Promise<WalletType | null> {
  const state = await readStoredState()
  return state?.walletType || null
}

export async function isMnemonicWallet(): Promise<boolean> {
  const walletType = await getWalletType()
  return walletType === 'mnemonic'
}

export async function resetStoredState() {
  try { await storageAdapter.remove(STORAGE_KEY) } catch {}
  runtimeWallet = null
}

// 개발/테스트용: 모든 저장소 데이터 초기화
export async function clearAllStorageData() {
  try {
    // 지갑/설정 데이터 삭제 (통일 어댑터 사용)
    await storageAdapter.remove(STORAGE_KEY)
    await storageAdapter.remove(STORAGE_KEYS.networks)
    await storageAdapter.remove(STORAGE_KEYS.currentNetwork)
    await storageAdapter.remove(STORAGE_KEYS.savedVCs)
    await storageAdapter.remove(STORAGE_KEYS.lastActiveTab)
    await storageAdapter.remove(STORAGE_KEYS.theme)

    // 런타임 상태 초기화
    runtimeWallet = null
    currentProvider = null

    console.log('모든 저장소 데이터가 초기화되었습니다.')
  } catch (error) {
    console.error('저장소 초기화 중 오류:', error)
  }
}

export function clearRuntimeWallet() {
  runtimeWallet = null
}

export function isUnlocked(): boolean {
  if (isDevModeEnabled()) {
    return true // Always unlocked in dev mode
  }
  return !!runtimeWallet
}

export function getAddress(): string | undefined {
  if (isDevModeEnabled()) {
    return DEV_CONFIG.wallet.address
  }
  return runtimeWallet?.address
}

export function getSelectedNetwork(): SupportedNetwork {
  if (isDevModeEnabled()) {
    return DEV_CONFIG.network
  }
  return 'mainnet' // 기본값 반환, 실제 네트워크는 networkService에서 관리
}

export function setSelectedNetwork(net: SupportedNetwork) {
  writeStoredState({ selectedNetwork: net })
  if (currentProvider) currentProvider = null
}

export function getProvider(): JsonRpcProvider {
  if (!currentProvider) {
    const net = getSelectedNetwork()
    const networks = DEFAULT_NETWORKS.filter(n => n.name.toLowerCase().includes(net))
    if (!networks.length) throw new Error(`Network ${net} not found`)
    const cfg = networks[0]
    currentProvider = new EthersJsonRpcProvider(cfg.rpcUrl, cfg.chainId)
  }
  return currentProvider
}

export async function createAndStoreWallet(password: string) {
  // Validate password
  const passwordValidation = validatePassword(password)
  if (!passwordValidation.isValid) {
    throw new Error(passwordValidation.error)
  }
  
  const wallet = Wallet.createRandom()
  const keystoreJson = await wallet.encrypt(password)
  await writeStoredState({ 
    keystoreJson, 
    address: wallet.address, 
    walletType: 'mnemonic', // 새로 생성된 지갑은 니모닉 기반
    hdInitialized: false,
  })
  runtimeWallet = wallet
  // Try initializing HD wallet immediately
  try {
    if ('mnemonic' in wallet && (wallet as any).mnemonic) {
      const mnemonic = (wallet as any).mnemonic.phrase as string
      const ok = await hdWalletService.initializeFromMnemonic(mnemonic, password)
      if (ok) {
        await writeStoredState({ hdInitialized: true })
      }
    }
  } catch (e) {
    console.warn('HD wallet init after create failed:', e)
  }
  return wallet.address
}

export async function storeWalletWithPassword(wallet: Wallet | HDNodeWallet, password: string) {
  // Validate password
  const passwordValidation = validatePassword(password)
  if (!passwordValidation.isValid) {
    throw new Error(passwordValidation.error)
  }
  
  const keystoreJson = await wallet.encrypt(password)
  const inferredType: WalletType = ('mnemonic' in wallet && (wallet as any).mnemonic) ? 'mnemonic' : 'privateKey'
  await writeStoredState({ keystoreJson, address: wallet.address, walletType: inferredType })
  runtimeWallet = wallet
  return wallet.address
}

export async function unlockWithPassword(password: string): Promise<string> {
  const state = await readStoredState()
  const { keystoreJson, walletType } = state
  if (!keystoreJson) throw new Error('Keystore not found')
  const wallet = await Wallet.fromEncryptedJson(keystoreJson, password)
  const addr = wallet.address
  runtimeWallet = wallet.connect(getProvider()) as Wallet | HDNodeWallet
  // Ensure walletType is persisted for older states
  if (!walletType) {
    const inferredType: WalletType = ('mnemonic' in wallet && (wallet as any).mnemonic) ? 'mnemonic' : 'privateKey'
    await writeStoredState({ walletType: inferredType })
  }
  
  // 니모닉 기반 지갑인 경우 HD 지갑 서비스 초기화
  const effectiveType = walletType ?? (("mnemonic" in wallet && (wallet as any).mnemonic) ? 'mnemonic' : 'privateKey')
  if (effectiveType === 'mnemonic' && 'mnemonic' in wallet && wallet.mnemonic) {
    try {
      const mnemonic = wallet.mnemonic.phrase
      const ok = await hdWalletService.initializeFromMnemonic(mnemonic, password)
      if (ok) {
        await writeStoredState({ hdInitialized: true })
      }
    } catch (error) {
      console.warn('Failed to initialize HD wallet service:', error)
    }
  }
  
  return addr
}

export function lockWallet() {
  runtimeWallet = null
}

export function getRuntimeWallet(): Wallet | HDNodeWallet | null {
  return runtimeWallet
}

export async function reencryptWithNewPassword(oldPassword: string, newPassword: string) {
  const { keystoreJson } = await readStoredState()
  if (!keystoreJson) throw new Error('Keystore not found')
  const wallet = await Wallet.fromEncryptedJson(keystoreJson, oldPassword)
  const nextJson = await wallet.encrypt(newPassword)
  await writeStoredState({ keystoreJson: nextJson, address: wallet.address })
  runtimeWallet = wallet as Wallet | HDNodeWallet
  return wallet.address
}

export async function importWalletFromMnemonic(mnemonic: string, password: string) {
  // Validate inputs
  const passwordValidation = validatePassword(password)
  if (!passwordValidation.isValid) {
    throw new Error(passwordValidation.error)
  }
  
  const mnemonicValidation = validateMnemonic(mnemonic)
  if (!mnemonicValidation.isValid) {
    throw new Error(mnemonicValidation.error)
  }
  
  // Use MetaMask-compatible BIP44 path: m/44'/60'/0'/0/0 (first account)
  // Use Mnemonic to get seed, then create HDNodeWallet from seed to specify exact path
  const mnemonicObj = Mnemonic.fromPhrase(mnemonic.trim().toLowerCase())
  const seed = mnemonicObj.computeSeed()
  const rootNode = HDNodeWallet.fromSeed(seed)
  const wallet = rootNode.derivePath("m/44'/60'/0'/0/0")
  const keystoreJson = await wallet.encrypt(password)
  await writeStoredState({ 
    keystoreJson, 
    address: wallet.address, 
    walletType: 'mnemonic',
    hdInitialized: false,
  })
  runtimeWallet = wallet
  // Initialize HD wallet from provided mnemonic
  try {
    const ok = await hdWalletService.initializeFromMnemonic(mnemonic.trim().toLowerCase(), password)
    if (ok) {
      await writeStoredState({ hdInitialized: true })
    }
  } catch (e) {
    console.warn('HD wallet init after import failed:', e)
  }
  return wallet.address
}

export async function importWalletFromPrivateKey(privateKey: string, password: string) {
  // Validate inputs
  const passwordValidation = validatePassword(password)
  if (!passwordValidation.isValid) {
    throw new Error(passwordValidation.error)
  }
  
  const privateKeyValidation = validatePrivateKey(privateKey)
  if (!privateKeyValidation.isValid) {
    throw new Error(privateKeyValidation.error)
  }
  
  const cleanKey = privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`
  const wallet = new Wallet(cleanKey)
  const keystoreJson = await wallet.encrypt(password)
  await writeStoredState({ 
    keystoreJson, 
    address: wallet.address, 
    walletType: 'privateKey' 
  })
  runtimeWallet = wallet
  return wallet.address
}

export async function initDevWallet() {
  if (!isDevModeEnabled()) return false
  
  try {
    // Validate dev config first
    const configValidation = validateWalletConfig(DEV_CONFIG.wallet)
    if (!configValidation.isValid) {
      console.error('❌ Dev config validation failed:', configValidation.error)
      throw new Error(`개발 설정 오류: ${configValidation.error}`)
    }
    
    // Create wallet from dev mnemonic or private key
    // Use MetaMask-compatible BIP44 path: m/44'/60'/0'/0/0 (first account)
    let wallet: Wallet | HDNodeWallet
    if ('mnemonic' in DEV_CONFIG.wallet) {
      // Use Mnemonic to get seed, then create HDNodeWallet from seed to specify exact path
      const mnemonicObj = Mnemonic.fromPhrase((DEV_CONFIG.wallet as {mnemonic: string}).mnemonic.trim().toLowerCase())
      const seed = mnemonicObj.computeSeed()
      const rootNode = HDNodeWallet.fromSeed(seed)
      // MetaMask uses m/44'/60'/0'/0/0 for the first account
      wallet = rootNode.derivePath("m/44'/60'/0'/0/0")
      console.log('🔧 Dev mode: Wallet created from mnemonic (MetaMask path: m/44\'/60\'/0\'/0/0)')
    } else if (DEV_CONFIG.wallet.privateKey) {
      const cleanKey = DEV_CONFIG.wallet.privateKey.startsWith('0x') 
        ? DEV_CONFIG.wallet.privateKey 
        : `0x${DEV_CONFIG.wallet.privateKey}`
      wallet = new Wallet(cleanKey)
      console.log('🔧 Dev mode: Wallet created from private key')
    } else {
      throw new Error('Dev config must contain either mnemonic or privateKey')
    }
    
    runtimeWallet = wallet.connect(getProvider())
    console.log('🔧 Dev mode: Wallet auto-initialized with address:', wallet.address)
    return true
  } catch (error) {
    console.error('Failed to initialize dev wallet:', error)
    // Reset to force manual setup
    resetStoredState()
    throw error
  }
}

// HD Wallet Integration Functions

/**
 * Initialize HD wallet from mnemonic
 */
export async function initializeHDWallet(mnemonic: string, password: string): Promise<boolean> {
  try {
    const success = await hdWalletService.initializeFromMnemonic(mnemonic, password);
    if (success) {
      // Load the first account as the active wallet
      const activeAccount = hdWalletService.getActiveAccount();
      if (activeAccount) {
        // Get private key for the active account
        const privateKey = await hdWalletService.getPrivateKeyForAccount(activeAccount.id, password);
        if (privateKey) {
          runtimeWallet = new Wallet(privateKey);
          return true;
        }
      }
    }
    return false;
  } catch (error) {
    console.error('Failed to initialize HD wallet:', error);
    return false;
  }
}

/**
 * Get current active account from HD wallet
 */
export function getActiveAccount(): WalletAccount | null {
  return hdWalletService.getActiveAccount();
}

/**
 * Get all accounts from HD wallet
 */
export function getAllAccounts(): WalletAccount[] {
  return hdWalletService.getAccounts();
}

/**
 * Switch to a different account
 */
export async function switchAccount(accountId: string, password: string): Promise<boolean> {
  try {
    const success = await hdWalletService.setActiveAccount(accountId);
    if (success) {
      // Get private key for the new active account
      const privateKey = await hdWalletService.getPrivateKeyForAccount(accountId, password);
      if (privateKey) {
        runtimeWallet = new Wallet(privateKey);
        return true;
      }
    }
    return false;
  } catch (error) {
    console.error('Failed to switch account:', error);
    return false;
  }
}

/**
 * Create new account in HD wallet
 */
export async function createNewAccount(name?: string, password?: string): Promise<WalletAccount | null> {
  try {
    // For now, we'll use a placeholder password - in real implementation,
    // this should prompt for password or use stored session
    const result = await hdWalletService.createAccount(name, password || '');
    return result.success ? result.account : null;
  } catch (error) {
    console.error('Failed to create new account:', error);
    return null;
  }
}

/**
 * Check if HD wallet is initialized
 */
export function isHDWalletInitialized(): boolean {
  return hdWalletService.isInitialized();
}

/**
 * Read minimal wallet meta information persisted in storage.
 */
export async function getWalletMeta(): Promise<{ walletType: WalletType | null; hdInitialized: boolean }>{
  const state = await readStoredState();
  return {
    walletType: state.walletType ?? null,
    hdInitialized: !!state.hdInitialized,
  };
}

/**
 * Get address from HD wallet (current active account)
 */
export function getHDWalletAddress(): string | undefined {
  const activeAccount = hdWalletService.getActiveAccount();
  return activeAccount?.address;
}

/**
 * Clear HD wallet state
 */
export async function clearHDWalletState(): Promise<void> {
  await hdWalletService.clearState();
  runtimeWallet = null;
}