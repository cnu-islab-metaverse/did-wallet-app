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
┌─────────────┐   VC    ┌──────────────┐  VP(ZK증명)  ┌───────────────┐  mintSBT  ┌──────────────┐
│ 오프체인 발급 │ ──────▶ │  DID·SBT 지갑 │ ──────────▶ │  온체인 검증자  │ ────────▶ │  온체인 컨트랙트 │
│ issuer-web   │  서명   │ src/desktop/ext│  조건만 공개 │  verifier-web  │  검증 통과 │ CityYouthPass  │
│ cnu-issuer   │         │ (VC 보관·증명)  │             │               │           │ SBT(소울바운드) │
└─────────────┘         └──────────────┘             └───────────────┘           └──────────────┘
       │                                                     ▲                            │
       └─────────────── circuits (ZK 회로 뼈대) ─────────────┘   Verifier.sol ────────────┘
                         circom+snarkjs, Groth16                (DaejeonYouthVerifier)
```

---

## 구성 모듈

| 경로 | 역할 | 스택 |
|---|---|---|
| **`src/`** | 지갑 공통 코어(공유 컴포넌트·로직). 데스크톱/확장이 함께 사용하는 단일 소스 | React 19 |
| **`desktop/`** | 데스크톱 지갑 앱 (`src/` 코어 사용) | Electron + Vite |
| **`ext/`** | 크롬 확장 지갑 (`src/` 코어를 `shared-src` 심링크로 공유) | Chrome Extension |
| **`issuer-web/`** | **오프체인 발급기관** — 주민/거주 신원 확인 후 Identity VC 발급 | Express + static UI |
| **`cnu-issuer-web/`** | **오프체인 발급기관(충남대)** — 학적 DB 기반 졸업/재학 VC 발급 | Express |
| **`verifier-web/`** | **온체인 검증자 프론트** — VP 수신(`/submit-vp`) → 검증 → `mintSBT` 호출 | Express + Vite |
| **`contract/`** | 온체인 컨트랙트 — `CityYouthPassSBT`(소울바운드 ERC-721) + `DaejeonYouthVerifier`(Groth16 Verifier) | Foundry (Solidity) |
| **`circuits/`** | **ZK 핵심 뼈대** — 조건 증명 회로(지방거점국립대 재학/졸업, 지역청년패스=대전 거주+만19~34세) 로컬 빌드/검증, `Verifier.sol` 산출 | circom + snarkjs |

> 심화 문서: 지갑 코어는 `src/`, ZK 회로 파이프라인은 [`circuits/README.md`](circuits/README.md), 컨트랙트는 `contract/`.

## 엔드투엔드 시나리오

1. **발급** — 발급기관(`issuer-web` 거주 / `cnu-issuer-web` 학적)이 현실 신원을 확인하고 **서명된 VC**를 발급.
2. **보관** — 홀더가 지갑(`desktop`/`ext`, 코어 `src/`)에 VC를 보관.
3. **증명(VP)** — 혜택/접근 요청 시, 지갑이 원본 VC를 노출하지 않고 **조건만 증명하는 ZK 증명**을 만들어 VP로 제출. (회로: `circuits/scenarios/*.circom`)
4. **검증·발급** — `verifier-web`이 VP를 받아 증명을 검증하고 `CityYouthPassSBT.mintSBT`를 호출. 컨트랙트가 `DaejeonYouthVerifier.verifyProof`로 온체인 검증을 통과해야만 **소울바운드 SBT** 발급.
5. **활용** — 발급된 SBT를 `metaverse-world`가 읽어 **아바타(블록체인 계정)의 서비스 접근을 제어**.

## 구현 현황 (정확 기준)

| 요소 | 상태 | 비고 |
|---|---|---|
| ZK 회로 뼈대 (`circuits/`) | **동작** | 단일 `vc.json` → 발급 서명 → 증명·검증 로컬 완결. 두 시나리오 통과. `Verifier.sol` 산출 |
| 발급기관 앱 (`issuer-web`/`cnu-issuer-web`) | **동작(발급 UI/DB)** | 아직 `circuits`의 발급기관 서명 로직과 **미통합** |
| 온체인 컨트랙트 (`contract/`) | **배포됨(Sepolia)** | `verifier-web/src/config/deployment.config.js` 참조 |
| `verifier-web` `/submit-vp` | **스텁** | 현재 VC의 거주지 **문자열 매칭**만 수행 — 실제 `groth16.verify`/온체인 `verifyProof` 호출은 미구현 |
| 회로 ↔ 온체인 정합 | **미완** | 현재 회로 `nPublic=0` vs 배포된 `DaejeonYouthVerifier`는 `uint[5]` 공개신호 기대. 제출자 바인딩/재사용 방지 설계 확정 후 정합 필요 |

## 개발 / 실행

전제: Node.js ≥ 18. 패키지 매니저는 앱별로 다름 — **`desktop`=yarn, `ext`=pnpm**, 그 외 각 폴더의 lockfile 기준.

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
