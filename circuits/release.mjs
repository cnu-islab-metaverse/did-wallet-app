// [작업] 회로 산출물을 컨트랙트로 내보낸다 — Verifier.sol 복사 + 픽스처 생성.
//        한 명령이 둘을 함께 만들므로 어긋날 수 없다(드리프트의 원인은 수동 재복사 지시였다).
// [결과] contract/src/<Name>Verifier.sol · contract/test/fixtures/proofs.json
//   node release.mjs
import * as snarkjs from 'snarkjs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { buildWitness, sigFromVc, SCENARIO_INPUT, SCENARIO_VC } from './witness.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname;
const REPO = path.resolve(ROOT, '..');
const CONTRACT_SRC = path.join(REPO, 'contract', 'src');
const FIXTURE = path.join(REPO, 'contract', 'test', 'fixtures', 'proofs.json');

// 시나리오 → [컨트랙트 이름, 온체인 passType]. 배포 스크립트·테스트와 같은 값을 쓴다.
const SCENARIOS = {
  youth_pass: { contract: 'YouthPassVerifier', passType: 1 },
  regional_national_univ: { contract: 'RegionalUnivVerifier', passType: 2 },
};

function die(msg) {
  console.error(`[release] ${msg}`);
  process.exit(1);
}

/** snarkjs 가 주는 "[..],[[..],[..]],[..],[..]" 문자열. G2 좌표 순서 보정이 이미 반영돼 있다. */
function parseCallData(s) {
  const [pA, pB, pC, pubSignals] = JSON.parse(`[${s}]`);
  return { pA, pB, pC, pubSignals };
}

/**
 * 증명의 currentDate 에 해당하는 블록 타임스탬프(그날 12:00 KST = 03:00 UTC).
 * 테스트가 날짜 계산을 중복 구현하지 않도록 여기서 함께 내보낸다. 둘이 어긋나면
 * 첫 mintPass 가 "Stale currentDate" 로 실패하므로 픽스처가 자기 검증된다.
 */
function warpTsFor(ymd) {
  const y = Math.floor(ymd / 10000);
  const m = Math.floor((ymd % 10000) / 100);
  const d = ymd % 100;
  return Math.floor(Date.UTC(y, m - 1, d, 3, 0, 0) / 1000);
}

function exportVerifier(name) {
  const src = path.join(ROOT, 'build', name, 'Verifier.sol');
  if (!fs.existsSync(src)) die(`Verifier.sol 없음: ${src}  → 먼저 'yarn build ${name}'`);
  const { contract } = SCENARIOS[name];

  const body = fs
    .readFileSync(src, 'utf8')
    .replace(/contract\s+Groth16Verifier\s*\{/, `contract ${contract} {`);
  if (!body.includes(`contract ${contract} {`)) die(`${name}: 컨트랙트 이름 치환 실패`);

  const header =
    `// [자동생성] snarkjs groth16 exportsolidityverifier — circuits/scenarios/${name}.circom 산출물.\n` +
    `// 직접 수정 금지. 회로를 고쳤으면 'yarn build ${name}' 후 'node release.mjs' 를 돌린다.\n` +
    `// 공개신호=[currentDate, walletAddress].\n`;

  const dst = path.join(CONTRACT_SRC, `${contract}.sol`);
  fs.writeFileSync(dst, header + body);
  console.log(`[release] ${contract}.sol ← build/${name}/Verifier.sol`);
}

async function proveScenario(name) {
  const dir = path.join(ROOT, 'build', name);
  const wasm = path.join(dir, `${name}_js`, `${name}.wasm`);
  const zkey = path.join(dir, `${name}_final.zkey`);
  const vkey = path.join(dir, 'verification_key.json');
  const vcPath = path.join(ROOT, SCENARIO_VC[name]);
  for (const [label, p] of [['wasm', wasm], ['zkey', zkey], ['vkey', vkey], ['vc', vcPath]]) {
    if (!fs.existsSync(p)) die(`${name}: ${label} 없음 — ${p}`);
  }

  const vc = JSON.parse(fs.readFileSync(vcPath, 'utf8'));
  const w = await buildWitness(vc);
  const input = SCENARIO_INPUT[name](w, sigFromVc(vc));

  const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, wasm, zkey);
  const ok = await snarkjs.groth16.verify(JSON.parse(fs.readFileSync(vkey, 'utf8')), publicSignals, proof);
  if (!ok) die(`${name}: 생성한 증명이 로컬 검증을 통과하지 못했다`);

  const raw = await snarkjs.groth16.exportSolidityCallData(proof, publicSignals);
  const { pA, pB, pC, pubSignals } = parseCallData(raw);
  const currentDate = Number(BigInt(pubSignals[0]));

  return {
    passType: SCENARIOS[name].passType,
    sourceVc: SCENARIO_VC[name],
    holder: '0x' + BigInt(pubSignals[1]).toString(16).padStart(40, '0'),
    currentDate,
    warpTs: warpTsFor(currentDate),
    pA,
    // stdJson 이 uint[2][2] 를 만들지 못하므로 평탄화해 둔다. 테스트에서 재조립하며,
    // 그 과정에서 G2 좌표 순서가 눈에 보이는 것도 장점이다.
    pBFlat: [pB[0][0], pB[0][1], pB[1][0], pB[1][1]],
    pC,
    pubSignals,
  };
}

async function main() {
  fs.mkdirSync(path.dirname(FIXTURE), { recursive: true });

  for (const name of Object.keys(SCENARIOS)) exportVerifier(name);

  const out = {
    note:
      'circuits/release.mjs 자동 생성. 직접 수정하지 말 것. ' +
      'Groth16 증명은 생성할 때마다 바이트가 달라지므로 diff 가 항상 발생한다.',
    scenarios: {},
  };

  for (const name of Object.keys(SCENARIOS)) {
    process.stdout.write(`[release] ${name} 증명 생성… `);
    const t0 = Date.now();
    out.scenarios[name] = await proveScenario(name);
    console.log(`${Date.now() - t0}ms · holder=${out.scenarios[name].holder} · date=${out.scenarios[name].currentDate}`);
  }

  // 수정 전 회로에서 자격증명 없이 만들어진 위조 증명. 재생성할 수 없으므로
  // 기존 픽스처에 있으면 그대로 보존한다. 새 검증자가 이걸 거부하는지 테스트한다.
  if (fs.existsSync(FIXTURE)) {
    const prev = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
    if (prev.forgedYouthPass) {
      out.forgedYouthPass = prev.forgedYouthPass;
      console.log('[release] forgedYouthPass 보존(재생성 불가 — 수정 전 회로 산출물)');
    }
  }

  fs.writeFileSync(FIXTURE, JSON.stringify(out, null, 2) + '\n');
  console.log(`[release] 픽스처 → ${path.relative(REPO, FIXTURE)}`);
}

// snarkjs 가 워커를 붙들고 있어 스스로 종료하지 않는다. 작업이 끝나면 명시적으로 빠져나간다.
main()
  .then(() => process.exit(0))
  .catch((e) => die(e?.stack || String(e)));
