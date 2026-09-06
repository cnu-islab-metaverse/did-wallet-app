// [작업] 발급기관 서명 — 샘플 VC 의 클레임을 SMT 로 구성해 root 를 만들고, 테스트 발급기관
//        개인키로 EdDSA 서명해 그 결과를 VC 에 되기록한다. **개인키가 필요한 유일한 단계.**
//        VC 마다 담는 클레임이 다르므로(주민등록증=거주, 졸업증명서=학적) 각각 root 가 다르다.
// [결과] 각 VC 의 issuer.publicKey · proof.merkleRoot · proof.signature 를 채운다.
//        (발급자 공개키는 scenarios/_registry.circom 의 issuerAx/Ay 와 일치해야 함.)
//   node sign.mjs              모든 샘플 VC 서명
//   node sign.mjs vc/resident.json   특정 파일만
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { buildWitness, signVc, SCENARIO_VC, regionCodeFromAddress } from './witness.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** 인자가 없으면 시나리오가 쓰는 샘플 VC 전부. */
function targets() {
  const arg = process.argv[2];
  if (arg) return [arg];
  return [...new Set(Object.values(SCENARIO_VC))];
}

// VC 가 실제로 담은 클레임만 한 줄로 요약한다(부분 신용증명이라 VC 마다 다르다).
function summarize(vc) {
  const s = vc.credentialSubject ?? {};
  const parts = [s.name];
  if (s.birthDate) parts.push(`생년월일 ${s.birthDate.slice(0, 10)}`);
  if (s.residentialAddress) parts.push(`거주 시도코드 ${regionCodeFromAddress(s.residentialAddress)}`);
  if (s.university) parts.push(s.university);
  parts.push(vc.validUntil ? `validUntil ${vc.validUntil.slice(0, 10)}` : '무기한');
  return parts.filter(Boolean).join(' · ');
}

async function main() {
  let pub = null;
  for (const rel of targets()) {
    const file = path.join(__dirname, rel);
    if (!fs.existsSync(file)) {
      console.error(`[sign] 파일 없음: ${rel}`);
      process.exitCode = 1;
      continue;
    }
    const vc = JSON.parse(fs.readFileSync(file, 'utf8'));

    // 클레임 검증(학교코드 등)은 buildWitness 안에서 한다 — 거기가 부분 신용증명을 올바로 다룬다.
    const w = await buildWitness(vc);
    const sig = signVc(w);

    vc.issuer.publicKey = { Ax: sig.Ax.toString(), Ay: sig.Ay.toString() };
    vc.proof.merkleRoot = w.root.toString();
    vc.proof.signature = { R8x: sig.R8x.toString(), R8y: sig.R8y.toString(), S: sig.S.toString() };
    fs.writeFileSync(file, JSON.stringify(vc, null, 2) + '\n');

    pub = sig;
    console.log(`[sign] ${rel.padEnd(18)} ${vc.issuer.name} — ${summarize(vc)}`);
  }

  if (pub) {
    console.log('[sign] 발급기관 공개키 (_registry.circom 의 issuerAx/Ay 와 일치해야 함):');
    console.log(`  Ax = ${pub.Ax}`);
    console.log(`  Ay = ${pub.Ay}`);
  }
}

main().catch((e) => {
  console.error('[sign]', e?.message || e);
  process.exit(1);
});
