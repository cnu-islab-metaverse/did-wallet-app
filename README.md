# did-wallet-app — DID·SBT 통합 관리 지갑 (연구과제 실증)

**ICT R&D 과제 RS-2023-00229400 — "안전한 메타버스 아바타를 위한 사용자 인증 및 프라이버시 보호 기술개발"** (충남대학교)
의 목표 시나리오를 실증하기 위한 프로젝트입니다.

이 저장소는 그 실증의 **신원·자격증명 축**을 담당합니다:

> **현실 신원 기반으로 발급된 자격증명을, 프라이버시를 보존하며(ZK) 검증해 온체인 SBT로 발급**하고,
> 그 SBT를 **DID·SBT 통합 지갑**으로 관리한다.

발급된 SBT는 형제 저장소 **`metaverse-world`**(같은 상위 경로)에서
**아바타(블록체인 계정 단위)의 서비스 접근 제어**에 쓰입니다. 두 저장소가 함께 과제의 전체 시나리오를 구성합니다.

```
   [현실 신원]                                              [메타버스: metaverse-world]
       │                                                          ▲
       ▼                                                          │ SBT 보유로 아바타 접근 제어
┌─────────────┐   VC    ┌────────────────┐   mintPass(증명)   ┌──────────────────┐
│ 오프체인 발급 │ ──────▶ │  DID·SBT 지갑    │ ─────────────────▶ │ ZKCredentialSBT  │
│ issuer-web   │  서명   │ wallet/{core,   │  조건만 공개        │ (소울바운드 발급)  │
│ cnu-issuer   │         │  desktop}       │                    └────────┬─────────┘
└─────────────┘         │ VC 보관 + 증명생성│                             │ verifyProof
       │                └────────────────┘                    ┌────────▼─────────┐
       │                  증명은 메인 프로세스에서              │ *Verifier        │
       │                  (zkey 36MB, ~3초)                    │ (회로 산출물)     │
       └─────────────── circuits (circom+snarkjs, Groth16) ────┴──────────────────┘
```

---

## 구성 모듈

| 경로 | 역할 | 스택 |
|---|---|---|
| **`wallet/core/`** | 지갑 공통 코어(로직·상태·UI 프리미티브). 데스크톱이 사용하는 단일 소스 | React 18 |
| **`wallet/desktop/`** | **지갑 본체** — 실제 설치되는 앱. 키·저장·승인이 여기서만 일어난다 (`core` 사용) | Electron + Vite |
| **`wallet/extension/`** | **브라우저 연결지점** — 지갑의 다른 형태가 아니라, 설치된 본체에 웹을 물려주는 중계자. 요청만 넘기고 키는 갖지 않는다 | Chrome Extension |
| **`issuer-web/`** | **오프체인 발급기관** — 주민/거주 신원 확인 후 Identity VC 발급 | Express + static UI |
| **`cnu-issuer-web/`** | **오프체인 발급기관(충남대)** — 학적 DB 기반 졸업/재학 VC 발급 | Express |
| **`verifier-web/`** | **온체인 검증자 프론트** — VP 수신(`/submit-vp`) → 검증 → `mintPass` 호출 | Express + Vite |
| **`contract/`** | 온체인 컨트랙트 — 시나리오별 [`*PassSBT`(ERC-721+ERC-5192 소울바운드) → `*Verifier`(Groth16)] 2쌍 | Foundry (Solidity) |
| **`circuits/`** | **ZK 핵심 뼈대** — 조건 증명 회로(지방거점국립대 재학/졸업, 지역청년패스=대전 거주+만19~34세) 로컬 빌드/검증, `Verifier.sol` 산출 | circom + snarkjs |

> 심화 문서: 지갑 코어는 `wallet/core/`, ZK 회로 파이프라인은 [`circuits/README.md`](circuits/README.md), 컨트랙트는 `contract/`.
>
> `wallet/` 은 **yarn 워크스페이스**(멤버: `core`·`desktop`)로, 자기 `node_modules` 와 lockfile 을 소유한다.
> `wallet/extension` 은 워크스페이스 **밖**의 독립 pnpm 프로젝트다(`workspace:*` 의존성과 turbo 그래프 때문에 pnpm 이 구조적으로 필요).

## 엔드투엔드 시나리오

1. **발급** — 발급기관(`issuer-web` 거주 / `cnu-issuer-web` 학적)이 현실 신원을 확인하고 **서명된 VC**를 발급.
2. **보관** — 홀더가 지갑(`desktop`/`ext`, 코어 `src/`)에 VC를 보관.
3. **증명(VP)** — 혜택/접근 요청 시, 지갑이 원본 VC를 노출하지 않고 **조건만 증명하는 ZK 증명**을 만들어 VP로 제출. (회로: `circuits/scenarios/*.circom`)
4. **검증·발급** — 지갑이 `*PassSBT.mintPass`를 호출(또는 `verifier-web` 경유). 컨트랙트가 `*Verifier.verifyProof` + 제출자 바인딩(`msg.sender==walletAddress`) + 시점 검사를 통과해야만 **소울바운드 SBT** 발급.
5. **활용** — 발급된 SBT를 `metaverse-world`가 읽어 **아바타(블록체인 계정)의 서비스 접근을 제어**.

## 구현 현황 (정확 기준)

| 요소 | 상태 | 비고 |
|---|---|---|
| ZK 회로 (`circuits/`) | **완료** | 기관별 샘플 VC(주민등록증·졸업증명서) → 서명 → 증명·검증 완결. 공개신호 `[currentDate, walletAddress]`. 2026-09-06 건전성 취약점 수정([SECURITY.md](SECURITY.md)) |
| 온체인 컨트랙트 (`contract/`) | **Sepolia 배포됨 (v2)** | 범용 `ZKCredentialSBT` 1개 + 검증자를 패스 타입으로 등록. `forge test` **19건** 통과(위조 증명 거부 회귀 테스트 포함) |
| 발급기관 앱 (`issuer-web`/`cnu-issuer-web`) | **회로 연동 완료** | 양쪽 `services/vcsign.ts` 가 `circuits/witness.mjs` 와 동일한 SMT 구성 + EdDSA 서명을 수행하고 `issue.ts` 발급 흐름에 배선됨 |
| `verifier-web` `/submit-vp` | **비-ZK 스텁 (미사용 경로)** | VC 의 거주지를 **평문 문자열 매칭**할 뿐 `groth16.verify` 를 호출하지 않는다. 지갑이 직접 발급하게 되면서 이 경로는 쓰이지 않는다 — 실검증 전환 또는 역할 재정의 필요 |
| 지갑 증명 모듈 (`wallet/`) | **구현 완료** | 메인 프로세스에서 `fullProve` → `mintPass` 직접 호출. 지갑에서 온체인 발급 성공 확인 |
| 메타버스 연동 (`metaverse-world`) | **연결됨** | 씬이 `hasValidPass(보유자, passType)` 로 **유효한** 보유만 인정(만료 구분) |

## 배포 (Sepolia, 2026-09-06 · v2)

| | 주소 |
|---|---|
| `ZKCredentialSBT` | `0x11AbB46d6099D541e544Ac8bB38820046de6D797` |
| `YouthPassVerifier` | `0x0d0ddb95EfB56b9770Da92B937b3303154484318` (passType 1, 365일) |
| `RegionalUnivVerifier` | `0x956F42f94ECDf9f9CD20086E7AFEB88572246883` (passType 2, 무기한) |

v1(`0xF66B3b93…`)은 회로 취약점으로 폐기했다 — [SECURITY.md](SECURITY.md).

### A2 바인딩이 보장하는 것

컨트랙트가 `msg.sender == pubSignals[1]` 을 확인한다(국내특허 2025-1-328-KR).
이는 **증명(VP)을 지갑에 묶는다** — 가로챈 증명을 다른 계정이 사용할 수 없다.

**자격증명(VC) 자체는 소지자 토큰이다.** `walletAddress` 는 서명된 데이터에 들어 있지 않으므로,
VC 파일을 입수한 사람은 자기 주소로 새 증명을 만들 수 있다. 이는 발급 시점에 발급기관이
지갑주소를 모르게 하는 프라이버시 설계의 대가다. 홀더 바인딩 방안은 SECURITY.md 참고.

## 개발 / 실행

전제: Node.js ≥ 18. 패키지 매니저 — **`wallet/`(core+desktop)=yarn 워크스페이스**, `wallet/extension`=pnpm, `contract`=npm, 그 외 서비스는 yarn.
지갑 최초 설치는 `wallet/` 에서 한 번: `npm run install:wallet` (또는 `cd wallet && yarn install`).

```bash
# 지갑 (루트 aggregate)
npm run dev            # ext(pnpm dev) + desktop(yarn dev) 동시
npm run dev:desktop    # 데스크톱만
npm run dev:ext        # 확장만 (dist 빌드 후 chrome://extensions 에서 unpacked 로드)

# 발급/검증 서비스
npm run dev:issuer     # issuer-web  (기본 http://localhost:20251)
npm run dev:verifier   # verifier-web

# ZK 회로  (circuits/)
cd circuits && yarn sign && yarn verify youth_pass   # 상세: circuits/README.md

# 컨트랙트  (contract/)
cd contract && forge build && forge test
```

### 알려진 불일치

- 루트 `package.json`의 `*:metaverse` 스크립트(`dev:metaverse` 등)는 **존재하지 않는 `metaverse-web/`**를 가리킵니다. 해당 메타버스 코드는 형제 저장소 **`metaverse-world`로 분리**되었습니다 — 이 스크립트들은 정리 대상입니다.
- `cnu-issuer-web`·`circuits`·`contract`는 루트 aggregate 스크립트에 아직 연결돼 있지 않습니다(각 폴더에서 직접 실행).

## 보안 주의

지갑은 개인키·서명 등 민감 연산을 다룹니다. `circuits/`의 테스트 발급기관 키·엔트로피는 **데모 전용 하드코딩**이며 실사용 금지입니다. 로컬 Powers of Tau 역시 **1인 = 데모용**이고, 배포 시 공개 Powers of Tau + 다자 세리머니로 대체해야 합니다.

## 라이선스

Private / proprietary. All rights reserved.
