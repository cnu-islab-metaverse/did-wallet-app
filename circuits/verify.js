#!/usr/bin/env node
/**
 * VERIFICATION only against an already-built circuit (does NOT regenerate keys).
 * Proves `<name>.input.json` with the existing build, then verifies.
 *
 *   node verify.js <circuitName>      (default: agecheck)
 *
 * Run `node build.js <name>` first if the keys don't exist yet.
 */
const snarkjs = require('snarkjs');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const name = process.argv[2] || 'agecheck';
const OUT = path.join(ROOT, 'build', name);
const WASM = path.join(OUT, `${name}_js`, `${name}.wasm`);
const ZKEY = path.join(OUT, `${name}_final.zkey`);
const VKEY = path.join(OUT, 'verification_key.json');
const INPUT = path.join(ROOT, `${name}.input.json`);

async function main() {
  for (const [label, p] of [['circuit wasm', WASM], ['proving key (zkey)', ZKEY], ['verification key', VKEY]]) {
    if (!fs.existsSync(p)) {
      console.error(`[verify] missing ${label}: ${p}`);
      console.error(`[verify] run "node build.js ${name}" first (key generation).`);
      process.exit(1);
    }
  }
  if (!fs.existsSync(INPUT)) { console.error(`[verify] missing input: ${INPUT}`); process.exit(1); }

  const input = JSON.parse(fs.readFileSync(INPUT, 'utf8'));
  const vkey = JSON.parse(fs.readFileSync(VKEY, 'utf8'));

  console.log(`[verify] proving "${name}" with existing keys…`);
  const t0 = Date.now();
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, WASM, ZKEY);
  console.log(`[verify] proof generated in ${Date.now() - t0} ms`);
  console.log('[verify] publicSignals:', publicSignals);

  const ok = await snarkjs.groth16.verify(vkey, publicSignals, proof);
  console.log('[verify] verify result:', ok);
  console.log('[verify] solidity calldata:', await snarkjs.groth16.exportSolidityCallData(proof, publicSignals));

  if (ok !== true) { console.error('[verify] FAILED'); process.exit(1); }
  console.log('[verify] PASSED ✅');
  process.exit(0);
}

main().catch((e) => { console.error('[verify] ERROR:', e); process.exit(1); });
