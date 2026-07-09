#!/usr/bin/env node
/**
 * KEY GENERATION only (run when the circuit / condition changes).
 * Local Groth16 setup: circom compile -> Powers of Tau (phase 1, local) ->
 * groth16 setup (phase 2) + contribute -> export verification_key.json + Verifier.sol.
 *
 *   node build.js <circuitName> [ptauPower]      (default: agecheck, 12)
 *
 * Does NOT prove/verify — use `node verify.js <name>` for that (no key regen).
 *
 * NOTE (Groth16): phase-2 setup is per-circuit — re-run for each new circuit. The
 * phase-1 Powers of Tau is generated locally with a single contributor = DEMO-GRADE.
 * For production, drop a community ptau (e.g. powersOfTau28_hez_final_XX.ptau) named
 * `pot<power>_final.ptau` into ./ptau/ and it will be reused instead of generated.
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const name = process.argv[2] || 'agecheck';
const ptauPower = process.argv[3] || '12';

const SRC = path.join(ROOT, `${name}.circom`);
const OUT = path.join(ROOT, 'build', name);
const PTAU_DIR = path.join(ROOT, 'ptau');
const PTAU = path.join(PTAU_DIR, `pot${ptauPower}_final.ptau`);
const SNARKJS = path.join(ROOT, 'node_modules', 'snarkjs', 'build', 'cli.cjs');

function run(cmd) { console.log(`\n$ ${cmd}`); execSync(cmd, { stdio: 'inherit', cwd: ROOT }); }
function snarkjs(args) { run(`node "${SNARKJS}" ${args}`); }

if (!fs.existsSync(SRC)) { console.error(`circuit source not found: ${SRC}`); process.exit(1); }
if (!fs.existsSync(SNARKJS)) { console.error('snarkjs not installed — run "yarn install" first'); process.exit(1); }
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(PTAU_DIR, { recursive: true });

console.log('\n=== [1/4] compile circom -> r1cs + wasm ===');
run(`circom "${SRC}" --r1cs --wasm --sym -l "${path.join(ROOT, 'node_modules')}" -o "${OUT}"`);

console.log('\n=== [2/4] Powers of Tau (phase 1, local demo-grade) ===');
if (fs.existsSync(PTAU)) {
  console.log(`(reusing existing ${path.relative(ROOT, PTAU)})`);
} else {
  const p0 = path.join(PTAU_DIR, `pot${ptauPower}_0000.ptau`);
  const p1 = path.join(PTAU_DIR, `pot${ptauPower}_0001.ptau`);
  snarkjs(`powersoftau new bn128 ${ptauPower} "${p0}" -v`);
  snarkjs(`powersoftau contribute "${p0}" "${p1}" --name="local-dev-1" -e="did-wallet local entropy 1" -v`);
  snarkjs(`powersoftau prepare phase2 "${p1}" "${PTAU}" -v`);
}

console.log('\n=== [3/4] groth16 setup (phase 2, per-circuit) + contribute ===');
const r1cs = path.join(OUT, `${name}.r1cs`);
const zkey0 = path.join(OUT, `${name}_0000.zkey`);
const zkeyF = path.join(OUT, `${name}_final.zkey`);
snarkjs(`groth16 setup "${r1cs}" "${PTAU}" "${zkey0}"`);
snarkjs(`zkey contribute "${zkey0}" "${zkeyF}" --name="local-dev-1" -e="did-wallet local entropy 2" -v`);

console.log('\n=== [4/4] export verification key + Solidity verifier ===');
snarkjs(`zkey export verificationkey "${zkeyF}" "${path.join(OUT, 'verification_key.json')}"`);
snarkjs(`zkey export solidityverifier "${zkeyF}" "${path.join(OUT, 'Verifier.sol')}"`);

console.log(`\n✅ keys generated for "${name}" -> ${path.relative(ROOT, OUT)}/`);
console.log(`   ${name}_js/${name}.wasm · ${name}_final.zkey · verification_key.json · Verifier.sol`);
console.log(`   next: node verify.js ${name}   (prove + verify, no key regen)`);
