// circomlibjs 는 타입 선언을 제공하지 않으므로 최소 모듈 선언(런타임은 CJS 빌드 사용).
declare module 'circomlibjs' {
  export function buildPoseidon(): Promise<any>
  export function buildEddsa(): Promise<any>
  export function newMemEmptyTrie(): Promise<any>
}
