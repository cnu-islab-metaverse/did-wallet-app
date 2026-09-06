// [작업] 검증 전용: 공통 vc.json 에서 회로 witness 를 메모리로 만들어 scenarios/<name>.circom 의
//        기존 키로 증명(fullProve)하고 검증(verify)한다. 별도 입력 파일도, 키 재생성도 없다.
// [결과] "검증 결과: true" + "통과 ✅" 면 정상.
//   node verify.mjs <name>      (예: age_over_25 · regional_national_univ)
import * as snarkjs from 'snarkjs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { buildWitness, sigFromVc, SCENARIO_INPUT, SCENARIO_VC } from './witness.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname;
const name = process.argv[2] || 'age_over_25';
const OUT = path.join(ROOT, 'build', name);
const WASM = path.join(OUT, `${name}_js`, `${name}.wasm`);
const ZKEY = path.join(OUT, `${name}_final.zkey`);
const VKEY = path.join(OUT, 'verification_key.json');
const SRC = path.join(ROOT, 'scenarios', `${name}.circom`);
// 시나리오마다 필요한 클레임이 다르므로 각각의 샘플 VC 를 쓴다. --vc 로 재지정 가능.
const vcArg = process.argv.indexOf('--vc');
const VC_REL = vcArg >= 0 ? process.argv[vcArg + 1] : (SCENARIO_VC[name] ?? 'vc.json');
const VC_PATH = path.join(ROOT, VC_REL);

// scenarios/<name>.circom 헤더의 "// [작업] …" 설명 줄들을 뽑아온다.
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

async function main() {
  console.log(`\n[verify] 대상 회로: ${name}   (scenarios/${name}.circom)`);
  scenarioDesc(SRC).forEach((l) => console.log(`[verify]   ${l}`));
  console.log('[verify] 입력: vc.json (메모리에서 witness 생성 — 별도 입력 파일 없음)');

  const buildInput = SCENARIO_INPUT[name];
  if (!buildInput) { console.error(`[verify] 알 수 없는 시나리오: ${name} (${Object.keys(SCENARIO_INPUT).join(', ')})`); process.exit(1); }
  for (const [label, p] of [['회로 wasm', WASM], ['증명키(zkey)', ZKEY], ['검증키', VKEY]]) {
    if (!fs.existsSync(p)) {
      console.error(`[verify] ${label} 없음: ${p}`);
      console.error(`[verify] 먼저 "yarn build ${name}" 실행 (키 생성).`);
      process.exit(1);
    }
  }
  if (!fs.existsSync(VC_PATH)) { console.error(`[verify] vc.json 없음: ${VC_PATH}`); process.exit(1); }

  const vc = JSON.parse(fs.readFileSync(VC_PATH, 'utf8'));
  const w = await buildWitness(vc);          // vc 클레임 → SMT witness (root 재구성)
  const sig = sigFromVc(vc);                 // vc 에 저장된 발급기관 서명 (개인키 불필요)
  const input = buildInput(w, sig);
  const vkey = JSON.parse(fs.readFileSync(VKEY, 'utf8'));

  console.log('\n[verify] (1/2) 증명 생성 중 (groth16.fullProve)…');
  const t0 = Date.now();
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, WASM, ZKEY);
  console.log(`[verify]       완료 (${Date.now() - t0}ms) · 공개신호: ${JSON.stringify(publicSignals)}`);

  console.log('[verify] (2/2) 검증 중 (groth16.verify)…');
  const ok = await snarkjs.groth16.verify(vkey, publicSignals, proof);
  console.log(`[verify]       검증 결과: ${ok}`);

  if (ok !== true) { console.error('\n[verify] 실패 — 검증 안 됨'); process.exit(1); }
  console.log('\n[verify] 통과 ✅\n');
  process.exit(0);
}

main().catch((e) => { console.error('[verify] 오류:', e); process.exit(1); });
