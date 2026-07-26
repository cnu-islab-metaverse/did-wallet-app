// [작업] 공통 vc.json → 회로 witness. vc 의 클레임(name·age·alumniOf)을 SMT 로 구성하고,
//        각 시나리오 회로가 먹는 입력 객체를 만든다. 서명 단계(sign.mjs)와 검증 단계
//        (verify.mjs)가 같은 SMT 구성을 공유하므로 root 가 일치한다.
// [결과] buildWitness(vc) → { root, inclusions, ... }; ageOver25Input / regionalInput 로 입력 생성.
import { buildEddsa, buildPoseidon, newMemEmptyTrie } from 'circomlibjs';

const LEVELS = 64;

// 대학명 → 공식 학교코드. 교육부/대학알리미 학교개황(2024-10-07 기준) 학교코드(본교).
// VC 엔 대학명만 두고, 여기서 코드로 변환해 SMT alumniOf 값으로 넣는다(중복 저장 없음).
// _registry.circom 의 regionalUnivCodes() 와 값·순서가 일치해야 한다.
export const UNIV_CODE = {
  강원대학교: 3, 경북대학교: 5, 경상국립대학교: 7, 부산대학교: 14, 전남대학교: 23,
  전북대학교: 25, 제주대학교: 27, 충남대학교: 29, 충북대학교: 30,
};
export const REGIONAL_UNIVS = Object.keys(UNIV_CODE);

// 데모용 고정 테스트 발급기관 개인키(서명 단계에서만 사용). 여기서 공개키가 파생된다.
export const ISSUER_PRV = Buffer.from(
  '0001020304050607080900010203040506070809000102030405060708090001',
  'hex',
);

export function ageFromBirthDate(birthDate) {
  const b = new Date(birthDate);
  const now = new Date();
  let age = now.getFullYear() - b.getFullYear();
  const m = now.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age -= 1;
  return age;
}

// vc 의 클레임을 SMT 로 구성하고 포함증명 witness 를 뽑는다. 결정적 → 매번 같은 root.
export async function buildWitness(vc) {
  const poseidon = await buildPoseidon();
  const eddsa = await buildEddsa();
  const tree = await newMemEmptyTrie();
  const F = tree.F;

  const subj = vc.credentialSubject;
  const age = ageFromBirthDate(subj.birthDate);
  const univCode = UNIV_CODE[subj.university];
  if (univCode === undefined) throw new Error(`학교코드 없음(대학 목록 밖): ${subj.university}`);
  // alumniOf 는 공식 학교코드(정수)로 SMT 에 넣는다. name 은 poseidon(문자열), age 는 정수.
  const claims = { name: subj.name, age, alumniOf: univCode };

  const keys = {};
  let idx = 0n;
  for (const k of Object.keys(claims)) keys[k] = idx++;
  const toField = (v) => (typeof v === 'string' ? F.e(poseidon([Buffer.from(v, 'utf8')])) : F.e(v));
  for (const [k, v] of Object.entries(claims)) await tree.insert(keys[k], toField(v));

  async function inclusion(claim) {
    const key = F.e(keys[claim]);
    const res = await tree.find(key);
    const sib = res.siblings.map((s) => F.toObject(s));
    while (sib.length < LEVELS) sib.push(0);
    return { key: F.toObject(key), value: F.toObject(res.foundValue), siblings: sib };
  }

  return {
    F, eddsa, subj, age,
    rootF: tree.root,
    root: F.toObject(tree.root),
    inclusions: {
      age: await inclusion('age'),
      alumni: await inclusion('alumniOf'),
      name: await inclusion('name'),
    },
  };
}

// 발급기관 서명 (개인키 필요) — sign.mjs 전용. 메시지 = SMT root.
export function signVc(w) {
  const pub = w.eddsa.prv2pub(ISSUER_PRV);
  const msg = w.F.e(w.rootF);
  const sig = w.eddsa.signPoseidon(ISSUER_PRV, msg);
  return {
    Ax: w.F.toObject(pub[0]), Ay: w.F.toObject(pub[1]),
    R8x: w.F.toObject(sig.R8[0]), R8y: w.F.toObject(sig.R8[1]), S: sig.S,
  };
}

// vc.json 의 proof/issuer 에 저장된 서명을 회로 입력용으로 읽어온다 (검증 측 — 개인키 불필요).
export function sigFromVc(vc) {
  const pk = vc.issuer?.publicKey;
  const s = vc.proof?.signature;
  if (!pk || !s) throw new Error('vc.json 에 서명이 없음 — 먼저 "yarn sign" 실행');
  return { Ax: pk.Ax, Ay: pk.Ay, R8x: s.R8x, R8y: s.R8y, S: s.S };
}

// age_over_25 회로 입력: SMT×3(age·alumni·name) + EdDSA + M(=root)
export function ageOver25Input(w, sig) {
  const i = w.inclusions;
  return {
    root: w.root,
    enabled_age: 1, siblings_age: i.age.siblings, oldKey_age: 0, oldValue_age: 0, isOld0_age: 0, key_age: i.age.key, value_age: i.age.value, fnc_age: 0,
    enabled_alumni: 1, siblings_alumni: i.alumni.siblings, oldKey_alumni: 0, oldValue_alumni: 0, isOld0_alumni: 0, key_alumni: i.alumni.key, value_alumni: i.alumni.value, fnc_alumni: 0,
    enabled_name: 1, siblings_name: i.name.siblings, oldKey_name: 0, oldValue_name: 0, isOld0_name: 0, key_name: i.name.key, value_name: i.name.value, fnc_name: 0,
    enabled_eddsa: 1, Ax: sig.Ax, Ay: sig.Ay, R8x: sig.R8x, R8y: sig.R8y, S: sig.S, M: w.root,
  };
}

// regional_national_univ 회로 입력: alumniOf SMT×1 + EdDSA (M 은 회로가 root 를 직접 사용)
export function regionalInput(w, sig) {
  const i = w.inclusions;
  return {
    root: w.root,
    enabled_alumni: 1, siblings_alumni: i.alumni.siblings, oldKey_alumni: 0, oldValue_alumni: 0, isOld0_alumni: 0, key_alumni: i.alumni.key, value_alumni: i.alumni.value, fnc_alumni: 0,
    enabled_eddsa: 1, Ax: sig.Ax, Ay: sig.Ay, R8x: sig.R8x, R8y: sig.R8y, S: sig.S,
  };
}

// 시나리오 이름 → 입력 빌더
export const SCENARIO_INPUT = {
  age_over_25: ageOver25Input,
  regional_national_univ: regionalInput,
};
