// ⚠️ 자동 생성 — 직접 수정 금지. 원본: circuits/witness.mjs
//    `yarn sync:zk` (predev/prebuild 에서 자동 실행) 가 원본을 그대로 복사한다.
//    회로와 SMT 키·학교코드·시도코드가 어긋나면 증명이 검증 실패하므로 포팅하지 않고 복사한다.
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

// 시도 법정동코드(행정안전부/행정표준코드) 2자리. 주소에서 거주 지역코드를 뽑는다. 정식·약어 모두 대응.
// _registry.circom 의 daejeonCode() 와 일치(대전=30). ★ issuer-web/services/vcsign.ts 와 동일해야 함.
export const SIDO = [
  { code: 11, p: ['서울특별시', '서울시', '서울'] },
  { code: 26, p: ['부산광역시', '부산시', '부산'] },
  { code: 27, p: ['대구광역시', '대구시', '대구'] },
  { code: 28, p: ['인천광역시', '인천시', '인천'] },
  { code: 29, p: ['광주광역시', '광주시', '광주'] },
  { code: 30, p: ['대전광역시', '대전시', '대전'] },
  { code: 31, p: ['울산광역시', '울산시', '울산'] },
  { code: 36, p: ['세종특별자치시', '세종시', '세종'] },
  { code: 41, p: ['경기도', '경기'] },
  { code: 42, p: ['강원특별자치도', '강원도', '강원'] },
  { code: 43, p: ['충청북도', '충북'] },
  { code: 44, p: ['충청남도', '충남'] },
  { code: 45, p: ['전북특별자치도', '전라북도', '전북'] },
  { code: 46, p: ['전라남도', '전남'] },
  { code: 47, p: ['경상북도', '경북'] },
  { code: 48, p: ['경상남도', '경남'] },
  { code: 50, p: ['제주특별자치도', '제주도', '제주'] },
];

// 클레임 → SMT 고정 키. 신용증명 종류마다 일부만 있어도 각 클레임은 항상 같은 키에 들어간다.
// ★ issuer-web/services/vcsign.ts 와 반드시 동일. 회로 입력의 key_* 도 이 값과 일치.
export const CLAIM_KEY = { name: 0, birthDate: 1, residence: 2, university: 3, validUntil: 4 };

// 발급기관 레지스트리 — 기관마다 별개의 키를 갖는다. 하나의 키를 공유하면 회로가
// '이 키로 서명된 어떤 증명서' 까지만 구분해, 대학이 거주를 증명하는 것을 막을 수 없다.
// prv 는 데모 전용 고정값(서명 단계에서만 쓰인다). ★ scenarios/_registry.circom 의
//    시나리오별 발급기관 목록과 공개키가 일치해야 한다.
export const ISSUERS = {
  mois: { name: '행정안전부', id: 'https://www.mois.go.kr', prv: '0001020304050607080900010203040506070809000102030405060708090001' },
  police: { name: '경찰청', id: 'https://www.police.go.kr', prv: '0001020304050607080900010203040506070809000102030405060708090002' },
  cnu: { name: '충남대학교', id: 'https://cnu.ac.kr/registrar', prv: '0001020304050607080900010203040506070809000102030405060708090003' },
  hrdk: { name: '한국산업인력공단', id: 'https://www.hrdkorea.or.kr', prv: '0001020304050607080900010203040506070809000102030405060708090004' },
  nhis: { name: '국민건강보험공단', id: 'https://www.nhis.or.kr', prv: '0001020304050607080900010203040506070809000102030405060708090005' },
};

/** VC 의 issuer.id 로 발급기관 키를 찾는다. */
export function issuerKeyOf(vc) {
  const id = typeof vc?.issuer === 'string' ? vc.issuer : vc?.issuer?.id;
  const entry = Object.entries(ISSUERS).find(([, v]) => v.id === id);
  if (!entry) throw new Error(`등록되지 않은 발급기관: ${id}`);
  return { key: entry[0], ...entry[1], prv: Buffer.from(entry[1].prv, 'hex') };
}

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
  const a = String(addr).trim();
  for (const s of SIDO) if (s.p.some((pre) => a.startsWith(pre))) return s.code;
  throw new Error(`주소에서 시도를 못 찾음: ${addr}`);
}

// vc 클레임을 SMT 로 구성하고 포함증명 witness 를 뽑는다. 결정적 → 매번 같은 root.
export async function buildWitness(vc) {
  const poseidon = await buildPoseidon();
  const eddsa = await buildEddsa();
  const tree = await newMemEmptyTrie();
  const F = tree.F;

  const subj = vc.credentialSubject;
  // VC 에 있는 클레임만 정규 스키마로 인코딩(부분 신용증명 허용). name=poseidon(문자열), 나머지 정수.
  // 나이는 저장하지 않는다(회로가 birthDate+현재날짜로 계산). ★ vcsign.ts 와 동일 규칙.
  const claims = {};
  if (subj.name != null) claims.name = subj.name;
  if (subj.birthDate != null) claims.birthDate = toYmd(subj.birthDate);
  if (subj.residentialAddress != null) claims.residence = regionCodeFromAddress(subj.residentialAddress);
  if (subj.university != null) {
    const c = UNIV_CODE[subj.university];
    if (c === undefined) throw new Error(`학교코드 없음(대학 목록 밖): ${subj.university}`);
    claims.university = c;
  }
  if (vc.validUntil != null) claims.validUntil = toYmd(vc.validUntil);

  const toField = (v) => (typeof v === 'string' ? F.e(poseidon([Buffer.from(v, 'utf8')])) : F.e(v));
  for (const [k, v] of Object.entries(claims)) await tree.insert(BigInt(CLAIM_KEY[k]), toField(v));

  async function inclusion(claim) {
    const key = F.e(CLAIM_KEY[claim]);
    const res = await tree.find(key);
    const sib = res.siblings.map((s) => F.toObject(s));
    while (sib.length < LEVELS) sib.push(0);
    return { key: F.toObject(key), value: F.toObject(res.foundValue), siblings: sib };
  }

  // VC 에 존재하는 클레임만 포함증명을 만든다(부분 신용증명 허용).
  const inclusions = {};
  for (const k of Object.keys(claims)) inclusions[k] = await inclusion(k);

  return {
    F, eddsa, subj, vc,
    currentDate: todayYmd(),
    // 제출 지갑주소(A2 바인딩) — 데모는 VC 의 walletAddress. 실제 흐름에선 증명 시점에 지갑이
    // 자신의 현재 주소를 넣는다(서명된 VC 와 독립). 160비트 주소는 필드에 그대로 들어감.
    walletAddress: BigInt(subj.walletAddress),
    rootF: tree.root,
    root: F.toObject(tree.root),
    inclusions,
  };
}

// 발급기관 서명 (개인키 필요) — sign.mjs 전용. 메시지 = SMT root.
/** VC 를 그 VC 의 발급기관 키로 서명한다. issuer 를 넘기면 그 키를 쓴다. */
export function signVc(w, issuer) {
  const prv = issuer?.prv ?? issuerKeyOf(w.vc).prv;
  const pub = w.eddsa.prv2pub(prv);
  const msg = w.F.e(w.rootF);
  const sig = w.eddsa.signPoseidon(prv, msg);
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
// 시나리오별 기본 샘플 VC. 각 회로가 요구하는 클레임만 담은 현실적인 증명서를 쓴다
// (하나의 VC 가 거주·학적을 동시에 담으면 대학이 거주를 증명하는 그림이 된다).
export const SCENARIO_VC = {
  youth_pass: 'vc/resident.json',              // 행정안전부 주민등록증
  regional_national_univ: 'vc/diploma.json',   // 충남대 졸업증명서
};

export const SCENARIO_INPUT = {
  regional_national_univ: regionalInput,
  youth_pass: youthPassInput,
};
