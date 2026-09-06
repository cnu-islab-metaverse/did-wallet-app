// snarkjs 는 타입 선언을 제공하지 않는다. 이 앱이 쓰는 groth16 API 만 최소한으로 기술한다.
declare module 'snarkjs' {
  export namespace groth16 {
    /** witness 계산 + 증명 생성. wasm·zkey 는 파일 경로 또는 버퍼. */
    function fullProve(
      input: Record<string, unknown>,
      wasmPath: string,
      zkeyPath: string,
    ): Promise<{ proof: unknown; publicSignals: string[] }>

    function verify(vkey: unknown, publicSignals: string[], proof: unknown): Promise<boolean>

    /** "[..],[[..],[..]],[..],[..]" 형태 문자열. G2 좌표 순서 보정이 반영돼 있다. */
    function exportSolidityCallData(proof: unknown, publicSignals: string[]): Promise<string>
  }
}
