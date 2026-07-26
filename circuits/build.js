#!/usr/bin/env node
/**
 * [작업] 키 생성 전용: scenarios/<name>.circom 을 컴파일하고 Groth16 키를 만든다.
 *        회로/조건을 새로 만들거나 바꿨을 때만 실행. 증명·검증은 verify.js 담당.
 *
 * KEY GENERATION only. circom compile -> Powers of Tau (phase 1, local) ->
 * groth16 setup (phase 2) + contribute -> export verification_key.json + Verifier.sol.
 *   node build.js <name> [ptauPower]      (default: agecheck, 12)
 *
 * NOTE (Groth16): phase-2 setup is per-circuit. The local phase-1 Powers of Tau is a
 * single-contributor DEMO-GRADE setup; for production drop a community ptau named
 * `pot<power>_final.ptau` into ./ptau/.
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const name = process.argv[2] || 'agecheck';
const ptauPowerArg = process.argv[3]; // 생략 시 회로 제약 수로 자동 선택

const SCEN = path.join(ROOT, 'scenarios');
const SRC = path.join(SCEN, `${name}.circom`);
const OUT = path.join(ROOT, 'build', name);
const PTAU_DIR = path.join(ROOT, 'ptau');
const SNARKJS = path.join(ROOT, 'node_modules', 'snarkjs', 'build', 'cli.cjs');

function run(cmd) { console.log(`\n$ ${cmd}`); execSync(cmd, { stdio: 'inherit', cwd: ROOT }); }
function snarkjs(args) { run(`node "${SNARKJS}" ${args}`); }

// r1cs 제약 수를 읽어 필요한 최소 ptau power 계산. 기존 pot<n>_final.ptau 중 충분한 것이
// 있으면 재사용(생성 시간 절약), 없으면 최소 power 로 새로 생성.
function r1csConstraints(r1cs) {
  const out = execSync(`node "${SNARKJS}" r1cs info "${r1cs}"`, { cwd: ROOT, encoding: 'utf8' });
  const m = out.match(/Constraints:\s*(\d+)/i);
  return m ? parseInt(m[1], 10) : 0;
}
function pickPtauPower(constraints) {
  let min = 12;
  while (2 ** min < constraints && min < 28) min++;
  const existing = fs.readdirSync(PTAU_DIR)
    .map((f) => (f.match(/^pot(\d+)_final\.ptau$/) || [])[1])
    .filter(Boolean).map(Number).filter((n) => n >= min).sort((a, b) => a - b);
  return existing.length ? existing[0] : min; // 재사용 가능한 최소 power, 없으면 최소 power
}
function scenarioDesc(p) {
  try {
    const lines = fs.readFileSync(p, 'utf8').split(/\r?\n/);
    const start = lines.findIndex((l) => l.includes('[작업]'));
    if (start < 0) return [];
    const out = [];
    for (let i = start; i < lines.length; i++) {
      const t = lines[i].trim();
      if (!t.startsWith('//')) break;
      const c = t.replace(/^\/\/\s?/, '');
      if (c === '') break;
      out.push(c);
    }
    return out;
  } catch {
    return [];
  }
}

if (!fs.existsSync(SRC)) { console.error(`회로 소스 없음: ${SRC}`); process.exit(1); }
if (!fs.existsSync(SNARKJS)) { console.error('snarkjs 미설치 — 먼저 "yarn install" 실행'); process.exit(1); }
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(PTAU_DIR, { recursive: true });

console.log(`\n[build] 대상 회로: ${name}   (scenarios/${name}.circom)`);
scenarioDesc(SRC).forEach((l) => console.log(`[build]   ${l}`));

console.log('\n=== [1/4] circom 컴파일 → r1cs + wasm ===');
run(`circom "${SRC}" --r1cs --wasm --sym -l "${path.join(ROOT, 'node_modules')}" -o "${OUT}"`);

const r1cs = path.join(OUT, `${name}.r1cs`);
const constraints = r1csConstraints(r1cs);
const ptauPower = ptauPowerArg || String(pickPtauPower(constraints));
const PTAU = path.join(PTAU_DIR, `pot${ptauPower}_final.ptau`);
console.log(`[build] 제약 ${constraints} → ptau power ${ptauPower}${ptauPowerArg ? ' (지정)' : ' (자동)'}`);

console.log('\n=== [2/4] Powers of Tau (phase1, 로컬 데모용) ===');
if (fs.existsSync(PTAU)) {
  console.log(`(기존 ${path.relative(ROOT, PTAU)} 재사용)`);
} else {
  const p0 = path.join(PTAU_DIR, `pot${ptauPower}_0000.ptau`);
  const p1 = path.join(PTAU_DIR, `pot${ptauPower}_0001.ptau`);
  snarkjs(`powersoftau new bn128 ${ptauPower} "${p0}" -v`);
  snarkjs(`powersoftau contribute "${p0}" "${p1}" --name="local-dev-1" -e="did-wallet local entropy 1" -v`);
  snarkjs(`powersoftau prepare phase2 "${p1}" "${PTAU}" -v`);
}

console.log('\n=== [3/4] groth16 setup (phase2, 회로별) + contribute ===');
const zkey0 = path.join(OUT, `${name}_0000.zkey`);
const zkeyF = path.join(OUT, `${name}_final.zkey`);
snarkjs(`groth16 setup "${r1cs}" "${PTAU}" "${zkey0}"`);
snarkjs(`zkey contribute "${zkey0}" "${zkeyF}" --name="local-dev-1" -e="did-wallet local entropy 2" -v`);

console.log('\n=== [4/4] 검증키 + Solidity verifier 내보내기 ===');
snarkjs(`zkey export verificationkey "${zkeyF}" "${path.join(OUT, 'verification_key.json')}"`);
snarkjs(`zkey export solidityverifier "${zkeyF}" "${path.join(OUT, 'Verifier.sol')}"`);

console.log(`\n✅ "${name}" 키 생성 완료 → ${path.relative(ROOT, OUT)}/`);
console.log(`   ${name}_js/${name}.wasm · ${name}_final.zkey · verification_key.json · Verifier.sol`);
console.log(`   다음: yarn verify ${name}  (증명+검증, 키 재생성 없음)`);
