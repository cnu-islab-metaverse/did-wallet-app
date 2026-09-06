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

    // ── [보안] 회로 스위치 못박기 ──────────────────────────────────────
    // 이 세 종류가 자유 입력으로 남아 있으면 증명이 무의미해진다:
    //   enabled_* = 0  → SMT·EdDSA 검사가 통째로 꺼진다(자격증명 없이 증명 생성 가능)
    //   fnc_*     = 1  → 비포함 모드로 바뀌어 value 를 자유롭게 고를 수 있다
    //   key_*     자유 → 클레임 슬롯이 서로 바뀌어 쓰인다
    // oldKey/oldValue/isOld0 은 fnc=0·enabled=1 이면 circomlib 내부에서 무력화되므로 제약하지 않는다.
    enabled_university === 1;
    fnc_university     === 0;
    key_university     === claimKeyUniversity();
    enabled_validUntil === 1;
    fnc_validUntil     === 0;
    key_validUntil     === claimKeyValidUntil();
    enabled_eddsa === 1;

    // ── 발급기관 화이트리스트 ────────────────────────────────────────
    // 학적은 대학 학적과만 증명해줄 수 있다.
    // 공개키 한 쌍(Ax,Ay)이 목록의 같은 인덱스에서 둘 다 일치해야 한다. 좌표 하나만 보면
    // 서로 다른 기관의 좌표를 섞어 맞추는 경우를 배제하지 못한다.
    var nIss = univIssuerCount();
    var issAx[nIss] = univIssuerAx();
    var issAy[nIss] = univIssuerAy();
    component okAx[nIss];
    component okAy[nIss];
    signal bothIss[nIss];
    signal issAcc[nIss + 1];
    issAcc[0] <== 0;
    for (var i = 0; i < nIss; i++) {
        okAx[i] = IsEqual();
        okAx[i].in[0] <== Ax;
        okAx[i].in[1] <== issAx[i];
        okAy[i] = IsEqual();
        okAy[i].in[0] <== Ay;
        okAy[i].in[1] <== issAy[i];
        bothIss[i] <== okAx[i].out * okAy[i].out;
        issAcc[i + 1] <== issAcc[i] + bothIss[i];
    }
    issAcc[nIss] === 1;

    // walletAddress 를 160비트로 못박는다. 컨트랙트가 address(uint160(pubSignals[1])) 로
    // 절단하므로, 상위 비트에 임의 값이 실리지 않는 정규 인코딩을 강제한다(A2 바인딩).
    component waBits = Num2Bits(160);
    waBits.in <== walletAddress;

    // 비교기 입력 범위 보증(방어 심화). 서명된 값이라 현재 악용 경로는 없지만,
    // 범위를 벗어난 값이 들어오면 조용히 틀린 답이 아니라 증명 불가가 되게 한다.
    component cdBits = Num2Bits(32);
    cdBits.in <== currentDate;
    component vuBits = Num2Bits(32);
    vuBits.in <== value_validUntil;

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
