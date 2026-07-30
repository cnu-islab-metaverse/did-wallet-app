# cnu-issuer-web — 충남대 학적 증명서 발급기관 (아이서티 스타일 · 실증 데모)

충남대학교 재학·졸업 증명서를 **VC**로 발급하는 학적 발급기관 데모. iCerti(아이서티) 증명서 발급
포털의 구조·디자인 언어로 구성한 UI에서 **학적조회 → 증명서 확인 → DID 지갑에 발급** 흐름을 제공한다.

> 실제 (주)아이서티·충남대 증명발급이 아닌 **연구 실증용 데모**(ICT R&D RS-2023-00229400). 페이지에 데모 고지를 표시한다.

## 발급 증명서

| 상태 | 증명서 | VC type | 유효기간 |
|---|---|---|---|
| 졸업 | 졸업증명서 | `UniversityAcademicCredential` | 졸업연도 +5년 |
| 재학 | 재학증명서 | `UniversityAcademicCredential` | 발급 +1년 |

- `credentialSubject.university = "충남대학교"` + `validUntil` → circuits `regional_national_univ`(지방거점국립대 소속·유효기간) 에서 검증.
- 재학/졸업 **모두 발급**(시나리오가 둘 다 허용). 학적상태는 메타데이터(SMT 클레임 아님).

## 회로 호환 서명

`services/vcsign.ts` 가 **circuits 와 동일한 SMT 구성 + EdDSA(BabyJubJub) 서명**을 붙인다(정규 스키마·발급키를
`../circuits/witness.mjs`, `../issuer-web/src/services/vcsign.ts` 와 공유 — `★` 주석). **검증됨**: 발급한
졸업증명서 VC → circuits `regional_national_univ` 증명·검증 통과(재구성 root == 발급 root).

## 실행

```bash
npm run dev      # http://localhost:20251  (다른 발급기관과 동시 구동 시 PORT=20252 등으로 변경)
```

데모 계정: **학번 202012345 / 생년월일 2002-01-01** (하현재, 졸업).

## 구성

- `src/server.ts` — Express. `/api/students/verify`(학적조회), `/api/issue/vc`(발급), 정적 UI.
- `src/services/{students,issue,vcsign,auth}.ts` — 조회·발급·회로호환서명·인증.
- `src/static/` — 아이서티 스타일 프론트엔드. 지갑 확장 연동(postMessage `DID_WALLET_*`).
- `src/database/students.json` — 학적 샘플 DB.

> 참고: `cnu-issuer-web/cnu-issuer-web/`(이중 중첩 zk 바이너리)는 서버가 서빙하지 않는 데드 카피 — 정리 대상.
