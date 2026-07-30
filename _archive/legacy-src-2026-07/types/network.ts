export interface NetworkConfig {
  chainId: number;
  name: string;
  rpcUrl: string;
  symbol: string;
  explorerUrl?: string;
  isCustom?: boolean;
}

export interface NetworkValidationResult {
  isValid: boolean;
  chainId?: number;
  error?: string;
}

export const DEFAULT_NETWORKS: NetworkConfig[] = [
  {
    chainId: 1,
    name: 'Ethereum Mainnet',
    rpcUrl: 'https://cloudflare-eth.com',
    symbol: 'ETH',
    explorerUrl: 'https://etherscan.io',
    isCustom: false,
  },
  {
    chainId: 11155111,
    name: 'Sepolia Testnet',
    rpcUrl: 'https://1rpc.io/sepolia',
    symbol: 'ETH',
    explorerUrl: 'https://sepolia.etherscan.io',
    isCustom: false,
  },
  {
    chainId: 137,
    name: 'Polygon Mainnet',
    rpcUrl: 'https://polygon-rpc.com',
    symbol: 'MATIC',
    explorerUrl: 'https://polygonscan.com',
    isCustom: false,
  },
  {
    chainId: 56,
    name: 'BSC Mainnet',
    rpcUrl: 'https://bsc-dataseed.binance.org',
    symbol: 'BNB',
    explorerUrl: 'https://bscscan.com',
    isCustom: false,
  },
];
