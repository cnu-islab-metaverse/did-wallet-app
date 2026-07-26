/**
 * [작업] 참조 회로 로컬 셀프테스트: 브라우저/확장 없이 증명 생성→검증→calldata 출력.
 * [결과] "검증 결과: true" + "통과 ✅" 면 ZK 흐름 정상.
 *
 * Local headless ZK self-test (no browser / no extension). Reproduces the archived
 * `zk-vc-extention` flow: groth16.fullProve -> verify -> exportSolidityCallData, against
 * the shared circuit under `verifier-web/circuit/`. Run with: `yarn zk:selftest`.
 */
import * as snarkjs from 'snarkjs';
import * as fs from 'fs';
import * as path from 'path';

const CIRCUIT_DIR = path.join(__dirname, '..', 'circuit');
const WASM = path.join(CIRCUIT_DIR, 'circuit.wasm');
const ZKEY = path.join(CIRCUIT_DIR, 'circuit_final.zkey');
const VKEY = path.join(CIRCUIT_DIR, 'verification_key.json');
const INPUT = path.join(__dirname, 'zk-input.sample.json');

function requireFile(p: string) {
  if (!fs.existsSync(p)) {
    console.error(`[zk-selftest] 필수 파일 없음: ${p}`);
    process.exit(1);
  }
}

async function main() {
  [WASM, ZKEY, VKEY, INPUT].forEach(requireFile);

  const input = JSON.parse(fs.readFileSync(INPUT, 'utf8'));
  const vkey = JSON.parse(fs.readFileSync(VKEY, 'utf8'));

  console.log('[zk-selftest] 증명 생성 중 (groth16.fullProve)…');
  const t0 = Date.now();
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, WASM, ZKEY);
  console.log(`[zk-selftest] 증명 생성 완료 (${Date.now() - t0}ms)`);
  console.log('[zk-selftest] 공개신호:', publicSignals);

  console.log('[zk-selftest] 검증 중 (groth16.verify)…');
  const ok = await snarkjs.groth16.verify(vkey, publicSignals, proof);
  console.log('[zk-selftest] 검증 결과:', ok);

  console.log('[zk-selftest] Solidity calldata (DaejeonYouthVerifier.sol용):');
  console.log(await snarkjs.groth16.exportSolidityCallData(proof, publicSignals));

  if (ok !== true) {
    console.error('[zk-selftest] 실패 — 증명 검증 안 됨');
    process.exit(1);
  }
  console.log('[zk-selftest] 통과 ✅');
  process.exit(0);
}

main().catch((e) => {
  console.error('[zk-selftest] 오류:', e);
  process.exit(1);
});
