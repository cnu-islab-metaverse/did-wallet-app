pragma circom 2.1.6;

include "circomlib/circuits/eddsaposeidon.circom";
include "circomlib/circuits/comparators.circom";
include "circomlib/circuits/smt/smtverifier.circom";
include "_registry.circom";

// [작업] 지역청년패스 증명 — 공통 vc.json 하나에서: residence·birthDate 클레임의 SMT 포함증명 +
//        발급기관 EdDSA 서명(root) + 발급기관 화이트리스트 + 거주 시도코드가 대전(registry) +
//        만 19~34세(법적 청년). 나이는 birthDate 와 현재날짜로 회로가 계산 → 유효기간 무관 현행화.
//        거주 신원(주민등록증/시민증)은 무기한이라 만료 검사 없음. nPublic=0.
// [결과] verify 통과 → 서명된 VC 소지자가 대전 거주 + 만 19~34세.
template YouthPass(nLevels) {
    // 공개신호(온체인 검증용) — main 의 public 목록. 실제 순서는 빌드 후 publicSignals 로 확인.
    signal input currentDate;    // public — 검증 시점 YYYYMMDD (컨트랙트가 block.timestamp 와 대조)
    signal input walletAddress;  // public — 제출 지갑주소 (컨트랙트가 msg.sender 와 대조; A2 바인딩)

    signal input root;

    // residence SMT 포함증명 (값 = 법정동 시도코드)
    signal input enabled_residence;
    signal input siblings_residence[nLevels];
    signal input oldKey_residence;
    signal input oldValue_residence;
    signal input isOld0_residence;
    signal input key_residence;
    signal input value_residence;
    signal input fnc_residence;

    component smtRes = SMTVerifier(nLevels);
    smtRes.enabled <== enabled_residence;
    smtRes.root <== root;
    smtRes.siblings <== siblings_residence;
    smtRes.oldKey <== oldKey_residence;
    smtRes.oldValue <== oldValue_residence;
    smtRes.isOld0 <== isOld0_residence;
    smtRes.key <== key_residence;
    smtRes.value <== value_residence;
    smtRes.fnc <== fnc_residence;

    // birthDate SMT 포함증명 (값 = YYYYMMDD 생년월일)
    signal input enabled_birthDate;
    signal input siblings_birthDate[nLevels];
    signal input oldKey_birthDate;
    signal input oldValue_birthDate;
    signal input isOld0_birthDate;
    signal input key_birthDate;
    signal input value_birthDate;
    signal input fnc_birthDate;

    component smtBirth = SMTVerifier(nLevels);
    smtBirth.enabled <== enabled_birthDate;
    smtBirth.root <== root;
    smtBirth.siblings <== siblings_birthDate;
    smtBirth.oldKey <== oldKey_birthDate;
    smtBirth.oldValue <== oldValue_birthDate;
    smtBirth.isOld0 <== isOld0_birthDate;
    smtBirth.key <== key_birthDate;
    smtBirth.value <== value_birthDate;
    smtBirth.fnc <== fnc_birthDate;

    // 발급기관 EdDSA 서명 — 메시지 = SMT root
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
    enabled_residence === 1;
    fnc_residence     === 0;
    key_residence     === claimKeyResidence();
    enabled_birthDate === 1;
    fnc_birthDate     === 0;
    key_birthDate     === claimKeyBirthDate();
    enabled_eddsa === 1;

    // ── 발급기관 화이트리스트 ────────────────────────────────────────
    // 거주·생년월일은 신분증 발급기관(행정안전부·경찰청)만 증명해줄 수 있다.
    // 공개키 한 쌍(Ax,Ay)이 목록의 같은 인덱스에서 둘 다 일치해야 한다. 좌표 하나만 보면
    // 서로 다른 기관의 좌표를 섞어 맞추는 경우를 배제하지 못한다.
    var nIss = youthIssuerCount();
    var issAx[nIss] = youthIssuerAx();
    var issAy[nIss] = youthIssuerAy();
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
    component bdBits = Num2Bits(32);
    bdBits.in <== value_birthDate;

    // 거주: 시도코드가 대전(registry)
    value_residence === daejeonCode();

    // 나이 범위: 만 19세 이상이고 35세 미만(= 34세 이하). YYYYMMDD 산술로 정확히 판정.
    //   N번째 생일이 지남 ⟺ birthDate ≤ currentDate - N*10000.
    //   하한(≥19): birthDate ≤ currentDate - 190000
    //   상한(≤34): 35번째 생일이 아직 안 지남 ⟺ birthDate > currentDate - 350000
    component turned19 = LessEqThan(32);
    turned19.in[0] <== value_birthDate;
    turned19.in[1] <== currentDate - youthMinAge() * 10000;
    turned19.out === 1;

    component under35 = GreaterThan(32);
    under35.in[0] <== value_birthDate;
    under35.in[1] <== currentDate - (youthMaxAge() + 1) * 10000;
    under35.out === 1;
}

component main {public [currentDate, walletAddress]} = YouthPass(64);
