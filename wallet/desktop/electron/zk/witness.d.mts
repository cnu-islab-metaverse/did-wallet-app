// circuits/witness.mjs(동기화 사본)의 타입 선언. 원본은 JS 라 타입이 없으므로 여기서 최소한만 기술한다.
// 원본이 바뀌어 시그니처가 달라지면 여기도 맞춰야 한다.

/** VC 클레임을 SMT 로 구성해 회로 witness 재료를 만든다(발급기관 개인키 불필요). */
export function buildWitness(vc: any): Promise<any>

/** VC 에 저장된 발급기관 EdDSA 서명을 회로 입력 형태로 꺼낸다. */
export function sigFromVc(vc: any): any

/** 시나리오별 회로 입력 빌더. 키가 곧 회로 이름이다. */
export const SCENARIO_INPUT: Record<string, (w: any, sig: any) => any>

export const CLAIM_KEY: Record<string, number>
export const UNIV_CODE: Record<string, number>
export function todayYmd(): number
export function toYmd(dateStr: string): number
