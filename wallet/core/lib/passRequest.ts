// [작업] 플랫폼이 준 발급 요청을 검사한다. 요청은 웹사이트가 준 데이터일 뿐이므로 믿지 않고
//        컨트랙트에 직접 물어, 사이트의 주장이 아니라 체인이 말하는 것을 보여준다.
// [결과] fetchPassRequest(입력) → { request, onChain, known, warnings }
import { ethers } from 'ethers'
import { getDeploymentConfig, PASS_TYPE } from '../config/deployment.config'
import type { Scenario } from './passIssuance'

export interface PassIssuanceRequest {
  v: 1
  type: 'pass-issuance-request'
  id: string
  origin: { name: string; url: string }
  purpose: string
  scenario: Scenario
  chainId: number
  contract: string
  passType: number
  tokenURI: string
  expiresAt: number
}

/** 컨트랙트에 직접 물어 확인한 사실. 요청이 주장한 값과 다를 수 있다. */
export interface OnChainPassType {
  verifier: string
  validitySeconds: number
  retired: boolean
  tokenName: string
  tokenSymbol: string
}

export interface CheckedPassRequest {
  request: PassIssuanceRequest
  onChain: OnChainPassType
  /** 이 앱이 아는 컨트랙트인가(deployment.config 에 등록된 주소) */
  known: boolean
  /** 사용자에게 보여줄 경고. 비어 있지 않으면 눈에 띄게 표시한다. */
  warnings: string[]
}

const REGISTRY_ABI = [
  'function passTypes(uint256) view returns (address verifier, uint64 validitySeconds, bool retired)',
  'function name() view returns (string)',
  'function symbol() view returns (string)',
]

const SCENARIO_PASS_TYPE: Record<Scenario, number> = {
  youth_pass: PASS_TYPE.youthPass,
  regional_national_univ: PASS_TYPE.regionalUniv,
}

/** 문자열이 요청 스키마를 만족하는지. 모르는 버전·형식은 여기서 거른다. */
function parseRequest(raw: unknown): PassIssuanceRequest {
  const r = raw as any
  if (!r || typeof r !== 'object') throw new Error('요청 형식이 아닙니다')
  if (r.type !== 'pass-issuance-request') throw new Error('패스 발급 요청이 아닙니다')
  if (r.v !== 1) throw new Error(`지원하지 않는 요청 버전입니다 (v${r.v})`)
  for (const k of ['id', 'purpose', 'scenario', 'contract', 'tokenURI'] as const) {
    if (typeof r[k] !== 'string' || !r[k]) throw new Error(`요청에 ${k} 가 없습니다`)
  }
  if (!ethers.isAddress(r.contract)) throw new Error('컨트랙트 주소 형식이 잘못됐습니다')
  if (typeof r.passType !== 'number' || typeof r.chainId !== 'number') throw new Error('passType/chainId 가 잘못됐습니다')
  if (!(r.scenario in SCENARIO_PASS_TYPE)) throw new Error(`알 수 없는 시나리오: ${r.scenario}`)
  return r as PassIssuanceRequest
}

/**
 * 입력은 요청 URL 이거나 요청 JSON 원문이다.
 * (확장 연동이 붙으면 같은 파서에 객체를 그대로 넘긴다.)
 */
export async function fetchPassRequest(input: string | object): Promise<CheckedPassRequest> {
  let raw: unknown
  if (typeof input === 'object') {
    raw = input
  } else {
    const s = input.trim()
    if (!s) throw new Error('요청 URL 또는 JSON 을 입력하세요')
    if (s.startsWith('{')) {
      try {
        raw = JSON.parse(s)
      } catch {
        throw new Error('JSON 을 해석할 수 없습니다')
      }
    } else {
      let url: URL
      try {
        url = new URL(s)
      } catch {
        throw new Error('URL 형식이 아닙니다')
      }
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error('http(s) URL 만 지원합니다')
      const res = await fetch(url.toString())
      if (!res.ok) throw new Error(`요청을 가져오지 못했습니다 (HTTP ${res.status})`)
      raw = await res.json()
    }
  }

  const request = parseRequest(raw)
  const warnings: string[] = []

  if (request.expiresAt && request.expiresAt * 1000 < Date.now()) {
    throw new Error('만료된 요청입니다. 플랫폼에서 다시 받아오세요.')
  }

  const cfg = getDeploymentConfig()
  if (request.chainId !== cfg.network.chainId) {
    throw new Error(`다른 네트워크의 요청입니다 (요청 chainId ${request.chainId}, 지갑 ${cfg.network.chainId})`)
  }

  // 요청이 주장한 시나리오와 passType 이 서로 맞는지 — 어긋나면 엉뚱한 패스를 발급받게 된다.
  if (SCENARIO_PASS_TYPE[request.scenario] !== request.passType) {
    warnings.push(
      `요청의 시나리오(${request.scenario})와 passType(${request.passType})이 이 지갑이 아는 조합과 다릅니다.`,
    )
  }

  const known = request.contract.toLowerCase() === cfg.contract.zkCredentialSBT.toLowerCase()
  if (!known) warnings.push('이 지갑에 등록되지 않은 컨트랙트입니다. 주소를 확인하세요.')

  // ── 체인에 직접 물어본다 ──────────────────────────────────────────────
  const provider = new ethers.JsonRpcProvider(cfg.network.rpcUrl, cfg.network.chainId)
  const c = new ethers.Contract(request.contract, REGISTRY_ABI, provider)

  let onChain: OnChainPassType
  try {
    const [t, tokenName, tokenSymbol] = await Promise.all([
      c.passTypes(request.passType),
      c.name(),
      c.symbol(),
    ])
    onChain = {
      verifier: t.verifier,
      validitySeconds: Number(t.validitySeconds),
      retired: Boolean(t.retired),
      tokenName,
      tokenSymbol,
    }
  } catch {
    throw new Error('컨트랙트를 읽을 수 없습니다. 주소가 올바른지, 네트워크가 맞는지 확인하세요.')
  }

  if (onChain.verifier === ethers.ZeroAddress) {
    throw new Error(`이 컨트랙트에는 passType ${request.passType} 이 등록돼 있지 않습니다.`)
  }
  if (onChain.retired) {
    throw new Error(`이 패스 타입은 폐지되어 더 이상 발급되지 않습니다 (passType ${request.passType}).`)
  }

  // 알려진 컨트랙트라면 검증자까지 대조한다.
  if (known) {
    const expected = request.scenario === 'youth_pass' ? cfg.contract.verifiers.youthPass : cfg.contract.verifiers.regionalUniv
    if (expected && onChain.verifier.toLowerCase() !== expected.toLowerCase()) {
      warnings.push('등록된 검증자가 이 지갑이 아는 주소와 다릅니다.')
    }
  }

  return { request, onChain, known, warnings }
}

/** 유효기간 표시용. 0 이면 무기한. */
export function formatValidity(seconds: number): string {
  if (!seconds) return '무기한'
  const days = Math.round(seconds / 86400)
  return `${days}일`
}
