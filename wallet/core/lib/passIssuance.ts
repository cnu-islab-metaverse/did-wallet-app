// [작업] 자격증명(VC) → ZK 증명 → 온체인 SBT 발급까지의 렌더러측 오케스트레이션.
//        증명 생성 자체는 메인 프로세스(zkProve IPC)가 하고, 여기서는 VC 선택·시나리오 판정·
//        서명자 준비·mintPass 트랜잭션 전송을 맡는다.
// [결과] issuePass(vc) → { txHash, tokenId?, boundWallet, passType } (언락 상태에서만)
//
// 발급이 성립하려면 세 가지가 맞아야 한다(컨트랙트가 검사한다):
//   1) 증명이 회로 검증을 통과      2) 호출자 == 증명에 묶인 지갑(A2)   3) 증명의 날짜가 오늘(KST)
import { ethers } from 'ethers'
import { hdWalletService } from './hdWalletService'
import { getContractInfo, getDeploymentConfig, PASS_TYPE } from '../config/deployment.config'

export type Scenario = 'youth_pass' | 'regional_national_univ'

export interface ProofCalldata {
  scenario: Scenario
  currentDate: string
  boundWallet: string
  pA: string[]
  pB: string[][]
  pC: string[]
  pubSignals: string[]
}

/** 시나리오 ↔ 온체인 패스 타입. deployment.config 의 PASS_TYPE 과 짝을 이룬다. */
export const SCENARIO_PASS_TYPE: Record<Scenario, number> = {
  youth_pass: PASS_TYPE.youthPass,
  regional_national_univ: PASS_TYPE.regionalUniv,
}

export const SCENARIO_LABEL: Record<Scenario, string> = {
  youth_pass: '지역청년패스',
  regional_national_univ: '지방거점국립대 소속',
}

const MINT_ABI = [
  'function mintPass(uint256 passType, uint256[2] pA, uint256[2][2] pB, uint256[2] pC, uint256[2] pubSignals, string tokenURI) external',
  'function tokenOf(address holder, uint256 passType) view returns (uint256)',
  'function hasValidPass(address holder, uint256 passType) view returns (bool)',
]

function bridge(): any {
  const w = globalThis as any
  return w?.ipcRenderer ?? null
}

/** 데스크톱(메인 프로세스 증명)에서만 발급이 가능하다. 확장은 데스크톱에 위임한다. */
export function canIssue(): boolean {
  return typeof bridge()?.zkProve === 'function'
}

/** 해당 시나리오의 회로 산출물(wasm/zkey)이 준비돼 있는지. UI 버튼 활성화 판단용. */
export async function circuitReady(scenario: Scenario): Promise<boolean> {
  const b = bridge()
  if (typeof b?.zkReady !== 'function') return false
  try {
    return await b.zkReady(scenario)
  } catch {
    return false
  }
}

/**
 * VC 의 클레임을 보고 어떤 시나리오로 증명할 수 있는지 판정한다.
 * 회로가 요구하는 클레임이 VC 에 있어야 한다(부분 신용증명이라 VC 마다 다르다).
 */
export function scenariosForVc(vc: any): Scenario[] {
  const s = vc?.credentialSubject ?? {}
  const out: Scenario[] = []
  if (s.residentialAddress != null && s.birthDate != null) out.push('youth_pass')
  if (s.university != null && vc?.validUntil != null) out.push('regional_national_univ')
  return out
}

/** 메인 프로세스에 증명을 요청한다. 수 초 걸린다(zkey 36MB). */
export async function proveVc(scenario: Scenario, vc: any): Promise<ProofCalldata> {
  const b = bridge()
  if (typeof b?.zkProve !== 'function') throw new Error('이 플랫폼에서는 증명을 생성할 수 없습니다(데스크톱 전용)')
  return b.zkProve(scenario, vc)
}

export interface IssueResult {
  txHash: string
  passType: number
  boundWallet: string
  scenario: Scenario
  tokenId?: string
}

/**
 * 증명 생성 → mintPass 전송. 언락된 활성 계정으로 서명한다.
 * 증명은 활성 계정 주소에 묶이므로, 증명 후 계정을 바꾸면 A2 검사에서 거부된다.
 */
export async function issuePass(
  vc: any,
  opts: {
    scenario?: Scenario
    tokenURI?: string
    onStage?: (s: string) => void
    /** 검증자가 지정한 제출 대상. 없으면 지갑 설정의 기본 컨트랙트로 간다(개발 편의). */
    target?: { contract: string; passType: number }
  } = {},
): Promise<IssueResult> {
  const { onStage } = opts
  const scenario = opts.scenario ?? scenariosForVc(vc)[0]
  if (!scenario) throw new Error('이 증명서로는 발급 가능한 패스가 없습니다')

  const account = hdWalletService.getActiveAccount()
  if (!account) throw new Error('활성 계정이 없습니다')

  // 제출 대상은 요청이 정한다. 지갑이 주소를 들고 있는 게 아니다.
  const info = getContractInfo()
  const contractAddress = opts.target?.contract ?? info.address
  if (!contractAddress) throw new Error('제출 대상 컨트랙트가 없습니다 — 플랫폼에서 발급 요청을 받아오세요')

  // 증명은 VC 의 walletAddress 가 아니라 "지금 이 지갑" 에 묶여야 한다.
  const vcForProof = {
    ...vc,
    credentialSubject: { ...(vc.credentialSubject ?? {}), walletAddress: account.address },
  }

  onStage?.('증명 생성 중')
  const proof = await proveVc(scenario, vcForProof)

  if (proof.boundWallet.toLowerCase() !== account.address.toLowerCase()) {
    throw new Error(`증명이 다른 지갑에 묶였습니다(${proof.boundWallet}). 계정을 확인하세요.`)
  }

  onStage?.('지갑 서명 준비 중')
  // 언락된 지갑의 활성 계정 서명자. 잠겨 있으면 null 이다.
  const base = hdWalletService.getSigner(account.id)
  if (!base) throw new Error('지갑이 잠겨 있습니다')

  const net = getDeploymentConfig().network
  const provider = new ethers.JsonRpcProvider(net.rpcUrl, net.chainId)
  const signer = base.connect(provider)
  const contract = new ethers.Contract(contractAddress, MINT_ABI, signer)
  const passType = opts.target?.passType ?? SCENARIO_PASS_TYPE[scenario]

  onStage?.('온체인 발급 요청 중')
  const tx = await contract.mintPass(
    passType,
    proof.pA,
    proof.pB,
    proof.pC,
    proof.pubSignals,
    opts.tokenURI ?? `did-wallet:${scenario}`,
  )
  onStage?.('트랜잭션 확인 대기 중')
  await tx.wait()

  let tokenId: string | undefined
  try {
    tokenId = (await contract.tokenOf(account.address, passType)).toString()
  } catch {
    /* 조회 실패는 발급 성공 여부와 무관 */
  }

  return { txHash: tx.hash, passType, boundWallet: proof.boundWallet, scenario, tokenId }
}

export interface OnChainPass {
  passType: number
  scenario: Scenario
  label: string
  tokenId: string
  valid: boolean
  expiresAt: number
  tokenURI: string
  contract: string
}

const READ_ABI = [
  'function tokenOf(address holder, uint256 passType) view returns (uint256)',
  'function isValid(uint256 tokenId) view returns (bool)',
  'function expiresAt(uint256 tokenId) view returns (uint64)',
  'function tokenURI(uint256 tokenId) view returns (string)',
]

/**
 * 이 지갑이 실제로 보유한 패스를 온체인에서 읽는다. 목데이터가 아니라 체인 상태다.
 * 등록된 패스 타입만 순회하므로 호출 수는 타입 수에 비례한다(현재 2종).
 */
export async function fetchOnChainPasses(address: string): Promise<OnChainPass[]> {
  const info = getContractInfo()
  if (!info.address || !address) return []
  const net = getDeploymentConfig().network
  const provider = new ethers.JsonRpcProvider(net.rpcUrl, net.chainId)
  const c = new ethers.Contract(info.address, READ_ABI, provider)

  const out: OnChainPass[] = []
  for (const scenario of Object.keys(SCENARIO_PASS_TYPE) as Scenario[]) {
    const passType = SCENARIO_PASS_TYPE[scenario]
    try {
      const tokenId = await c.tokenOf(address, passType)
      if (tokenId === 0n) continue
      const [valid, exp, uri] = await Promise.all([c.isValid(tokenId), c.expiresAt(tokenId), c.tokenURI(tokenId)])
      out.push({
        passType,
        scenario,
        label: SCENARIO_LABEL[scenario],
        tokenId: tokenId.toString(),
        valid: Boolean(valid),
        expiresAt: Number(exp),
        tokenURI: uri,
        contract: info.address,
      })
    } catch {
      /* 개별 타입 조회 실패는 건너뛴다(RPC 일시 오류 등) */
    }
  }
  return out
}
