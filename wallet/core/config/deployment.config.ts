// [작업] 온체인 배포 정보 — ZKCredentialSBT(범용 ZK 자격증명 발급자) 주소와 패스 타입 목록.
//        시나리오가 늘어도 SBT 주소는 그대로이고 passType 만 추가된다.
// [결과] getContractInfo() → 지갑이 mintPass 를 호출할 때 쓰는 주소·시그니처·네트워크.

export type DeploymentEnvironment = 'anvil' | 'sepolia';

export interface DeploymentConfig {
  environment: DeploymentEnvironment;
  contract: {
    /** 범용 발급자. 모든 시나리오가 이 한 주소를 쓴다. */
    zkCredentialSBT: string;
    /** 회로 산출 검증자 — passType 별로 컨트랙트에 등록돼 있다(참고용). */
    verifiers: { youthPass: string; regionalUniv: string };
  };
  network: { chainId: number; name: string; rpcUrl: string };
}

/** 패스 타입 ID — contract/script/DeployZKCredentialSBT.s.sol 및 테스트와 같은 값. */
export const PASS_TYPE = {
  /** 지역청년패스: 대전 거주 + 만 19~34세. 유효기간 365일. */
  youthPass: 1,
  /** 지방거점국립대 재학/졸업. 무기한. */
  regionalUniv: 2,
} as const;

export type PassType = (typeof PASS_TYPE)[keyof typeof PASS_TYPE];

export const DEPLOYMENT_ENV: DeploymentEnvironment = 'sepolia';

const DEPLOYMENT_CONFIGS: Record<DeploymentEnvironment, DeploymentConfig> = {
  anvil: {
    environment: 'anvil',
    contract: {
      // 로컬 anvil 은 배포할 때마다 달라진다. forge script 출력값으로 갱신할 것.
      zkCredentialSBT: '',
      verifiers: { youthPass: '', regionalUniv: '' },
    },
    network: { chainId: 31337, name: 'Anvil Local', rpcUrl: 'http://localhost:8545' },
  },
  sepolia: {
    environment: 'sepolia',
    // 2026-09-05 배포. 소유자 0xdDb968E5D31fD578115096f1e2BE33Bdb7F348B2
    contract: {
      zkCredentialSBT: '0xF66B3b93b5FeC7f8Bd169dcd3589bf45c673E021',
      verifiers: {
        youthPass: '0x2cEfc1eb31A6b75A4c40b4c8111Ef6998304ee59',
        regionalUniv: '0xA0ad136FABd87e00DadaE2cE82f92fa9d97533c8',
      },
    },
    network: {
      chainId: 11155111,
      name: 'Sepolia Testnet',
      rpcUrl: 'https://ethereum-sepolia-rpc.publicnode.com',
    },
  },
};

export const getDeploymentConfig = (): DeploymentConfig => DEPLOYMENT_CONFIGS[DEPLOYMENT_ENV];

export const getContractInfo = () => {
  const config = getDeploymentConfig();
  return {
    address: config.contract.zkCredentialSBT,
    functionName: 'mintPass',
    // 공개신호는 [currentDate(YYYYMMDD), walletAddress] 2개. 호출자는 반드시 walletAddress 여야 한다(A2 바인딩).
    functionSignature:
      'mintPass(uint256,uint256[2],uint256[2][2],uint256[2],uint256[2],string)',
    description: '영지식 증명 검증 후 소울바운드 자격증명 SBT 발급',
    verifiers: config.contract.verifiers,
    network: config.network,
  };
};
