// [작업] 패스 발급 요청 — 플랫폼이 "무엇을 증명해 어디에 제출하라"를 지갑에 알린다.
//        지갑이 컨트랙트 주소를 들고 있는 게 아니라 요청이 대상을 지정한다.
// [결과] createPassRequest(scenario) → 지갑이 가져가는 JSON. 지갑은 이를 온체인으로 다시 확인한다.
import { randomUUID } from 'crypto';
import { getDeploymentConfig, PASS_TYPE } from '../config/deployment.config';

export type Scenario = 'youth_pass' | 'regional_national_univ';

export interface PassIssuanceRequest {
  /** 포맷 버전. 지갑이 모르는 버전이면 거부한다. */
  v: 1;
  type: 'pass-issuance-request';
  /** 요청 식별자(재사용 추적용) */
  id: string;
  /** 요청 주체 — 지갑이 사용자에게 그대로 보여준다 */
  origin: { name: string; url: string };
  /** 왜 필요한지. 승인 화면에 표시된다 */
  purpose: string;
  scenario: Scenario;
  /** 제출 대상 — 지갑은 이 값을 온체인으로 검증한 뒤 쓴다 */
  chainId: number;
  contract: string;
  passType: number;
  /** 발급될 토큰의 메타데이터 URI */
  tokenURI: string;
  /** unix seconds. 지난 요청은 지갑이 거부한다 */
  expiresAt: number;
}

const SCENARIOS: Record<Scenario, { passType: number; purpose: string; label: string }> = {
  youth_pass: {
    passType: PASS_TYPE.youthPass,
    label: '지역청년패스',
    purpose: '대전 청년 전용 공간에 입장하려면 지역청년패스가 필요합니다.',
  },
  regional_national_univ: {
    passType: PASS_TYPE.regionalUniv,
    label: '지방거점국립대 소속',
    purpose: '대학 협력 공간에 입장하려면 지방거점국립대 소속 증명이 필요합니다.',
  },
};

export function isScenario(v: unknown): v is Scenario {
  return typeof v === 'string' && v in SCENARIOS;
}

export function scenarioLabel(s: Scenario): string {
  return SCENARIOS[s].label;
}

/** 유효기간 10분. 시연 중 화면에 띄워두는 시간을 감안한 값. */
const TTL_SECONDS = 600;

export function createPassRequest(scenario: Scenario, baseUrl: string): PassIssuanceRequest {
  const cfg = getDeploymentConfig();
  const s = SCENARIOS[scenario];
  return {
    v: 1,
    type: 'pass-issuance-request',
    id: randomUUID(),
    origin: { name: '대전청년몰 (데모 검증자)', url: baseUrl },
    purpose: s.purpose,
    scenario,
    chainId: cfg.network.chainId,
    contract: cfg.contract.zkCredentialSBT,
    passType: s.passType,
    tokenURI: `did-wallet:${scenario}`,
    expiresAt: Math.floor(Date.now() / 1000) + TTL_SECONDS,
  };
}
