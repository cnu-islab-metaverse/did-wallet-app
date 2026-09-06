# contract — ZK 검증 기반 소울바운드 자격증명 SBT (Foundry)

자격 조건을 ZK(circom+Groth16)로 증명하면 온체인에서 **소울바운드 SBT**를 발급하는 컨트랙트.
증명 회로는 `../circuits`, 발급된 SBT는 `../wallet`(지갑) 및 `metaverse-world`(아바타 접근 제어)가 사용한다.

## 구조 — 범용 발급자 1개 + 시나리오별 검증자 N개

```
지갑 ──mintPass(passType, proof, [currentDate, walletAddress], tokenURI)──▶ ZKCredentialSBT
                                                                              │
                                              passType → verifier 레지스트리 ──┴──▶ *Verifier.verifyProof
```

| 파일 | 역할 |
|---|---|
| **`ZKCredentialSBT.sol`** | **범용 발급자.** ERC-721 + ERC-5192(양도불가). 시나리오는 "패스 타입"으로 등록해 붙인다 |
| `IZKVerifier.sol` | 검증자 공통 인터페이스. 공개신호 = `[currentDate, walletAddress]` |
| `YouthPassVerifier.sol` | 지역청년패스(대전 거주 + 만 19~34세) — 회로 `youth_pass` 산출물 |
| `RegionalUnivVerifier.sol` | 지방거점국립대 재학/졸업 — 회로 `regional_national_univ` 산출물 |

검증자 2종은 **회로 산출물**(`snarkjs exportsolidityverifier`) — 직접 수정 금지.
회로를 고쳤으면 `cd ../circuits && yarn build <name> && node release.mjs` 를 돌린다.
`release.mjs` 가 `Verifier.sol` 복사와 테스트 픽스처 생성을 **함께** 하므로 둘이 어긋날 수 없다.

### 왜 시나리오마다 컨트랙트를 만들지 않는가

데모 계획서(`연구과제산출물/메타버스 권한관리 실증 데모 계획`)의 확장 시나리오가 DAO 투표권·기간제한
입장권·지역 기반·직업/소속 인증으로 계속 늘어난다. 시나리오마다 SBT 를 새로 배포하면 그때마다
배포와 메타버스 씬의 주소 목록 갱신이 따라붙는다. 검증자만 모듈로 붙이면 **SBT 주소는 하나로 고정**된다.

> 참고: `metaverse-world` 의 `MetaverseSBTs`(MVC)는 `mintCredential(to, typeId) onlyOwner` 로
> **운영자가 중앙 발급**하는 자리표시자다. 이 저장소의 `ZKCredentialSBT` 는 ZK 증명 없이는
> 누구도(소유자조차) 발급할 수 없다는 점이 다르다.

## 발급 검사 (3중)

공개신호 `[currentDate(YYYYMMDD), walletAddress]` 기준:

1. `verifier.verifyProof(...)` — 해당 패스 타입에 등록된 회로 검증자
2. `msg.sender == walletAddress` — **제출자 바인딩(A2)**. 도난 **VP**(증명)를 다른 계정에서 쓰지 못하게 막는다.
   VC 자체는 소지자 토큰이라는 점은 별개다 — `../SECURITY.md` 참고
   (국내특허 2025-1-328-KR「블록체인 지갑 주소 바인딩 기반 영지식 증명 인증 시스템」)
3. `currentDate ≈ block.timestamp`(KST 변환, 어제까지 허용) — 과거 날짜로 나이·만료를 우회하지 못하게

발급 단위는 **(보유자, 패스 타입) 조합당 1토큰**. 같은 타입을 재증명하면 새 토큰이 아니라
tokenURI 와 유효기간이 **갱신**된다. nullifier 는 쓰지 않는다(다중 아바타 허용).

## 패스 타입 레지스트리 (모듈 부착·분리)

```solidity
registerPassType(uint256 passType, address verifier, uint64 validitySeconds)  // onlyOwner, 추가 전용
retirePassType(uint256 passType)                                             // onlyOwner, 신규 발급만 중단
```

- **추가 전용**: 이미 등록된 타입의 검증자는 덮어쓸 수 없다. 발급이 이뤄진 뒤에 운영자가
  "무엇을 증명해야 하는지"를 바꿔치기하는 경로를 원천 차단한다.
- **폐지**는 신규 발급만 막고 기존 보유분의 검증 의미는 건드리지 않는다.
- 모든 등록·폐지는 `PassTypeRegistered` / `PassTypeRetired` 이벤트로 온체인에 남는다.

현재 등록되는 타입(`script/DeployZKCredentialSBT.s.sol`):

| passType | 시나리오 | 검증자 | 유효기간 |
|---|---|---|---|
| `1` | 지역청년패스 | `YouthPassVerifier` | 365일 (나이 조건은 해마다 재증명) |
| `2` | 지방거점국립대 | `RegionalUnivVerifier` | 무기한 (`0`) |

## 유효기간 / 조회

데모 계획서의 "기간 기반 SBT 만료 처리 — 유효기간이 지난 SBT 의 사용 불가" 요구사항.

```solidity
isValid(uint256 tokenId) → bool                       // 존재 + 만료 전
hasValidPass(address holder, uint256 passType) → bool  // 메타버스 접근 제어 진입점
```

만료돼도 토큰을 소각하지 않는다 — 보유 이력은 남고 `isValid` 만 false 가 된다.

## 빌드 / 테스트

```bash
forge build
forge test -vv     # 실제 회로 증명(circuits/vc/*.json 기반)으로 온체인 발급까지 검증
```

`test/ZKCredentialSBT.t.sol` 은 `test/fixtures/proofs.json`(circuits/release.mjs 생성)을 읽어 **19건**을 확인한다:
정상발급 2종 · A2거부 · 시점거부 · 허용오차 · 잘못된증명거부 · 전송거부 · 표준지원 ·
타입교차보유 · 재증명갱신 · 만료 · 무기한 · 미등록타입 · 재등록거부 · 비소유자등록거부 · 폐지 · 미보유조회.

## 배포

```bash
forge script script/DeployZKCredentialSBT.s.sol:DeployZKCredentialSBT \
  --rpc-url <RPC> --private-key <KEY> --broadcast
```

발급자 1개 + 검증자 2개를 배포하고 패스 타입 2종을 등록한다.

> **주의**: CREATE2(`new X{salt:}`)를 쓰지 않는다. CREATE2 로 올리면 생성자의 `msg.sender` 가
> 배포 팩토리가 되어 소유권이 팩토리로 잡히고 `registerPassType` 을 영영 호출할 수 없다.
> 그래서 소유자를 생성자 인자로 명시한다.

**Sepolia v2 (2026-09-06)** — v1(`0xF66B3b93…`)은 회로 취약점으로 폐기(`../SECURITY.md`).

| | 주소 |
|---|---|
| `ZKCredentialSBT` | `0x11AbB46d6099D541e544Ac8bB38820046de6D797` |
| `YouthPassVerifier` | `0x0d0ddb95EfB56b9770Da92B937b3303154484318` |
| `RegionalUnivVerifier` | `0x956F42f94ECDf9f9CD20086E7AFEB88572246883` |

### 배포 후 갱신 필요

- `wallet/core/config/deployment.config.ts` · `verifier-web/src/config/deployment.config.js` — SBT·검증자 주소
- `contract/QUERY.md` — 아직 구버전(정리 대상). `scripts/query-sbt.js` 는 설정 파일을 import 하므로 자동 반영된다
- (별도 저장소) `metaverse-world/metaverse-scene/blockchain/tokenService.ts` 의 `Credentials/BADGE`
  주소를 새 `ZKCredentialSBT` 로 바꿔야 씬이 ZK 발급분을 읽는다

### 새 시나리오 추가

1. `../circuits` 에서 회로 작성 → `yarn build <name>` → `node release.mjs` (Verifier.sol 자동 복사)
2. 새 검증자 배포
3. 이미 배포된 `ZKCredentialSBT` 에 `registerPassType(newType, newVerifier, validity)` 호출

SBT 주소도, 메타버스 씬의 설정도 그대로다.

## 증명 calldata 생성 (테스트/데모용)

`../circuits` 에서 witness → `groth16.fullProve` → `snarkjs.groth16.exportSolidityCallData` 로
`[pA, pB, pC, pubSignals]` 를 출력해 컨트랙트/테스트에 넣는다. (공개신호=`[currentDate, walletAddress]`)
