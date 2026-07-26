pragma circom 2.1.6;

include "circomlib/circuits/eddsaposeidon.circom";
include "circomlib/circuits/comparators.circom";
include "circomlib/circuits/smt/smtverifier.circom";
include "_registry.circom";

// [작업] 지방거점국립대 소속 증명(재학 또는 졸업) — 공통 vc.json 하나에서: university·validUntil
//        클레임의 SMT 포함증명 + 발급기관 EdDSA 서명(root) + 발급기관 화이트리스트 +
//        학교코드가 registry 지방거점국립대 목록 중 하나와 일치 + VC 유효기간 내(validUntil ≥ 현재).
//        VC 엔 대학명만, witness 가 공식 학교코드로 변환. "재학/졸업" 은 소속 증명으로 충족. nPublic=0.
// [결과] verify 통과 → 유효기간 내 서명된 VC 의 소속 대학이 지방거점국립대 목록에 속함.
template RegionalNationalUniv(nLevels) {
    // 공개신호(온체인 검증용) — main 의 public 목록. 실제 순서는 빌드 후 publicSignals 로 확인.
    signal input currentDate;    // public — 검증 시점 YYYYMMDD (컨트랙트가 block.timestamp 와 대조)
    signal input walletAddress;  // public — 제출 지갑주소 (컨트랙트가 msg.sender 와 대조; A2 바인딩)

    signal input root;

    // university SMT 포함증명 (값 = 공식 학교코드)
    signal input enabled_university;
    signal input siblings_university[nLevels];
    signal input oldKey_university;
    signal input oldValue_university;
    signal input isOld0_university;
    signal input key_university;
    signal input value_university;
    signal input fnc_university;

    component smtUniv = SMTVerifier(nLevels);
    smtUniv.enabled <== enabled_university;
    smtUniv.root <== root;
    smtUniv.siblings <== siblings_university;
    smtUniv.oldKey <== oldKey_university;
    smtUniv.oldValue <== oldValue_university;
    smtUniv.isOld0 <== isOld0_university;
    smtUniv.key <== key_university;
    smtUniv.value <== value_university;
    smtUniv.fnc <== fnc_university;

    // validUntil SMT 포함증명 (값 = YYYYMMDD 만료일)
    signal input enabled_validUntil;
    signal input siblings_validUntil[nLevels];
    signal input oldKey_validUntil;
    signal input oldValue_validUntil;
    signal input isOld0_validUntil;
    signal input key_validUntil;
    signal input value_validUntil;
    signal input fnc_validUntil;

    component smtValid = SMTVerifier(nLevels);
    smtValid.enabled <== enabled_validUntil;
    smtValid.root <== root;
    smtValid.siblings <== siblings_validUntil;
    smtValid.oldKey <== oldKey_validUntil;
    smtValid.oldValue <== oldValue_validUntil;
    smtValid.isOld0 <== isOld0_validUntil;
    smtValid.key <== key_validUntil;
    smtValid.value <== value_validUntil;
    smtValid.fnc <== fnc_validUntil;

    // 발급기관 EdDSA 서명 — 메시지 = SMT root (서명을 같은 root 에 강하게 묶음)
    signal input enabled_eddsa;
    signal input Ax;
    signal input Ay;
    signal input R8x;
    signal input R8y;
    signal input S;

    component eddsa = EdDSAPoseidonVerifier();
    eddsa.enabled <== enabled_eddsa;
    eddsa.Ax <== Ax;
    eddsa.Ay <== Ay;
    eddsa.R8x <== R8x;
    eddsa.R8y <== R8y;
    eddsa.S <== S;
    eddsa.M <== root;

    // 발급기관 화이트리스트: 서명자 공개키가 registry 의 정당 발급기관인지 검증.
    Ax === issuerAx();
    Ay === issuerAy();

    // walletAddress 는 조건식에 안 쓰이므로 더미 제약으로 회로에 고정(최적화 제거 방지). A2 바인딩용.
    signal waSquared;
    waSquared <== walletAddress * walletAddress;

    // 멤버십: 학교코드가 registry 지방거점국립대 목록 중 하나와 일치 (유일 → 합은 0/1)
    var N = regionalUnivCount();
    var codes[N] = regionalUnivCodes();
    component eq[N];
    signal partial[N + 1];
    partial[0] <== 0;
    for (var i = 0; i < N; i++) {
        eq[i] = IsEqual();
        eq[i].in[0] <== value_university;
        eq[i].in[1] <== codes[i];
        partial[i + 1] <== partial[i] + eq[i].out;
    }
    partial[N] === 1;

    // 유효기간: validUntil ≥ 현재날짜 (학교 증명서 5년 만료 정책)
    component notExpired = GreaterEqThan(32);
    notExpired.in[0] <== value_validUntil;
    notExpired.in[1] <== currentDate;
    notExpired.out === 1;
}

component main {public [currentDate, walletAddress]} = RegionalNationalUniv(64);
