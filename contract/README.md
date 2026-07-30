# contract — ZK 검증 기반 소울바운드 패스 SBT (Foundry)

자격 조건을 ZK(circom+Groth16)로 증명하면 온체인에서 **소울바운드 SBT**를 발급하는 컨트랙트.
증명 회로는 `../circuits`, 발급된 SBT는 `../`(지갑) 및 `metaverse-world`(아바타 접근 제어)가 사용한다.

## 구조 — [발급 SBT(앞) → 검증 Verifier(뒤)] × 2 시나리오

```
사용자 지갑 ──mintPass(proof, [currentDate, walletAddress], tokenURI)──▶ 발급 SBT ──verifyProof──▶ 검증 Verifier
```

| 시나리오 | 발급 SBT (앞) | 검증 Verifier (뒤) | 대응 회로 |
|---|---|---|---|
| 지역청년패스(대전 거주+만19~34세) | `YouthPassSBT` | `YouthPassVerifier` | `circuits youth_pass` |
| 지방거점국립대 재학/졸업(유효기간 내) | `RegionalUnivPassSBT` | `RegionalUnivVerifier` | `circuits regional_national_univ` |

- **표준**: `SoulboundPass`(공통 베이스)가 **ERC-721 + ERC-5192**(`IERC5192`, 양도불가 잠금) 구현. 두 SBT가 상속.
- **발급 검사**(공개신호 `[currentDate(YYYYMMDD), walletAddress]`):
  1. `verifier.verifyProof(...)` — ZK 증명
  2. `msg.sender == walletAddress` — 제출자 바인딩(A2). 도난 VP 타계정 사용 차단
  3. `currentDate ≈ block.timestamp`(KST 변환, 어제까지 허용) — 시점 무결성(과거날짜로 나이·만료 우회 차단)
- **일회성**: 주소당 1토큰(`addressToTokenId`, 재제출 시 URI 갱신). nullifier 미사용(다중 아바타 허용).
- 검증 Verifier 2종은 **회로 산출물**(`snarkjs exportsolidityverifier`) — 직접 수정 금지, 회로 변경 시 재복사.

## 빌드 / 테스트

```bash
forge build
forge test -vv     # 실제 회로 증명(circuits/vc.json 기반)으로 온체인 발급까지 검증
```

테스트(`test/Passes.t.sol`)는 고정 증명 calldata + `vm.warp`(2026-07-27 KST)로 정상발급·A2거부·시점거부·
허용오차·잘못된증명거부·전송거부·표준지원을 확인한다.

## 배포

```bash
forge script script/DeployPasses.s.sol:DeployPasses --rpc-url <RPC> --private-key <KEY> --broadcast
```

Verifier→SBT 쌍 2개를 CREATE2 로 배포(새 버전은 salt 변경). 출력된 주소를 아래에 반영한다.

### 배포 후 갱신 필요 (재배포 시 주소 변경)

- `verifier-web/src/config/deployment.config.js` — SBT/Verifier 주소
- `contract/QUERY.md`, `contract/scripts/query-sbt.js` — 조회 대상 주소·컨트랙트명(`mintSBT`→`mintPass`, `CityYouthPassSBT`→`YouthPassSBT`/`RegionalUnivPassSBT`)

## 증명 calldata 생성 (테스트/데모용)

`../circuits` 에서 witness→`groth16.fullProve`→`snarkjs.groth16.exportSolidityCallData` 로
`[pA, pB, pC, pubSignals]` 를 출력해 컨트랙트/테스트에 넣는다. (공개신호=`[currentDate, walletAddress]`)
