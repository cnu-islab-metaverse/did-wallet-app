/**
 * 배포 환경 설정
 * Anvil 로컬 또는 Sepolia 테스트넷 중 선택
 * 
 * 이 파일은 src/config/deployment.config.ts의 설정과 동기화되어야 합니다.
 */

// 배포 환경 선택: 'anvil' 또는 'sepolia'
const DEPLOYMENT_ENV = 'sepolia';

// 배포 환경별 설정
const DEPLOYMENT_CONFIGS = {
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
      cityYouthPassSBT: '0x9dCa1C3d54548E86ACc9341c6CA9bc0748B93539', // Sepolia 배포 주소 (v3 - 대전 로고 적용)
      daejeonYouthVerifier: '0xfBE1FF5E1AF3082d5d5f0BBc4454bEfa92229d70', // Sepolia 배포 주소 (v3)
    },
    network: {
      chainId: 11155111,
      name: 'Sepolia Testnet',
      rpcUrl: 'https://rpc.ankr.com/eth_sepolia',
    },
  },
};

// 현재 선택된 배포 환경 설정 가져오기
function getDeploymentConfig() {
  return DEPLOYMENT_CONFIGS[DEPLOYMENT_ENV];
}

// 컨트랙트 정보를 verifier-web 형식으로 변환
function getContractInfo() {
  const config = getDeploymentConfig();
  return {
    address: config.contract.cityYouthPassSBT,
    functionName: 'mintSBT',
    functionSignature: 'mintSBT(uint256[2],uint256[2][2],uint256[2],uint256[5],string)',
    description: 'Zero-Knowledge Proof 검증 및 지역청년패스 SBT 발급',
    verifierAddress: config.contract.daejeonYouthVerifier,
    network: config.network,
  };
}

// 브라우저 환경에서 사용 가능하도록 export
if (typeof window !== 'undefined') {
  window.DEPLOYMENT_CONFIG = {
    getDeploymentConfig,
    getContractInfo,
    DEPLOYMENT_ENV,
  };
}

// Node.js 환경에서도 사용 가능하도록 export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    getDeploymentConfig,
    getContractInfo,
    DEPLOYMENT_ENV,
  };
}

