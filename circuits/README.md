# circuits — 로컬 ZK 회로 빌드/검증 (circom + snarkjs, Groth16)

- **단일 입력은 공통 샘플 VC** 하나(`vc.json`) 뿐 — 시나리오별 입력 파일 없음. witness 는 검증 시 메모리로 생성.
- **조건 회로**(무엇을·어떤 조건을 증명할지)는 `scenarios/` 에 → `<name>.circom`
- **사전정보**(발급기관 공개키·대학 목록)는 `scenarios/registry.circom` 에 → 각 회로가 include
- **로직**(일반 소스코드)은 이 루트에 → `witness.mjs`(vc→입력) · `sign.mjs`(발급 서명) · `build.js`(키 생성) · `verify.mjs`(증명+검증)
- 생성물 `build/`, `ptau/` 는 gitignore (소스만 추적). `vc.json` 은 테스트 픽스처라 추적.

---

## 0) 발급 서명  (VC 클레임을 바꿨을 때만)

`vc.json` 의 클레임을 SMT 로 구성해 root 를 만들고, 테스트 발급기관 개인키로 EdDSA 서명해
그 결과(발급자 공개키·merkleRoot·signature)를 `vc.json` 에 되기록한다. **개인키가 필요한 유일한 단계.**

```bash
yarn sign        # vc.json 클레임 → 서명 → vc.json 에 되기록
```

## 1) 검토 — 검증 실행  (verify = 증명 생성 → 검증)

`vc.json` 하나만 읽어 witness 를 메모리로 만들고, 기존 키로 증명·검증한다(입력 파일도, 키 재생성도 없음).
출력 끝에 **`검증 결과: true` + `통과 ✅`** 면 정상.

```bash
yarn verify age_over_25
yarn verify regional_national_univ
```

| 명령 | 회로 파일 | 무슨 조건을 증명 |
|---|---|---|
| `verify age_over_25` | `scenarios/age_over_25.circom` | SMT로 **age·alumni·name** 포함 증명 + 발급기관 **EdDSA 서명** + **발급기관 화이트리스트** + **"만 25세 이상"** |
| `verify regional_national_univ` | `scenarios/regional_national_univ.circom` | SMT로 **alumniOf** 포함 증명 + 발급기관 **EdDSA 서명** + **발급기관 화이트리스트** + alumniOf **학교코드**가 **지방거점국립대 목록**(registry) 중 하나와 일치 |

둘 다 공개 신호 없음(nPublic=0) — 전부 비공개, 검증만. VC 엔 대학명만 두고, `witness.mjs` 가
**교육부/대학알리미 공식 학교코드**(2024-10-07 기준, `UNIV_CODE`)로 변환해 SMT 에 넣는다. 회로는 이 코드로 검증한다.

verify 출력 순서: **대상 회로·조건 설명·입력 파일** → `(1/2)` 증명 생성 → `(2/2)` 검증 → 결과.

## 2) 키 생성  (회로를 새로 만들거나 수정했을 때만)

```bash
yarn build <name> [ptauPower]     # 예: yarn build age_over_25
```

`ptauPower` 는 생략 시 회로 제약 수를 보고 **자동 선택**(충분한 `ptau/pot<n>_final.ptau` 가 있으면 재사용).
단계: circom 컴파일 → Powers of Tau(phase1, 로컬) → groth16 setup(phase2) → 검증키 + **`Verifier.sol`**.
결과물은 `build/<name>/` 에. (Groth16는 회로마다 setup이 필요 → 수정/신규 회로는 build 후 verify.)

## 3) 새 조건 회로 추가

1. `scenarios/<name>.circom` 작성 — 발급기관/대학 등 사전정보는 `registry.circom` 에서 include.
2. `witness.mjs` 에 해당 회로용 입력 빌더 추가 후 `SCENARIO_INPUT` 에 등록(공통 `vc.json` 기반).
3. `yarn build <name>` → `yarn verify <name>`. (VC 클레임을 바꿨다면 먼저 `yarn sign`.)

---

## 최초 1회 설치

```bash
cargo install --git https://github.com/iden3/circom.git circom   # circom 컴파일러
yarn install                                                     # circomlib + circomlibjs + snarkjs
```

## 관련

- `../verifier-web` → `yarn zk:selftest` : 참조 회로를 브라우저 없이 로컬 증명+검증.
- 변경 검토: `git -C .. status` · `git -C .. diff`.

## 트러스티드 셋업 노트 (Groth16)

phase-2 setup은 회로별. 여기 phase-1 Powers of Tau는 **1인 로컬 = 데모용**(프로덕션은 검증된 커뮤니티 ptau를 `ptau/pot<power>_final.ptau` 로 넣으면 재사용).
