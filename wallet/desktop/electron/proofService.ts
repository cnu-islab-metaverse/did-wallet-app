// [작업] 메인 프로세스 ZK 증명 생성기. VC → witness → groth16 → mintPass calldata.
//        메인에서 도는 이유: zkey 가 회로당 36MB 라 번들 불가이고, 수 초짜리 CPU 작업이라
//        UI 스레드를 막으면 안 된다.
// [결과] generateProof(scenario, vc) → { pA, pB, pC, pubSignals, currentDate, boundWallet }
import path from 'node:path'
import fs from 'node:fs'
import { app } from 'electron'
import * as snarkjs from 'snarkjs'
// ⚠️ circuits/witness.mjs 의 동기화 사본. scripts/sync-zk-assets.mjs 가 복사한다(predev/prebuild).
import { buildWitness, sigFromVc, SCENARIO_INPUT } from './zk/witness.mjs'

export type Scenario = 'youth_pass' | 'regional_national_univ'

export interface ProofCalldata {
  scenario: Scenario
  /** YYYYMMDD. 컨트랙트가 block.timestamp(KST)와 대조한다. */
  currentDate: string
  /** 이 증명이 묶인 지갑. mintPass 호출자가 이 주소여야 A2 검사를 통과한다. */
  boundWallet: string
  pA: string[]
  pB: string[][]
  pC: string[]
  pubSignals: string[]
}

/**
 * 회로 산출물 위치. 36MB zkey 는 asar 에 넣지 않고 디스크에서 읽는다.
 *  - 개발: 저장소의 circuits/build
 *  - 배포: resources/circuits/build (electron-builder extraResources)
 */
function circuitsBuildDir(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'circuits', 'build')
    : path.join(app.getAppPath(), '..', '..', 'circuits', 'build')
}

export function circuitAssets(scenario: Scenario) {
  const dir = path.join(circuitsBuildDir(), scenario)
  return {
    dir,
    wasm: path.join(dir, `${scenario}_js`, `${scenario}.wasm`),
    zkey: path.join(dir, `${scenario}_final.zkey`),
    vkey: path.join(dir, 'verification_key.json'),
  }
}

/** 증명에 필요한 파일이 모두 있는지. UI 가 버튼을 활성화할지 판단하는 데 쓴다. */
export function circuitReady(scenario: Scenario): boolean {
  const a = circuitAssets(scenario)
  return fs.existsSync(a.wasm) && fs.existsSync(a.zkey) && fs.existsSync(a.vkey)
}

// snarkjs 는 "[..],[[..],[..]],[..],[..]" 문자열을 준다. G2 좌표 순서 보정이 이미 반영돼 있으므로
// 손대지 말고 그대로 파싱한다.
function parseCallData(s: string) {
  const [pA, pB, pC, pubSignals] = JSON.parse(`[${s}]`)
  return { pA, pB, pC, pubSignals } as Pick<ProofCalldata, 'pA' | 'pB' | 'pC' | 'pubSignals'>
}

export async function generateProof(scenario: Scenario, vc: any): Promise<ProofCalldata> {
  if (!SCENARIO_INPUT[scenario]) throw new Error(`알 수 없는 시나리오: ${scenario}`)
  const a = circuitAssets(scenario)
  for (const [label, p] of [['wasm', a.wasm], ['zkey', a.zkey], ['vkey', a.vkey]] as const) {
    if (!fs.existsSync(p)) throw new Error(`회로 산출물 없음(${label}): ${p}\n먼저 'cd circuits && yarn build ${scenario}'`)
  }

  // VC 클레임 → SMT witness. 발급기관 서명은 VC 안의 것을 그대로 쓴다(개인키 불필요).
  const w = await buildWitness(vc)
  const sig = sigFromVc(vc)
  const input = SCENARIO_INPUT[scenario](w, sig)

  const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, a.wasm, a.zkey)

  // 온체인에 보내기 전에 로컬 검증 — 여기서 실패하면 온체인에서도 실패한다(가스 낭비 방지).
  const vkey = JSON.parse(fs.readFileSync(a.vkey, 'utf8'))
  const ok = await snarkjs.groth16.verify(vkey, publicSignals, proof)
  if (!ok) throw new Error('생성한 증명이 로컬 검증을 통과하지 못했습니다')

  const raw = await snarkjs.groth16.exportSolidityCallData(proof, publicSignals)
  const { pA, pB, pC, pubSignals } = parseCallData(raw)

  // 공개신호 = [currentDate(YYYYMMDD), walletAddress]
  const currentDate = BigInt(pubSignals[0]).toString()
  const boundWallet = '0x' + BigInt(pubSignals[1]).toString(16).padStart(40, '0')

  return { scenario, currentDate, boundWallet, pA, pB, pC, pubSignals }
}
