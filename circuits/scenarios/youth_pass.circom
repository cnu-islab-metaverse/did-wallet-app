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

    // 발급기관 화이트리스트
    Ax === issuerAx();
    Ay === issuerAy();

    // walletAddress 는 조건식에 안 쓰이므로 더미 제약으로 회로에 고정(최적화 제거 방지). A2 바인딩용.
    signal waSquared;
    waSquared <== walletAddress * walletAddress;

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
