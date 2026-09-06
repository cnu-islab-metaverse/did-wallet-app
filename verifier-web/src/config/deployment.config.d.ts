// deployment.config.js(브라우저·Node 양쪽에서 쓰이는 CJS)의 타입 선언.
export interface DeploymentConfig {
  environment: string;
  contract: { zkCredentialSBT: string; verifiers: { youthPass: string; regionalUniv: string } };
  network: { chainId: number; name: string; rpcUrl: string };
}
export function getDeploymentConfig(): DeploymentConfig;
export function getContractInfo(): {
  address: string;
  functionName: string;
  functionSignature: string;
  description: string;
  verifiers: DeploymentConfig['contract']['verifiers'];
  network: DeploymentConfig['network'];
};
export const DEPLOYMENT_ENV: string;
export const PASS_TYPE: { youthPass: number; regionalUniv: number };
