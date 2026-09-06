# 보안 — ZK 회로 건전성 취약점 (2026-09-06, 수정 완료)

테스트 픽스처를 배포본과 맞추려고 감사하던 중 발견했다. **자격증명 없이 유효한 증명을 만들 수
있었고, 그것이 Sepolia 에 배포된 검증자에서 통과했다.** 즉 과제의 핵심 주장("ZK 증명을 통과해야만
SBT 가 발급된다")이 당시 배포 상태에서 성립하지 않았다.

발견·수정·재배포를 같은 날 마쳤다. 이 문서는 그 내역이다.

---

## 1. 무엇이 문제였나

`circuits/scenarios/` 의 두 회로가 circomlib 컴포넌트의 **스위치 입력을 제약 없는 자유 입력으로**
두고 있었다. circomlib 의 `SMTVerifier` 와 `EdDSAPoseidonVerifier` 는 그 값을 그대로 신뢰한다.

| 신호 | 제약 없을 때 |
|---|---|
| `enabled_residence` · `enabled_birthDate` | `0` → SMT 포함증명이 **통째로 꺼진다**(`ForceEqualIfEnabled`) |
| `enabled_eddsa` | `0` → 발급기관 서명 검증이 **통째로 꺼진다** |
| `fnc_*` | `1` → 비포함(non-inclusion) 모드로 바뀌어 `value` 가 자유로워진다 |
| `key_*` | 자유 → 클레임 슬롯이 서로 바뀌어 쓰인다 |

회로에 있던 제약은 `Ax === issuerAx()`, `Ay === issuerAy()`, 조건 비교(거주=30, 나이 범위)뿐이었다.
발급기관 공개키를 상수와 비교하는 것은 **서명을 검증하지 않으면 아무 의미가 없다** — 공개키는
자유 입력이므로 상수를 그대로 써넣으면 통과한다.

### 부수적 위험: 코드 공간 충돌

`key_*` 를 묶지 않은 것이 특히 위험했다. 두 코드 체계가 같은 정수를 쓰기 때문이다.

| 값 | 대학 학교코드 | 법정동 시도코드 |
|---|---|---|
| 27 | 제주대학교 | 대구광역시 |
| 29 | 충남대학교 | 광주광역시 |
| **30** | **충북대학교** | **대전광역시** (`daejeonCode()`) |

슬롯이 고정되지 않으면 충북대 증명서의 `university` 리프(값 30)를 residence 슬롯에 넣어
**진짜 서명을 유지한 채** "대전 거주"를 증명할 수 있다.

---

## 2. 실증

### 로컬

`enabled_*` 를 모두 0 으로 두고, `root` 에 임의값(`7777777`)을 넣고, 조건값을 직접 지정했다.

```
enabled_residence = 0, enabled_birthDate = 0, enabled_eddsa = 0
root              = 7777777            ← 어떤 자격증명에도 대응하지 않는 값
value_residence   = 30                 ← "대전 거주"
value_birthDate   = 19980310           ← 나이 조건 충족
walletAddress     = 0x…dEaD            ← 공격자 임의 주소
```

`groth16.fullProve` 성공 → `groth16.verify` **`true`**.

### 온체인

같은 증명을 배포된 `YouthPassVerifier`(Sepolia `0x2cEfc1eb31A6b75A4c40b4c8111Ef6998304ee59`)의
`verifyProof` 에 `eth_call` 했다.

```
result: 0x0000…0001   →  true
```

컨트랙트의 나머지 검사(A2 바인딩, 시점 무결성)는 공격자가 자기 주소와 오늘 날짜를 넣으면
그대로 충족된다. **누구나 증명서 없이 지역청년패스 SBT 를 발급받을 수 있는 상태였다.**

---

## 3. 봉쇄

발견 직후, 수정 작업을 시작하기 전에 v1 컨트랙트
(`0xF66B3b93b5FeC7f8Bd169dcd3589bf45c673E021`)의 취약한 패스 타입을 폐지했다.

```
retirePassType(1)  tx 0xd6056da68d3404cdc4731a89e8ceeb1818425b1760c4c274ff30fdb6efd6e3c1
retirePassType(2)  tx 0xd0359cca77f3fe5f2f560f7b6ce87d596eb962019e54d60a1de94d02205335d5
```

이후 위조 증명으로 발급을 시도하면 `Pass type retired` 로 거부된다.

> `retirePassType` 은 신규 발급만 막고 **기존 토큰의 유효성은 건드리지 않는다.** 따라서 취약
> 회로로 발급된 v1 의 tokenId 1 은 남아 있다. 컨트랙트에 burn 이 없는 것은 의도적 선택이다 —
> 운영자가 임의로 자격증명을 회수하는 경로를 열지 않기 위해서다. v2 에는 그런 토큰이 없다.

---

## 4. 수정

두 회로에 각각 다음을 추가했다.

```circom
enabled_<claimA> === 1;   fnc_<claimA> === 0;   key_<claimA> === claimKey<A>();
enabled_<claimB> === 1;   fnc_<claimB> === 0;   key_<claimB> === claimKey<B>();
enabled_eddsa    === 1;
```

클레임 슬롯 번호는 `scenarios/_registry.circom` 에 함수로 두어 `witness.mjs` 의 `CLAIM_KEY` 와
짝을 이루게 했다(회로에 숫자를 직접 박으면 같은 사실의 네 번째 사본이 된다).

`oldKey_*`·`oldValue_*`·`isOld0_*` 는 제약하지 않았다. `fnc=0`·`enabled=1` 이면 circomlib 내부에서
`st_iold ≡ 0` 이 되어 무력화되고, 종단 제약이 `isOld0 === 0` 을 함의한다.

함께 넣은 것:

- **`Num2Bits(160)(walletAddress)`** — 기존의 `waSquared` 더미 제약을 대체. 컨트랙트가
  `address(uint160(pubSignals[1]))` 로 절단하므로 정규 인코딩을 강제한다.
- **`Num2Bits(32)`** 범위 검사(비교기 입력). 서명된 값이라 현재 악용 경로는 없다 —
  **방어 심화이지 취약점 수정이 아니다.**

---

## 5. 검증

### 반증 — 세 공격 경로가 모두 막혔다

증명 생성 단계(witness 계산)에서 실패하므로 증명을 **만들 수조차 없다.**

| 시도 | 결과 |
|---|---|
| `enabled_eddsa = 0` | `Assert Failed. YouthPass line 85` |
| `fnc_residence = 1` | `Assert Failed. ForceEqualIfEnabled line 56` |
| `key_residence = 3` | `Assert Failed. ForceEqualIfEnabled line 56` |

### 정상 동작 회귀 없음

`youth_pass` · `regional_national_univ` 모두 `검증 결과: true`.
만료된 재학증명서는 여전히 거부된다(`RegionalNationalUniv` 의 `validUntil` 검사).

### 온체인 — 같은 위조 증명, 두 검증자

```
구(v1) 0x2cEfc1eb…  →  true    ← 자격증명 없이 통과했다
신(v2) 0x0d0ddb95…  →  false   ← 거부
```

### 회귀 테스트

`contract/test/ZKCredentialSBT.t.sol` 의 `test_RevertWhen_ForgedProofFromBrokenCircuit` 가
그 위조 증명을 새 검증자에 넣어 `Invalid proof` 를 확인한다. 위조 증명은
`contract/test/fixtures/proofs.json` 에 보존된다 — **재생성할 수 없다**(그 zkey 는 폐기됐다).

---

## 6. 재배포

회로가 바뀌면 검증키가 바뀌므로 검증자를 새로 배포해야 한다. 레지스트리가 **추가 전용**이라
배포된 컨트랙트에서 passType 1·2 의 검증자를 교체할 수 없다.

이는 제약이 아니라 설계 보증이다 — *배포된 컨트랙트에서 "무엇을 증명해야 하는지"는 사후에
바뀌지 않는다.* 교체가 가능했다면 "운영자가 나중에 검증 조건을 느슨하게 바꿀 수 있지 않나"에
답할 수 없다. 따라서 유일한 경로는 새 컨트랙트 배포이며, **anti-rug 설계가 의도대로 동작한
결과**다.

```
Sepolia v2 (2026-09-06)
  ZKCredentialSBT      0x11AbB46d6099D541e544Ac8bB38820046de6D797
  YouthPassVerifier    0x0d0ddb95EfB56b9770Da92B937b3303154484318   passType 1, 365일
  RegionalUnivVerifier 0x956F42f94ECDf9f9CD20086E7AFEB88572246883   passType 2, 무기한
```

정상 발급 확인: tx `0x88591d3ee9951fae22d0985ec176055a84242b161f098b958e7856542b1b5567`.

---

## 7. 왜 이 문제가 살아남았나 — 방법론 측면

발견 시점까지 **부정 테스트가 하나도 없었다.** 컨트랙트 테스트 17건은 전부 "정상 동작"과
"잘못된 입력 형식"을 확인했고, 회로 수준 테스트는 아예 없었다. `test_RevertWhen_InvalidProof`
조차 `pA = [1,2]` 라는 **망가진 점**을 넣었을 뿐 위조 증명이 아니었다.

건전성을 핵심 주장으로 하는 시스템에 "위조가 거부되는가"를 묻는 테스트가 없었다는 것이,
이 버그가 살아남은 이유다. 수정과 함께 두 층 모두에 부정 검증을 넣었다.

또한 이 사고는 **같은 사실이 여러 곳에 복제되어 있던 문제**와 겹쳐 있었다. 테스트의 고정 증명은
옛 지갑 주소에 묶인 스냅샷이었는데 샘플 VC 는 다른 주소를 가리켰고, 테스트 주석은 둘이 같다고
주장했다. `circuits/release.mjs` 가 검증자와 픽스처를 한 명령으로 만들도록 바꿔 이 부류의
드리프트를 구조적으로 제거했다.

---

## 8. 남아 있는 한계 (알고 있으며 문서화한다)

### A2 바인딩이 보장하는 것과 아닌 것

컨트랙트의 `msg.sender == pubSignals[1]` 검사(국내특허 2025-1-328-KR)는
**증명(VP)을 지갑에 묶는다.** 멤풀에서 가로챈 증명, 중계 서버가 기록한 증명, VP 페이로드에서
빼낸 증명을 **다른 계정이 사용할 수 없다.** 이 성질은 유효하다.

**자격증명(VC) 자체는 소지자 토큰(bearer)이다.** `walletAddress` 는 서명된 SMT 에 들어 있지
않으므로, VC 파일을 입수한 사람은 자기 주소로 새 증명을 만들 수 있다. 이는 발급 시점에
발급기관이 지갑주소를 알지 못하게 하는(발급–온체인 비연결성) 프라이버시 설계의 대가다.

> 문서에 "도난 **VP** 를 다른 계정에서 사용 불가"는 정확하다.
> "도난 **VC**"로 읽히게 쓰지 않는다.

홀더 바인딩이 필요하면 홀더가 고른 BabyJubJub 공개키를 SMT 에 넣고 회로에 EdDSA 를 하나 더
추가하면 된다(발급기관은 여전히 이더리움 주소를 모른다). 제약 +4k 규모의 별건이다.

### 발급기관이 하나다

`_registry.circom` 의 `issuerAx/issuerAy` 는 **단일 키**이고, 데모의 6개 발급기관이 이를 공유한다.
EdDSA 메시지가 SMT root 뿐이라 **증명서 종류도 서명에 들어가지 않는다.** 따라서 회로는
"이 키로 서명된 어떤 증명서"까지만 구분하고, 발급기관별 권한 범위를 강제하지 못한다.

현재 시드 데이터에서는 교차가 실제로 발생하지 않는다 — 행정안전부 주민등록증과 경찰청
운전면허증은 둘 다 주소·생년월일을 담은 신분증이고(청년패스 증명에 정당하다), 충남대 증명서는
학적만 담는다. 노출 사례였던 "대학이 거주를 증명하는" 샘플 VC 는 기관별로 분리해 제거했다.

**향후과제**: `CLAIM_KEY` 에 `credentialType` 을 추가해 회로가 증명서 종류를 확인하고,
단일 키를 발급기관별 키의 화이트리스트(one-hot)로 바꾼다.

### 트러스티드 셋업

phase-1 Powers of Tau 가 1인 로컬 세리머니다. `snarkjs zkey beacon` 으로 공개 비콘값을 써서
마무리하는 것이 정석이며, 재현성까지 함께 얻는다. → `circuits/README.md`

---

## 타임라인

| | |
|---|---|
| 발견 | 픽스처 정합성 감사 중, 회로 소스 판독 |
| 실증 | 로컬 위조 증명 생성 → 배포 검증자 `eth_call` = `true` |
| 봉쇄 | v1 passType 1·2 `retirePassType` |
| 수정 | 회로 제약 추가 · 샘플 VC 분리 · 재빌드 |
| 검증 | 반증 3종 · 정상 회귀 · 온체인 대조 |
| 재배포 | v2 + 주소 전파(지갑·검증자·메타버스 씬) |
