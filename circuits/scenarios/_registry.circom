pragma circom 2.1.6;

// 사전정보(레지스트리) — 시나리오 회로들이 include 해서 공유. 발급기관/대학이 바뀌면
// 여기만 고치고 관련 회로를 재빌드한다.

// 데모 테스트 발급기관 공개키 (witness.mjs 의 ISSUER_PRV 에서 파생)
function issuerAx() { return 13277427435165878497778222415993513565335242147425444199013288855685581939618; }
function issuerAy() { return 13622229784656158136036771217484571176836296686641868549125388198837476602820; }

// 지방거점국립대 공식 학교코드(9) — 교육부/대학알리미 학교개황(2024-10-07 기준) 학교코드(본교).
// VC 엔 대학명만 두고, witness.mjs 의 UNIV_CODE 가 이름→코드로 변환해 SMT alumniOf 값으로 넣는다.
// 순서: 강원대·경북대·경상국립대·부산대·전남대·전북대·제주대·충남대·충북대
function regionalUnivCount() { return 9; }
function regionalUnivCodes() {
    return [
        3,   // 강원대학교
        5,   // 경북대학교
        7,   // 경상국립대학교
        14,  // 부산대학교
        23,  // 전남대학교
        25,  // 전북대학교
        27,  // 제주대학교
        29,  // 충남대학교
        30   // 충북대학교
    ];
}

// 지역청년패스 대상 거주지 — 법정동코드 시도 2자리(행정안전부/행정표준코드). 대전광역시=30.
function daejeonCode() { return 30; }

// 지역청년 나이 기준(법적 청년): 만 19세 이상 34세 이하.
function youthMinAge() { return 19; }
function youthMaxAge() { return 34; }
