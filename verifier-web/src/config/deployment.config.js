/**
 * 온체인 배포 정보 — ZKCredentialSBT(범용 ZK 자격증명 발급자).
 * wallet/core/config/deployment.config.ts 와 값이 일치해야 한다.
 *
 * 시나리오가 늘어도 SBT 주소는 그대로이고 passType 만 추가된다.
 */

// 배포 환경 선택: 'anvil' 또는 'sepolia'
const DEPLOYMENT_ENV = 'sepolia';

// 패스 타입 ID — contract/script/DeployZKCredentialSBT.s.sol 및 테스트와 같은 값.
const PASS_TYPE = {
  youthPass: 1, // 지역청년패스 (대전 거주 + 만 19~34세). 유효기간 365일
  regionalUniv: 2, // 지방거점국립대 재학/졸업. 무기한
};

const DEPLOYMENT_CONFIGS = {
  anvil: {
    environment: 'anvil',
    contract: {
      // 로컬 anvil 은 배포할 때마다 달라진다. forge script 출력값으로 갱신할 것.
      zkCredentialSBT: '',
      verifiers: { youthPass: '', regionalUniv: '' },
    },
    network: {
      chainId: 31337,
      name: 'Anvil Local',
      rpcUrl: 'http://localhost:8545',
    },
  },
  sepolia: {
    environment: 'sepolia',
    // 2026-09-06 배포(v3 — 발급기관별 키 분리). 소유자 0xdDb968E5D31fD578115096f1e2BE33Bdb7F348B2
    contract: {
      zkCredentialSBT: '0x3729988Ae1Fa37702DB5f7CD06a5836cb113ac31',
      verifiers: {
        youthPass: '0x8Ae87F8BCdaF4191891e596c5bb43C8c4d5Fdba9',
        regionalUniv: '0x4Bdeb1F0b97d976cD9Dced7a51127f132A479553',
      },
    },
    network: {
      chainId: 11155111,
      name: 'Sepolia Testnet',
      rpcUrl: 'https://ethereum-sepolia-rpc.publicnode.com',
    },
  },
};

function getDeploymentConfig() {
  return DEPLOYMENT_CONFIGS[DEPLOYMENT_ENV];
}

// 컨트랙트 정보를 verifier-web 형식으로 변환
function getContractInfo() {
  const config = getDeploymentConfig();
  return {
    address: config.contract.zkCredentialSBT,
    functionName: 'mintPass',
    // 공개신호는 [currentDate(YYYYMMDD), walletAddress] 2개.
    // 호출자는 반드시 walletAddress 여야 한다(A2 바인딩) — 도난 증명의 타계정 재사용 차단.
    functionSignature:
      'mintPass(uint256,uint256[2],uint256[2][2],uint256[2],uint256[2],string)',
    description: '영지식 증명 검증 후 소울바운드 자격증명 SBT 발급',
    verifiers: config.contract.verifiers,
    network: config.network,
  };
}

// 브라우저 환경에서 사용 가능하도록 export
if (typeof window !== 'undefined') {
  window.DEPLOYMENT_CONFIG = {
    getDeploymentConfig,
    getContractInfo,
    DEPLOYMENT_ENV,
    PASS_TYPE,
  };
}

// Node.js 환경에서도 사용 가능하도록 export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    getDeploymentConfig,
    getContractInfo,
    DEPLOYMENT_ENV,
    PASS_TYPE,
  };
}
