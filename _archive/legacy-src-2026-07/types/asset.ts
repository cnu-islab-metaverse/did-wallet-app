export interface Asset {
  symbol: string;
  name: string;
  balance: string;
  chainId: number;
  isNative: boolean;
  contractAddress?: string;
}

export interface AssetBalance {
  symbol: string;
  balance: string;
  formattedBalance: string;
}
