import { isAddress, Wallet, HDNodeWallet, Mnemonic } from 'ethers'

export interface ValidationResult {
  isValid: boolean
  error?: string
}

/**
 * Validate password strength
 */
export function validatePassword(password: string): ValidationResult {
  if (!password) {
    return { isValid: false, error: '비밀번호를 입력하세요.' }
  }
  
  if (password.length < 8) {
    return { isValid: false, error: '비밀번호는 최소 8글자 이상이어야 합니다.' }
  }
  
  return { isValid: true }
}

/**
 * Validate Ethereum address
 */
export function validateAddress(address: string): ValidationResult {
  if (!address) {
    return { isValid: false, error: '주소를 입력하세요.' }
  }
  
  if (!isAddress(address)) {
    return { isValid: false, error: '올바르지 않은 이더리움 주소입니다.' }
  }
  
  return { isValid: true }
}

/**
 * Validate private key and optionally check if it matches expected address
 */
export function validatePrivateKey(privateKey: string, expectedAddress?: string): ValidationResult {
  if (!privateKey) {
    return { isValid: false, error: '개인키를 입력하세요.' }
  }
  
  try {
    // Remove 0x prefix if present for validation
    const cleanKey = privateKey.startsWith('0x') ? privateKey.slice(2) : privateKey
    
    // Check if it's a valid hex string of correct length (64 characters)
    if (!/^[0-9a-fA-F]{64}$/.test(cleanKey)) {
      return { isValid: false, error: '개인키는 64자리 16진수여야 합니다.' }
    }
    
    // Create wallet from private key to validate
    const wallet = new Wallet(privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`)
    
    // If expected address is provided, verify it matches
    if (expectedAddress && wallet.address.toLowerCase() !== expectedAddress.toLowerCase()) {
      return { isValid: false, error: '개인키와 주소가 일치하지 않습니다.' }
    }
    
    return { isValid: true }
  } catch (error) {
    return { isValid: false, error: '올바르지 않은 개인키 형식입니다.' }
  }
}

/**
 * Validate mnemonic phrase and optionally check if it matches expected address
 */
export function validateMnemonic(mnemonic: string, expectedAddress?: string): ValidationResult {
  if (!mnemonic) {
    return { isValid: false, error: '니모닉을 입력하세요.' }
  }
  
  try {
    const cleanMnemonic = mnemonic.trim().toLowerCase()
    const words = cleanMnemonic.split(/\s+/)
    
    // Check word count (typically 12, 15, 18, 21, or 24 words)
    if (![12, 15, 18, 21, 24].includes(words.length)) {
      return { isValid: false, error: '니모닉은 12, 15, 18, 21, 또는 24개의 단어여야 합니다.' }
    }
    
    // Create wallet from mnemonic to validate
    // Use Mnemonic to get seed, then create HDNodeWallet from seed to specify exact path
    const mnemonicObj = Mnemonic.fromPhrase(cleanMnemonic)
    const seed = mnemonicObj.computeSeed()
    const rootNode = HDNodeWallet.fromSeed(seed)
    
    if (expectedAddress) {
      // Try accounts 0-9 to find matching address using MetaMask path m/44'/60'/0'/0/{index}
      let found = false
      for (let i = 0; i < 10; i++) {
        const wallet = rootNode.derivePath(`m/44'/60'/0'/0/${i}`)
        if (wallet.address.toLowerCase() === expectedAddress.toLowerCase()) {
          found = true
          break
        }
      }
      
      if (!found) {
        return { isValid: false, error: '니모닉에서 유도된 주소(0~9번 계정)와 입력된 주소가 일치하지 않습니다.' }
      }
    }
    // If no expected address, just validate the mnemonic format
    // (the mnemonic is valid if Mnemonic.fromPhrase succeeds)
    
    return { isValid: true }
  } catch (error: any) {
    // Provide more detailed error message for debugging
    const errorMsg = error?.message || String(error)
    console.error('Mnemonic validation error:', errorMsg)
    return { isValid: false, error: `올바르지 않은 니모닉 구문입니다. (${errorMsg})` }
  }
}

/**
 * Validate wallet configuration (for dev config validation)
 */
export function validateWalletConfig(config: {
  password: string
  mnemonic?: string
  privateKey?: string
  address: string
}): ValidationResult {
  // Validate password
  const passwordResult = validatePassword(config.password)
  if (!passwordResult.isValid) {
    return { isValid: false, error: `비밀번호 오류: ${passwordResult.error}` }
  }
  
  // Validate address
  const addressResult = validateAddress(config.address)
  if (!addressResult.isValid) {
    return { isValid: false, error: `주소 오류: ${addressResult.error}` }
  }
  
  // At least one of mnemonic or privateKey must be provided
  if (!config.mnemonic && !config.privateKey) {
    return { isValid: false, error: '니모닉 또는 개인키 중 하나는 반드시 입력해야 합니다.' }
  }
  
  // If private key is provided, validate it against address
  if (config.privateKey) {
    const privateKeyResult = validatePrivateKey(config.privateKey, config.address)
    if (!privateKeyResult.isValid) {
      return { isValid: false, error: `개인키 오류: ${privateKeyResult.error}` }
    }
  }
  
  // If mnemonic is provided, validate it against address
  if (config.mnemonic) {
    const mnemonicResult = validateMnemonic(config.mnemonic, config.address)
    if (!mnemonicResult.isValid) {
      return { isValid: false, error: `니모닉 오류: ${mnemonicResult.error}` }
    }
  }
  
  // If both mnemonic and privateKey are provided, ensure they match
  // Try up to 10 accounts (m/44'/60'/0'/0/0 to m/44'/60'/0'/0/9) to find matching private key
  if (config.mnemonic && config.privateKey) {
    try {
      const cleanMnemonic = config.mnemonic.trim().toLowerCase()
      const mnemonic = Mnemonic.fromPhrase(cleanMnemonic)
      const seed = mnemonic.computeSeed()
      const rootNode = HDNodeWallet.fromSeed(seed)
      const cleanPrivateKey = config.privateKey.startsWith('0x') ? config.privateKey : `0x${config.privateKey}`
      
      // Try accounts 0-9 to find matching private key using MetaMask path
      let found = false
      for (let i = 0; i < 10; i++) {
        const walletFromMnemonic = rootNode.derivePath(`m/44'/60'/0'/0/${i}`)
        if (walletFromMnemonic.privateKey.toLowerCase() === cleanPrivateKey.toLowerCase()) {
          found = true
          break
        }
      }
      
      if (!found) {
        return { isValid: false, error: '니모닉에서 유도된 개인키(0~9번 계정)와 입력된 개인키가 일치하지 않습니다.' }
      }
    } catch (error: any) {
      const errorMsg = error?.message || String(error)
      return { isValid: false, error: `니모닉과 개인키 일치 여부를 확인할 수 없습니다. (${errorMsg})` }
    }
  }
  
  return { isValid: true }
}