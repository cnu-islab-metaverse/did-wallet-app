import { Asset } from '../types/asset';
import { NetworkConfig, DEFAULT_NETWORKS } from '../types/network';
import { networkService } from './networkService';

class AssetService {
  private assets: Asset[] = [];

  constructor() {
    this.initializeNativeAssets();
  }

  // 모든 기본 네트워크의 네이티브 자산을 초기화
  private initializeNativeAssets() {
    const allNetworks = [...DEFAULT_NETWORKS, ...networkService.getCustomNetworks()];
    
    this.assets = allNetworks.map(network => ({
      symbol: network.symbol,
      name: this.getNativeCoinName(network.symbol),
      balance: '0.0000',
      chainId: network.chainId,
      isNative: true,
    }));
  }

  private getNativeCoinName(symbol: string): string {
    const coinNames: Record<string, string> = {
      'ETH': 'Ethereum',
      'MATIC': 'Polygon',
      'BNB': 'BNB Smart Chain',
      'AVAX': 'Avalanche',
      'FTM': 'Fantom',
      'ONE': 'Harmony',
      'MOVR': 'Moonriver',
      'CRO': 'Cronos',
    };
    return coinNames[symbol] || symbol;
  }

  // 현재 선택된 네트워크의 네이티브 자산을 맨 위로
  getAssetsForDisplay(): Asset[] {
    const currentNetwork = networkService.getCurrentNetwork();
    if (!currentNetwork) return this.assets;

    const currentNativeAsset = this.assets.find(
      asset => asset.chainId === currentNetwork.chainId && asset.isNative
    );

    const otherAssets = this.assets.filter(
      asset => !(asset.chainId === currentNetwork.chainId && asset.isNative)
    );

    // 네이티브 자산들을 체인ID 순으로 정렬
    const sortedOtherAssets = otherAssets.sort((a, b) => {
      if (a.isNative && b.isNative) {
        return a.chainId - b.chainId;
      }
      return a.isNative ? -1 : 1;
    });

    return currentNativeAsset 
      ? [currentNativeAsset, ...sortedOtherAssets]
      : sortedOtherAssets;
  }

  // 자산 추가 (향후 ERC-20 토큰 등)
  addAsset(asset: Asset) {
    const existingIndex = this.assets.findIndex(
      a => a.symbol === asset.symbol && a.chainId === asset.chainId
    );
    
    if (existingIndex >= 0) {
      this.assets[existingIndex] = asset;
    } else {
      this.assets.push(asset);
    }
  }

  // 자산 잔액 업데이트 (향후 구현)
  updateAssetBalance(symbol: string, chainId: number, balance: string) {
    const asset = this.assets.find(
      a => a.symbol === symbol && a.chainId === a.chainId
    );
    if (asset) {
      asset.balance = balance;
    }
  }

  // 네트워크가 추가될 때 호출
  onNetworkAdded(network: NetworkConfig) {
    const existingAsset = this.assets.find(
      asset => asset.chainId === network.chainId && asset.isNative
    );

    if (!existingAsset) {
      this.addAsset({
        symbol: network.symbol,
        name: this.getNativeCoinName(network.symbol),
        balance: '0.0000',
        chainId: network.chainId,
        isNative: true,
      });
    }
  }
}

export const assetService = new AssetService();
