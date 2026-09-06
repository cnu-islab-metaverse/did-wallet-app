export type DeploymentEnvironment = 'anvil' | 'sepolia';

export interface DeploymentConfig {
  environment: DeploymentEnvironment;
  contract: {
    cityYouthPassSBT: string;
    daejeonYouthVerifier: string;
  };
  network: {
    chainId: number;
    name: string;
    rpcUrl: string;
  };
}

export const DEPLOYMENT_ENV: DeploymentEnvironment = 'sepolia';

const DEPLOYMENT_CONFIGS: Record<DeploymentEnvironment, DeploymentConfig> = {
  anvil: {
    environment: 'anvil',
    contract: {
      cityYouthPassSBT: '0x0d2aa97CbBC38DBE72529169A931C5f6A10d62BE',
      daejeonYouthVerifier: '0x205868EB1c45633d3263e9C7178594c4879C5be9',
    },
    network: {
      chainId: 31337,
      name: 'Anvil Local',
      rpcUrl: 'http://localhost:8545',
    },
  },
  sepolia: {
    environment: 'sepolia',
    contract: {
      cityYouthPassSBT: '0x9dCa1C3d54548E86ACc9341c6CA9bc0748B93539',
      daejeonYouthVerifier: '0xfBE1FF5E1AF3082d5d5f0BBc4454bEfa92229d70',
    },
    network: {
      chainId: 11155111,
      name: 'Sepolia Testnet',
      rpcUrl: 'https://rpc.ankr.com/eth_sepolia',
    },
  },
};

export const getDeploymentConfig = (): DeploymentConfig => {
  return DEPLOYMENT_CONFIGS[DEPLOYMENT_ENV];
};

export const getContractInfo = () => {
  const config = getDeploymentConfig();
  return {
    address: config.contract.cityYouthPassSBT,
    functionName: 'mintSBT',
    functionSignature: 'mintSBT(uint256[2],uint256[2][2],uint256[2],uint256[5],string)',
    description: 'Zero-Knowledge Proof verification and City Youth Pass SBT minting',
    verifierAddress: config.contract.daejeonYouthVerifier,
    network: config.network,
  };
};

