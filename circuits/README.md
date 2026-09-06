# circuits — ZK 회로 빌드/검증 (circom + snarkjs, Groth16)

- **시나리오별 샘플 VC** — `vc/resident.json`(행정안전부 주민등록증) · `vc/diploma.json`(충남대 졸업증명서).
  각 회로가 요구하는 클레임만 담는다. witness 는 검증 시 메모리로 생성.
- **조건 회로**(무엇을·어떤 조건을 증명할지)는 `scenarios/` 에 → `<name>.circom`
- **사전정보**(발급기관 공개키·대학 학교코드·대전 거주코드·청년 나이기준·클레임 슬롯 번호)는
  `scenarios/_registry.circom` 에 → 각 회로가 include
- **로직**은 이 루트에 → `witness.mjs`(vc→입력) · `sign.mjs`(발급 서명) · `build.js`(키 생성) ·
  `verify.mjs`(증명+검증) · `calldata.mjs`(온체인용 calldata) · `release.mjs`(컨트랙트로 내보내기)
- 생성물 `build/`, `ptau/`, `archive/` 는 gitignore. 샘플 VC 와 `verification-keys/` 는 추적.

---

## 0) 발급 서명  (VC 클레임을 바꿨을 때만)

각 샘플 VC 의 클레임을 SMT 로 구성해 root 를 만들고, 테스트 발급기관 개인키로 EdDSA 서명해
그 결과(발급자 공개키·merkleRoot·signature)를 VC 에 되기록한다. **개인키가 필요한 유일한 단계.**

```bash
yarn sign                    # 시나리오가 쓰는 샘플 VC 전부
node sign.mjs vc/resident.json   # 특정 파일만
```

## 1) 검토 — 검증 실행  (verify = 증명 생성 → 검증)

시나리오에 대응하는 샘플 VC 를 읽어 witness 를 메모리로 만들고, 기존 키로 증명·검증한다.
출력 끝에 **`검증 결과: true` + `통과 ✅`** 면 정상.

```bash
yarn verify youth_pass
yarn verify regional_national_univ
node verify.mjs youth_pass --vc vc/diploma.json   # 다른 VC 로 시도(실패를 보이는 용도)
```

| 시나리오 | 쓰는 VC | 무슨 조건을 증명 |
|---|---|---|
| `youth_pass` | `vc/resident.json` | SMT로 **residence·birthDate** 포함 증명 + 발급기관 **EdDSA 서명** + 거주지가 **대전**(시도코드 30) + **만 19~34세**(생년월일+현재날짜로 회로가 계산) |
| `regional_national_univ` | `vc/diploma.json` | SMT로 **university·validUntil** 포함 증명 + 발급기관 **EdDSA 서명** + 학교코드가 **지방거점국립대 목록**(재학/졸업 불문) + **유효기간 내**(validUntil ≥ 현재) |

**공개신호(nPublic=2) = `[currentDate, walletAddress]`**. 그 외 값(대학·거주·생년월일·서명)은 전부 비공개.

- `currentDate` (YYYYMMDD): 나이·유효기간 판정 기준. 온체인에서 `block.timestamp`→YYYYMMDD 와 대조.
  **회로는 이 값을 검증하지 않는다** — 증명자가 정하는 공개 입력이고, 신뢰성은 컨트랙트의 시점 검사에서 나온다.
- `walletAddress`: 제출 지갑주소(A2 바인딩). 컨트랙트가 `msg.sender == walletAddress` 를 확인한다.
  회로에서는 `Num2Bits(160)` 으로 정규 인코딩만 강제하고 조건엔 쓰지 않는다.

**VC 엔 사람이 읽는 값만**(대학명·주소·생년월일), `witness.mjs` 가 코드로 변환해 SMT 에 넣는다:
대학 = 학교코드, 거주 = **법정동 시도코드**(대전 30). **나이는 저장하지 않고** 회로가
`birthDate`+`currentDate` 로 매번 계산 → 유효기간과 무관하게 상·하한 자동 현행화.

### 시나리오와 증명서는 짝이 맞아야 한다

주민등록증에는 `university` 클레임이 없으므로 거점국립대 패스를 **아예 증명할 수 없다**
(포함증명 자체가 존재하지 않아 witness 생성에서 실패한다). 반대도 같다.
지갑도 같은 규칙으로 VC 마다 가능한 시나리오를 판정한다(`wallet/core/lib/passIssuance.ts`).

## 2) 키 생성  (회로를 새로 만들거나 수정했을 때만)

```bash
yarn build <name> [ptauPower]     # 예: yarn build youth_pass
node release.mjs                  # Verifier.sol + 테스트 픽스처를 함께 내보낸다
```

`release.mjs` 를 반드시 같이 돌린다. `build/<name>/Verifier.sol` 을 `contract/src/` 로 복사하고
`contract/test/fixtures/proofs.json` 을 같은 zkey 로 다시 만들기 때문에, 검증자와 테스트가
어긋날 수 없다. (예전에는 "회로 변경 시 이 파일을 재복사한다"는 수동 지시였고, 실제로 어긋났다.)

## 3) 새 조건 회로 추가

1. `scenarios/<name>.circom` 작성 — 사전정보는 `_registry.circom` 에서 include.
   **아래 "회로 작성 시 반드시 넣을 제약"을 지킬 것.**
2. `witness.mjs` 에 입력 빌더 추가 후 `SCENARIO_INPUT` 에 등록, `SCENARIO_VC` 에 쓸 샘플 VC 지정.
3. `yarn build <name>` → `node release.mjs` → `yarn verify <name>`.
4. 온체인에 붙이려면 검증자를 배포하고 `ZKCredentialSBT.registerPassType(passType, verifier, validity)`.

---

## 발급기관 권한 범위

발급기관마다 **별개의 키**를 갖고(`witness.mjs` 의 `ISSUERS`), 회로는 **시나리오별 화이트리스트**를
one-hot 으로 검사한다(`_registry.circom`). 공개키 한 쌍(Ax,Ay)이 목록의 같은 인덱스에서 둘 다
일치해야 한다 — 좌표 하나만 보면 서로 다른 기관의 좌표를 섞어 맞추는 경우를 배제하지 못한다.

| 시나리오 | 증명해줄 수 있는 기관 |
|---|---|
| `youth_pass` (거주·생년월일) | 행정안전부(주민등록증) · 경찰청(운전면허증) |
| `regional_national_univ` (학적) | 대학 학적과 (데모: 충남대) |

키를 하나로 공유하면 회로가 '이 키로 서명된 어떤 증명서' 까지만 구분하므로, **대학이 발급한
증명서로 거주를 증명하는 것을 막을 수 없다.** 실제로 그 상태였고, 분리 후 거부되는 것을 확인했다.

> 한계: 지금은 **기관 단위**로만 구분한다. 증명서 *종류* 는 서명에 들어 있지 않으므로, 한 기관이
> 소관 밖 클레임을 담아 발급하면 그 기관이 허용된 시나리오 안에서는 통과한다.
> `CLAIM_KEY` 에 `credentialType` 을 추가하는 것이 다음 단계다.

## ⚠️ 회로 작성 시 반드시 넣을 제약

circomlib 의 `SMTVerifier`·`EdDSAPoseidonVerifier` 는 **스위치 입력을 그대로 신뢰한다.**
이것을 제약하지 않으면 증명이 무의미해진다. 2026-09-06 에 실제로 이 문제로 취약점이 있었다
(→ `../SECURITY.md`).

```circom
enabled_<claim> === 1;              // 0 이면 검사가 통째로 꺼진다
fnc_<claim>     === 0;              // 1 이면 비포함 모드가 되어 value 를 자유롭게 고를 수 있다
key_<claim>     === claimKey<X>();  // 안 묶으면 클레임 슬롯이 서로 바뀌어 쓰인다
enabled_eddsa   === 1;              // 0 이면 서명 검증이 통째로 꺼진다
```

`key_*` 를 묶어야 하는 이유는 구체적이다 — **대전 시도코드 30 과 충북대학교 학교코드 30 이 같다.**
슬롯을 고정하지 않으면 충북대 증명서의 university 리프로 "대전 거주"가 증명된다.

`oldKey_*`·`oldValue_*`·`isOld0_*` 는 `fnc=0`·`enabled=1` 이면 circomlib 내부에서 `st_iold ≡ 0` 이
되어 무력화되므로 제약하지 않아도 된다.

---

## 최초 1회 설치

```bash
cargo install --git https://github.com/iden3/circom.git circom   # circom 컴파일러
yarn install                                                     # circomlib + circomlibjs + snarkjs
```

## 트러스티드 셋업 노트 (Groth16)

**재빌드는 같은 결과를 내지 않는다.** `build.js` 가 고정 엔트로피 문자열을 주지만 snarkjs 가
그 앞에 난수를 섞는다(`snarkjs/src/misc.js` → `getRandomRng` → `getRandomBytes(64)`).

| 산출물 | 재빌드 시 |
|---|---|
| `*.wasm`, `*.r1cs` (circom 컴파일) | **동일**(실측 확인) |
| `zkey new` (groth16 setup) | 동일 — 난수 미사용 |
| `*_final.zkey` (`zkey contribute`) · `verification_key.json` · `Verifier.sol` | **매번 다름** |

시드를 박아 고정하면 안 된다. `contribute` 를 건너뛰거나 시드를 저장소에 넣으면 Groth16 의
delta 가 공개값이 되어 **누구나 증명을 위조할 수 있다.** 재현성과 건전성은 이 단계에서 상충한다.

따라서 **배포된 검증자에 대응하는 zkey 를 잃으면 그 컨트랙트용 증명을 다시는 만들 수 없다.**
`archive/<날짜>-groth16-v<n>/` 에 zkey·wasm·vkey·ptau 를 SHA256SUMS 와 함께 읽기 전용으로
보관한다(gitignore, 재빌드가 건드리지 않는다). 검증키만 `verification-keys/` 에 추적한다 —
배포된 검증자의 정본 규격이며, zkey 없이도 증명을 *검증* 할 수 있다.

phase-1 Powers of Tau 는 **1인 로컬 = 데모용**. 프로덕션은 검증된 커뮤니티 ptau 를
`ptau/pot<power>_final.ptau` 로 넣으면 재사용된다.

**향후과제**: `snarkjs zkey beacon` 으로 공개 비콘값(셋업 이후 시점의 블록 해시 등)을 써서
마무리하면 재현 가능하면서도 건전하다. 실제 대형 세리머니가 쓰는 방식이다.

## 관련

- `../contract` — 검증자와 발급 컨트랙트. `release.mjs` 가 이쪽으로 내보낸다.
- `../SECURITY.md` — 2026-09-06 회로 취약점 분석과 수정 내역.
