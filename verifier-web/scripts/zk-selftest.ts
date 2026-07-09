/**
 * Local headless ZK self-test (no browser / no extension).
 *
 * Reproduces the reference flow from the archived `zk-vc-extention` sandbox:
 *   groth16.fullProve(input, circuit.wasm, circuit_final.zkey)
 *     -> groth16.verify(verification_key.json, publicSignals, proof)
 *     -> exportSolidityCallData(proof, publicSignals)   // for the on-chain verifier
 *
 * Circuit artifacts are the shared ones under `verifier-web/circuit/`
 * (byte-identical to the reference). Run with: `pnpm zk:selftest`.
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
    console.error(`[zk-selftest] missing required file: ${p}`);
    process.exit(1);
  }
}

async function main() {
  [WASM, ZKEY, VKEY, INPUT].forEach(requireFile);

  const input = JSON.parse(fs.readFileSync(INPUT, 'utf8'));
  const vkey = JSON.parse(fs.readFileSync(VKEY, 'utf8'));

  console.log('[zk-selftest] generating proof (groth16.fullProve)…');
  const t0 = Date.now();
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, WASM, ZKEY);
  console.log(`[zk-selftest] proof generated in ${Date.now() - t0} ms`);
  console.log('[zk-selftest] publicSignals:', publicSignals);

  console.log('[zk-selftest] verifying (groth16.verify)…');
  const ok = await snarkjs.groth16.verify(vkey, publicSignals, proof);
  console.log('[zk-selftest] verify result:', ok);

  const calldata = await snarkjs.groth16.exportSolidityCallData(proof, publicSignals);
  console.log('[zk-selftest] solidity calldata (for DaejeonYouthVerifier.sol):');
  console.log(calldata);

  if (ok !== true) {
    console.error('[zk-selftest] FAILED — proof did not verify');
    process.exit(1);
  }
  console.log('[zk-selftest] PASSED ✅');
  process.exit(0);
}

main().catch((e) => {
  console.error('[zk-selftest] ERROR:', e);
  process.exit(1);
});
