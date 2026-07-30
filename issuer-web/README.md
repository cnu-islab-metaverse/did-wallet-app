# issuer-web — 정부24 스타일 신원 발급기관 (실증 데모)

행정·공공 신원 증명서를 **VC**로 발급하는 발급기관 데모. 정부24 디자인 언어로 구성한
UI에서 **본인확인 → 발급정보 확인 → DID 지갑에 발급** 흐름을 제공한다.

> 실제 정부24가 아닌 **연구 실증용 데모**(ICT R&D RS-2023-00229400)로, 페이지에 데모 고지를 표시한다.

## 발급 증명서

| 종류 | VC type | 발급기관 | 유효기간 |
|---|---|---|---|
| 주민등록증 | `ResidentRegistrationCredential` | 행정안전부 | 무기한(`validUntil: null`) |
| 운전면허증 | `DrivingLicenseCredential` | 경찰청 | 갱신 만료일까지 |

- 두 증명서 모두 `credentialSubject` 에 `name·birthDate·residentialAddress` 포함 → circuits `youth_pass`(대전 거주+나이) 등에서 활용.
- 운전면허 정보(면허번호·종별·갱신기간)는 주민 레코드에서 결정적 파생(`services/driver.ts`). 만 18세 미만은 발급 불가.

## 실행

```bash
npm run init-db     # (최초 1회) SQLite 샘플 residents.db 생성
npm run dev         # http://localhost:20251
```

데모 계정: **문채원 / 1988-12-05 / 주민번호 뒤 1자리 8**.
`better-sqlite3` 가 다른 Node ABI로 설치돼 있으면 `npm rebuild better-sqlite3` 후 실행.

## 구성

- `src/server.ts` — Express. `/api/residents/verify`(본인확인), `/api/issue/vc`(발급), 정적 UI.
- `src/services/{residents,issue,driver,auth}.ts` — 조회·발급·운전면허 파생·인증.
- `src/static/` — 정부24 스타일 프론트엔드(`index.html`·`styles.css`·`main.js`). 지갑 확장 연동(postMessage `DID_WALLET_*`).

## 회로 호환 서명 (완료)

발급 VC는 `services/vcsign.ts` 가 **circuits 와 동일한 SMT 구성 + EdDSA(BabyJubJub) 서명**을 붙인다.
- 클레임 정규 스키마(고정 키·인코딩·시도/학교 코드·발급키)는 `../circuits/witness.mjs` 와 **일치**해야 한다(불일치 시 root 불일치로 검증 실패). 두 파일 모두 `★` 주석으로 표시.
- 발급기관 공개키는 회로 화이트리스트(`_registry.circom` issuerAx/Ay)와 동일한 데모 테스트 키에서 파생.
- **검증됨**: 발급한 주민등록증 VC(대전 거주자) → circuits `youth_pass` 증명·검증 통과(재구성 root == 발급 root).

> 데모라 주민등록증·운전면허증 발급기관이 같은 테스트 서명키를 공유한다. 실제로는 기관별 키 + 회로 화이트리스트 다키화 필요.
