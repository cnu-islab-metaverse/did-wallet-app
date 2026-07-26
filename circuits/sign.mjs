// [작업] 발급기관 서명 단계 — 고정 샘플 vc.json 의 클레임을 SMT 로 구성해 root 를 만들고,
//        테스트 발급기관 개인키로 EdDSA 서명해 그 결과(발급자 공개키·merkleRoot·signature)를
//        vc.json 에 되기록한다. VC/클레임을 바꿨을 때만 실행. (개인키가 필요한 유일한 단계)
// [결과] vc.json 의 issuer.publicKey·proof.merkleRoot·proof.signature 채움.
//        (발급자 공개키는 registry.circom 의 issuerAx/Ay 와 일치해야 함.)
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { buildWitness, signVc, REGIONAL_UNIVS, regionCodeFromAddress } from './witness.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VC_PATH = path.join(__dirname, 'vc.json');

async function main() {
  const vc = JSON.parse(fs.readFileSync(VC_PATH, 'utf8'));
  const subj = vc.credentialSubject;
  if (!REGIONAL_UNIVS.includes(subj.university)) {
    throw new Error(`지방거점국립대 목록에 없는 대학: ${subj.university}`);
  }

  const w = await buildWitness(vc);
  const sig = signVc(w);

  vc.issuer.publicKey = { Ax: sig.Ax.toString(), Ay: sig.Ay.toString() };
  vc.proof.merkleRoot = w.root.toString();
  vc.proof.signature = { R8x: sig.R8x.toString(), R8y: sig.R8y.toString(), S: sig.S.toString() };
  fs.writeFileSync(VC_PATH, JSON.stringify(vc, null, 2));

  const birthYmd = subj.birthDate.slice(0, 10);
  console.log(`[sign] 샘플 VC: ${subj.name} · ${subj.university} · 생년월일 ${birthYmd} · 거주 시도코드 ${regionCodeFromAddress(subj.residentialAddress)} · validUntil ${vc.validUntil.slice(0, 10)}`);
  console.log('[sign] 발급기관 공개키 (registry.circom 와 일치해야 함):');
  console.log(`  Ax = ${sig.Ax}`);
  console.log(`  Ay = ${sig.Ay}`);
  console.log('[sign] → vc.json 서명 채움 (issuer.publicKey · proof.merkleRoot · proof.signature)');
}

main().catch((e) => { console.error('[sign] 오류:', e); process.exit(1); });
