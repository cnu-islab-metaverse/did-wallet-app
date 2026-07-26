// [작업] 공통 vc.json → 회로 witness. vc 클레임(name·birthDate·university·residence·validUntil)을
//        SMT 로 구성하고, 각 시나리오 회로가 먹는 입력 객체를 만든다. 서명(sign.mjs)·검증(verify.mjs)
//        이 같은 SMT 구성을 공유하므로 root 가 일치한다. 나이는 저장하지 않고 회로가 birthDate 와
//        현재날짜(currentDate)로 매번 계산 → 유효기간과 무관하게 상·하한 자동 현행화.
// [결과] buildWitness(vc) → { root, inclusions, currentDate, ... }; regionalInput / youthPassInput.
import { buildEddsa, buildPoseidon, newMemEmptyTrie } from 'circomlibjs';

const LEVELS = 64;

// 대학명 → 공식 학교코드. 교육부/대학알리미 학교개황(2024-10-07 기준) 학교코드(본교).
// _registry.circom 의 regionalUnivCodes() 와 값·순서 일치.
export const UNIV_CODE = {
  강원대학교: 3, 경북대학교: 5, 경상국립대학교: 7, 부산대학교: 14, 전남대학교: 23,
  전북대학교: 25, 제주대학교: 27, 충남대학교: 29, 충북대학교: 30,
};
export const REGIONAL_UNIVS = Object.keys(UNIV_CODE);

// 시도명 → 법정동코드 시도 2자리(행정안전부/행정표준코드). 주소에서 거주 지역코드를 뽑는다.
// _registry.circom 의 daejeonCode() 와 일치(대전=30).
export const SIDO_CODE = {
  서울특별시: 11, 부산광역시: 26, 대구광역시: 27, 인천광역시: 28, 광주광역시: 29,
  대전광역시: 30, 울산광역시: 31, 세종특별자치시: 36, 경기도: 41, 강원특별자치도: 42,
  강원도: 42, 충청북도: 43, 충청남도: 44, 전북특별자치도: 45, 전라북도: 45,
  전라남도: 46, 경상북도: 47, 경상남도: 48, 제주특별자치도: 50,
};

// 데모용 고정 테스트 발급기관 개인키(서명 단계에서만 사용). 여기서 공개키가 파생된다.
export const ISSUER_PRV = Buffer.from(
  '0001020304050607080900010203040506070809000102030405060708090001',
  'hex',
);

// "YYYY-MM-DD" → YYYYMMDD 정수(달력 순서를 보존해 회로에서 나이·만료 비교에 사용).
export function toYmd(dateStr) {
  const [y, m, d] = String(dateStr).slice(0, 10).split('-').map(Number);
  return y * 10000 + m * 100 + d;
}
export function todayYmd() {
  const n = new Date();
  return n.getFullYear() * 10000 + (n.getMonth() + 1) * 100 + n.getDate();
}
export function regionCodeFromAddress(addr) {
  const sido = Object.keys(SIDO_CODE).find((s) => String(addr).startsWith(s));
  if (!sido) throw new Error(`주소에서 시도를 못 찾음: ${addr}`);
  return SIDO_CODE[sido];
}

// vc 클레임을 SMT 로 구성하고 포함증명 witness 를 뽑는다. 결정적 → 매번 같은 root.
export async function buildWitness(vc) {
  const poseidon = await buildPoseidon();
  const eddsa = await buildEddsa();
  const tree = await newMemEmptyTrie();
  const F = tree.F;

  const subj = vc.credentialSubject;
  const univCode = UNIV_CODE[subj.university];
  if (univCode === undefined) throw new Error(`학교코드 없음(대학 목록 밖): ${subj.university}`);
  const regionCode = regionCodeFromAddress(subj.residentialAddress);
  // 클레임 인코딩: name=poseidon(문자열), 나머지는 정수(코드/YYYYMMDD). 나이는 저장 안 함.
  const claims = {
    name: subj.name,
    birthDate: toYmd(subj.birthDate),
    university: univCode,
    residence: regionCode,
    validUntil: toYmd(vc.validUntil),
  };

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
    F, eddsa, subj,
    currentDate: todayYmd(),
    // 제출 지갑주소(A2 바인딩) — 데모는 VC 의 walletAddress. 실제 흐름에선 증명 시점에 지갑이
    // 자신의 현재 주소를 넣는다(서명된 VC 와 독립). 160비트 주소는 필드에 그대로 들어감.
    walletAddress: BigInt(subj.walletAddress),
    rootF: tree.root,
    root: F.toObject(tree.root),
    inclusions: {
      birthDate: await inclusion('birthDate'),
      university: await inclusion('university'),
      residence: await inclusion('residence'),
      validUntil: await inclusion('validUntil'),
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

// SMT 포함증명 1건을 회로 입력 필드로 펼친다(접두사 prefix 로 신호명 구분).
function smt(prefix, inc) {
  return {
    [`enabled_${prefix}`]: 1,
    [`siblings_${prefix}`]: inc.siblings,
    [`oldKey_${prefix}`]: 0, [`oldValue_${prefix}`]: 0, [`isOld0_${prefix}`]: 0,
    [`key_${prefix}`]: inc.key, [`value_${prefix}`]: inc.value, [`fnc_${prefix}`]: 0,
  };
}
function eddsa(sig) {
  return { enabled_eddsa: 1, Ax: sig.Ax, Ay: sig.Ay, R8x: sig.R8x, R8y: sig.R8y, S: sig.S };
}

// regional_national_univ 입력: university·validUntil SMT + EdDSA + currentDate·walletAddress(공개)
export function regionalInput(w, sig) {
  return {
    root: w.root, currentDate: w.currentDate, walletAddress: w.walletAddress,
    ...smt('university', w.inclusions.university),
    ...smt('validUntil', w.inclusions.validUntil),
    ...eddsa(sig),
  };
}

// youth_pass 입력: residence·birthDate SMT + EdDSA + currentDate·walletAddress(공개)
export function youthPassInput(w, sig) {
  return {
    root: w.root, currentDate: w.currentDate, walletAddress: w.walletAddress,
    ...smt('residence', w.inclusions.residence),
    ...smt('birthDate', w.inclusions.birthDate),
    ...eddsa(sig),
  };
}

// 시나리오 이름 → 입력 빌더
export const SCENARIO_INPUT = {
  regional_national_univ: regionalInput,
  youth_pass: youthPassInput,
};
