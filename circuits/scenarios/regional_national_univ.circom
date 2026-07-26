pragma circom 2.1.6;

include "circomlib/circuits/eddsaposeidon.circom";
include "circomlib/circuits/comparators.circom";
include "circomlib/circuits/smt/smtverifier.circom";
include "_registry.circom";

// [작업] 지방거점국립대 소속 증명 — 공통 vc.json 하나에서: alumniOf 클레임의 SMT 포함증명 +
//        발급기관 EdDSA 서명(root 에 대해) + 발급기관 화이트리스트 + alumniOf 학교코드가
//        registry 의 지방거점국립대 공식 학교코드 목록 중 하나와 일치. VC 엔 대학명만 두고
//        witness 가 이름→코드로 변환. "재학/졸업" 은 소속(alumniOf) 증명으로 충족. nPublic=0.
// [결과] verify 통과 → 서명된 VC 의 소속 대학이 지방거점국립대 목록에 속함.
template RegionalNationalUniv(nLevels) {
    signal input root;

    // alumniOf SMT 포함증명
    signal input enabled_alumni;
    signal input siblings_alumni[nLevels];
    signal input oldKey_alumni;
    signal input oldValue_alumni;
    signal input isOld0_alumni;
    signal input key_alumni;
    signal input value_alumni;
    signal input fnc_alumni;

    component smt = SMTVerifier(nLevels);
    smt.enabled <== enabled_alumni;
    smt.root <== root;
    smt.siblings <== siblings_alumni;
    smt.oldKey <== oldKey_alumni;
    smt.oldValue <== oldValue_alumni;
    smt.isOld0 <== isOld0_alumni;
    smt.key <== key_alumni;
    smt.value <== value_alumni;
    smt.fnc <== fnc_alumni;

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

    // 멤버십: alumniOf 학교코드가 registry 지방거점국립대 목록 중 하나와 일치 (유일 → 합은 0/1)
    var N = regionalUnivCount();
    var codes[N] = regionalUnivCodes();
    component eq[N];
    signal partial[N + 1];
    partial[0] <== 0;
    for (var i = 0; i < N; i++) {
        eq[i] = IsEqual();
        eq[i].in[0] <== value_alumni;
        eq[i].in[1] <== codes[i];
        partial[i + 1] <== partial[i] + eq[i].out;
    }
    partial[N] === 1;
}

component main = RegionalNationalUniv(64);
