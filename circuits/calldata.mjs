// [작업] 온체인 발급용 증명 calldata 생성기. vc.json 으로 witness 를 만들어 fullProve → verify →
//        exportSolidityCallData 까지 수행하고, ZKCredentialSBT.mintPass 에 그대로 넣을 인자를 뽑는다.
//        지갑(데스크톱)에 붙일 증명 모듈이 하게 될 일과 같은 절차의 CLI 판이다.
// [결과] build/<name>/calldata.json 저장 + cast send 예시 출력.
//   node calldata.mjs <name> [--passType N]     (예: node calldata.mjs youth_pass --passType 1)
import * as snarkjs from 'snarkjs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { buildWitness, sigFromVc, SCENARIO_INPUT, SCENARIO_VC } from './witness.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname;

const args = process.argv.slice(2);
const name = args.find((a) => !a.startsWith('--')) || 'youth_pass';
const ptIdx = args.indexOf('--passType');
const passType = ptIdx >= 0 ? args[ptIdx + 1] : null;

const OUT = path.join(ROOT, 'build', name);
const WASM = path.join(OUT, `${name}_js`, `${name}.wasm`);
const ZKEY = path.join(OUT, `${name}_final.zkey`);
const VKEY = path.join(OUT, 'verification_key.json');
// 시나리오별 샘플 VC. --vc 로 재지정 가능.
const vcArg = args.indexOf('--vc')
const VC_REL = vcArg >= 0 ? args[vcArg + 1] : (SCENARIO_VC[name] ?? 'vc.json')
const VC_PATH = path.join(ROOT, VC_REL);

function die(msg) {
  console.error(`[calldata] ${msg}`);
  process.exit(1);
}

// snarkjs 는 "[..],[[..],[..]],[..],[..]" 형태 문자열을 준다. G2 좌표 순서 보정이 이미 반영된 값이므로
// 손대지 말고 그대로 파싱해 쓴다.
function parseCallData(s) {
  const [pA, pB, pC, pubSignals] = JSON.parse(`[${s}]`);
  return { pA, pB, pC, pubSignals };
}

async function main() {
  if (!SCENARIO_INPUT[name]) die(`알 수 없는 시나리오: ${name} (가능: ${Object.keys(SCENARIO_INPUT).join(', ')})`);
  for (const [label, p] of [['wasm', WASM], ['zkey', ZKEY], ['vkey', VKEY], ['vc.json', VC_PATH]]) {
    if (!fs.existsSync(p)) die(`${label} 없음: ${p}${label === 'wasm' || label === 'zkey' ? `  → 먼저 'yarn build ${name}'` : ''}`);
  }

  const vc = JSON.parse(fs.readFileSync(VC_PATH, 'utf8'));
  const w = await buildWitness(vc);
  const sig = sigFromVc(vc);
  const input = SCENARIO_INPUT[name](w, sig);

  console.log(`\n[calldata] 시나리오: ${name}`);
  console.log(`[calldata] 증명 대상 지갑(A2 바인딩): ${vc.credentialSubject.walletAddress}`);

  console.log('[calldata] (1/3) 증명 생성 (groth16.fullProve)…');
  const t0 = Date.now();
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, WASM, ZKEY);
  console.log(`[calldata]       완료 (${Date.now() - t0}ms) · 공개신호: ${JSON.stringify(publicSignals)}`);

  console.log('[calldata] (2/3) 로컬 검증 (groth16.verify)…');
  const vkey = JSON.parse(fs.readFileSync(VKEY, 'utf8'));
  const ok = await snarkjs.groth16.verify(vkey, publicSignals, proof);
  console.log(`[calldata]       검증 결과: ${ok}`);
  if (ok !== true) die('로컬 검증 실패 — 온체인에서도 통과하지 못한다');

  console.log('[calldata] (3/3) solidity calldata 변환…');
  const raw = await snarkjs.groth16.exportSolidityCallData(proof, publicSignals);
  const { pA, pB, pC, pubSignals } = parseCallData(raw);

  // 공개신호 = [currentDate(YYYYMMDD), walletAddress]
  const currentDate = BigInt(pubSignals[0]).toString();
  const boundWallet = '0x' + BigInt(pubSignals[1]).toString(16).padStart(40, '0');

  const outFile = path.join(OUT, 'calldata.json');
  fs.writeFileSync(
    outFile,
    JSON.stringify({ scenario: name, currentDate, boundWallet, passType, pA, pB, pC, pubSignals }, null, 2) + '\n',
  );

  console.log(`\n[calldata] 저장: ${path.relative(ROOT, outFile)}`);
  console.log(`[calldata]   currentDate : ${currentDate}`);
  console.log(`[calldata]   boundWallet : ${boundWallet}`);
  console.log('\n[calldata] 온체인 발급 (호출자는 반드시 boundWallet 이어야 A2 검사를 통과):');
  const pt = passType ?? '<passType>';
  const a = `[${pA.join(',')}]`;
  const b = `[[${pB[0].join(',')}],[${pB[1].join(',')}]]`;
  const c = `[${pC.join(',')}]`;
  const pub = `[${pubSignals.join(',')}]`;
  console.log(
    `\ncast send <ZKCredentialSBT> \\\n` +
      `  "mintPass(uint256,uint256[2],uint256[2][2],uint256[2],uint256[2],string)" \\\n` +
      `  ${pt} "${a}" "${b}" "${c}" "${pub}" "ipfs://${name}" \\\n` +
      `  --rpc-url sepolia --private-key <boundWallet 의 키>\n`,
  );
  console.log('[calldata] 통과 ✅\n');
}

main().catch((e) => die(e?.stack || String(e)));
