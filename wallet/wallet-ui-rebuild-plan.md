# 지갑 UI/UX 재구축 계획 (View 레이어 재구축 · 코어 보존)

> 목적: 지갑의 **보여지는 레이어(UI/상태)만** 깔끔히 다시 짓고, 검증된 **코어·인프라는 유지**한다.
> 원본은 `_archive/legacy-src-2026-07/` 에 스냅샷 보존(비파괴). 이 문서는 단계별 수행 체크리스트다.

## 진행 현황 (2026-07-31)
- [x] **Phase 0 폴더 통합(지갑만)**: `src·desktop·ext` → `wallet/{core,desktop,extension}`. desktop import `../../core`, 심링크 상대경로 재생성, 루트 스크립트·.gitignore 갱신. **desktop 재설치 + vite 빌드 통과 확인.** (services·onchain 재편은 보류)
- [x] **Phase 1 토큰**: `wallet/core/ui/tokens.css` — 기존 인디고/퍼플 팔레트·다크모드 그대로 추출 + 간격/반경/타이포/그림자 스케일.
- [x] **Phase 2 프리미티브(핵심)**: `wallet/core/ui/primitives/` — Button·Card·Field·**Modal(단일 셸)**·ListRow·Spinner·EmptyState + 프리뷰(`#ui-preview`). **빌드 컴파일 검증 완료.**
- [x] **제안 데스크톱 셸 미리보기**: `core/ui/preview/ShellPreview.tsx`(사이드바+본문 넓은 레이아웃, 목데이터). desktop 뷰 라우팅 `#ui-preview`/`#ui-shell` + Electron `WALLET_VIEW` 환경변수.
- [x] **VS Code task 통합**: `.vscode/tasks.json` — ext/desktop 분리·죽은 Metaverse 제거 → **Dev: Wallet**(+프리미티브/셸 뷰 변형) · Dev: Issuer(정부24/CNU) · Dev: Verifier · Dev: Wallet + Services.
- [x] **Phase 3 (부분)**: `core/state/useWallet.ts`(언락/잠금·계정 생성/임포트/전환/이름변경, dev 자동언락) · `core/state/useVCs.ts`(주소별 VC 로드/추가/삭제) 를 `lib/*` 위 얇은 훅으로 분리. `core/index.ts` 배럴에 정식 export.
- [x] **Phase 4~5 (선행 구현, 위치는 preview)**: `core/ui/preview/ShellPreview.tsx` 가 2.5KB 목업 → **708줄**로 성장. 온보딩·언락 게이트(`AccountGate`)·계정전환·VC 목록/상세/추가·SBT 목록/추가·활동·설정·반응형 상세패널을 포함하며 `useWallet`/`useVCs` 에 **실배선**. 목데이터는 SBT·활동·신뢰기관 목록만 남음.
- [x] **보안 보강(5장) 1건 완료**: 평문 seed 스텁 → `core/lib/seedCrypto.ts` (PBKDF2 600,000회 → AES-GCM 256). 오답 비번은 GCM 인증 실패로 throw.
- [x] **브리지 이관**: `desktop/src/walletRpc.ts` 가 신 코어로 이관. VC 저장을 셸과 동일한 `vcStore` 로 통일, 승인은 `wallet-rpc-approval` 이벤트로 셸에 위임(자동승인 없음, 90초 후 거절 폴백), 변경 시 `wallet-vc-updated` 브로드캐스트.
- [x] **개발 편의(Phase 6 부분)**: `wallet/dev.config.ts` 고정 니모닉 자동언락 · `scripts/kill-port.mjs` · VS Code task 4갈래(Wallet / Issuer Gov24:20251 / Issuer CNU:20252 / Verifier:20260).

## 진행 현황 (2026-09-05) — 의존성 구조 전환
- [x] **`wallet/` 을 yarn 워크스페이스로 전환** (멤버: `core`·`desktop`). `wallet/node_modules` 로 호이스팅해 **React 사본 1개**를 보장하고, pnpm 격리 레이아웃 때문에 깨져 있던 `tsc` 를 복구. 확장은 `workspace:*`·turbo 그래프 때문에 pnpm 이 구조적으로 필요하므로 **워크스페이스 밖**에 그대로 둠.
- [x] **타입 에러 127 → 0**. 대부분(118건)은 react 미해석의 연쇄였고, 해석 복구 후 드러난 **실제 버그 4건**을 함께 수정: `Card`/`ListRow` 의 `title` 이 HTML `title?: string` 과 충돌(→ `Omit`), `AddVCModal` 이 `{Ax,Ay}` 객체를 React 자식으로 렌더(런타임 크래시), `AccountManager` 의 `void || void` onClick, `wallet.ts` 의 `'mnemonic' in` 검사가 else 를 `never` 로 좁히던 문제. core 단독 체크에서 `assetService` 의 존재하지 않는 `getCustomNetworks()` 호출과 `a.chainId === a.chainId` 항등 비교도 발견·수정.
- [x] **잠재 결함 해소**: `desktop/pnpm-workspace.yaml` 이 vite 의 workspace 루트 탐색을 `desktop` 에 고정시켜 `core/*` 와 `dev.config.ts` 가 dev 서버 `fs.allow` 밖(403)이었다. 파일 삭제로 루트가 `wallet/` 로 올라가 해소.
- 주의(nohoist): `wallet/package.json` 의 `workspaces.nohoist` 는 **electron 뿐 아니라 electron 을 런타임에 import 하는 소비자까지** 내려야 한다. electron 만 nohoist 하면 `electron-builder` 는 통과하지만(그쪽은 `projectDir/node_modules/electron` 을 직접 봄) 호이스팅된 `vite-plugin-electron` 이 electron 을 찾지 못해 **dev 서버가 `ERR_MODULE_NOT_FOUND` 로 죽는다.** 현재 목록: `electron`, `vite-plugin-electron`, `vite-plugin-electron-renderer`, `electron-builder` (각각 `**/x` 와 `**/x/**` 두 패턴 필요).
- 주의(junction): 설치 후 `wallet/node_modules/@shared/did-wallet-core` 는 `wallet/core` 를 가리키는 링크다. **PowerShell `Remove-Item -Recurse` 로 `wallet/node_modules` 를 지우면 링크를 따라 들어가 `wallet/core` 원본까지 삭제된다.** 지울 때는 `cmd /c "rmdir /s /q ..."` 또는 bash `rm -rf` 를 쓸 것.
## 진행 현황 (2026-09-05) — Phase 7 컷오버 완료
- [x] **셸 승격**: `core/ui/preview/ShellPreview.tsx` → `core/ui/shell/WalletShell.tsx` (`demoVcs.ts` 동반 이동). `core/index.ts` 에서 `WalletShell` 공개.
- [x] **라우팅 반전**: `desktop/src/main.tsx` 기본값이 실 셸. 레거시 `App` 은 `#legacy` 로만 진입(참고 전용, 삭제하지 않음). `#ui-preview` 프리미티브 갤러리는 유지.
- [x] **VS Code task 정합**: `Wallet` = 환경변수 없음(기본=실 셸) · `Wallet (archive)` = `WALLET_VIEW=legacy`.
- [x] **목데이터 게이트**: 보유 SBT·활동 내역·연결된 서비스는 `showMocks = isDevModeEnabled()` 로 dev 빌드에서만 노출. 배포 빌드는 빈 목록에서 시작한다(컷오버로 이 화면이 설치본에 실리므로 가짜 보유 내역이 진짜처럼 보이면 안 됨).
- **컷오버로 해소된 실제 결함 2건**:
  1. 패키징 산출물(`YourAppName.exe`)이 `WALLET_VIEW` 없이 실행돼 **레거시 UI 를 띄우고 있었다.** 이제 실 셸이 실린다.
  2. 레거시 `App.tsx` 에는 `wallet-rpc-approval`/`wallet-vc-updated` 리스너가 **하나도 없어서**, 확장이 보낸 요청이 아무에게도 안 닿고 90초 뒤 자동 거절됐다. 실 셸은 두 이벤트를 모두 수신하므로 **설치본에서 확장 연동이 비로소 동작한다.**
## 진행 현황 (2026-09-06) — 온체인 축 완성 + 회로 취약점 수정
- [x] **ZKCredentialSBT 배포**(Sepolia): 범용 발급자 1개 + 검증자를 패스 타입으로 등록.
  기간 만료·추가 전용 레지스트리 포함. 테스트 19건.
- [x] **지갑 증명 모듈**: 메인 프로세스에서 fullProve → mintPass 직접 호출. 지갑에서 발급 성공.
  snarkjs·circomlibjs 는 번들 제외(ESM 에서 __filename 참조로 죽는다). zkey 36MB 는 디스크에서 읽는다.
- [x] **시드 VC 진짜 서명** + 재발급 이력 묶기. 만료 재학증명서로 발급 시도 시 회로가 거부.
- [x] **메타버스 씬 연결**: hasValidPass 로 유효한 보유만 인정(만료 구분).
- [x] **회로 건전성 취약점 발견·수정·재배포** — 자격증명 없이 유효한 증명이 만들어졌고 배포된
  검증자가 통과시켰다. 상세는 저장소 루트 `SECURITY.md`. v1 폐기, v2 재배포 완료.
- [ ] 다음: features 실데이터 연결(Phase 4) → **Phase 7 컷오버**(`ShellPreview` → 실 `App`) → 확장 popup 을 코어 위로 포팅(이때 `pages/popup/shared-src` 낡은 복사본과 죽은 `@shared` 별칭 정리).
- 비고: UI 는 계획서의 `desktop/ui` 대신 **`core/ui`** 에 둠(데스크톱이 `App` 을 `core` 에서 마운트하는 기존 seam 유지). 확장(`wallet/extension`)은 데스크톱 완성 후 착수 — 그때 `pnpm install` 1회 필요.

## 1. 배경 / 문제 (왜 재구축)
- `src/App.tsx` 가 **79KB 단일 파일**에 UI+상태+오케스트레이션을 전부 담음 → 유지보수 지옥.
- 모달·버튼 등 **반복요소가 제각각**(공통 컴포넌트 부재) → 정렬·간격 미묘하게 어긋남.
- **데스크톱(큰 화면)·확장(모바일형 세로)** 이 같은 화면을 공유 → 확장은 기능 과다, 데스크톱은 화면 과소.
- **개발 테스트 불편**: 프리셋 계정이 있어도 매번 비밀번호 입력, 상태 시드 미흡.
- 일부 기능 미완성 + 보안 스텁(평문 seed, mock VC검증, stub 증명).

## 2. 유지 / 재구축 경계
**유지 (건드리지 않음 — 검증된 자산)**
- `src/lib/*` — `wallet.ts`·`hdWalletService.ts`(키·HD파생), `storageAdapter.ts`(플랫폼 추상화),
  `encryptor-factory.ts`, `vcVerification.ts`, `networkService.ts`, `vpRequestHandler.ts`, `runtimeBridge.ts`
- `src/config/*`, `src/types/*`, `src/utils/platform.ts`
- **네이티브 브리지 일체** — `desktop/native-host/*`, `desktop/electron/walletBridge.ts`,
  `desktop/src/walletRpc.ts`, `ext/chrome-extension/src/background/*`(핸들러 배관), `nativeBridge.ts`
- circuits · contract · issuer-web · cnu-issuer-web 통합(이미 검증됨)

**재구축 (View 레이어)**
- `src/App.tsx`(79KB) → 상태 훅 + 화면 조합으로 분해
- `src/App.css` → 디자인 토큰 + 컴포넌트 스타일
- `src/components/*`(모달 12종) → 공통 프리미티브 기반으로 재작성
- `src/contexts/ToastContext.tsx` → 통합 Toast 프리미티브

**결과 목표 구조**
```
src/ui/tokens.css        # 색·간격·radius·타이포(레거시 "느낌" 추출) = 스타일 보존
src/ui/primitives/       # Button, IconButton, Modal, Field, Card, ListRow, Toast, Tabs, Sheet, Spinner, EmptyState
src/ui/features/         # AccountHeader, VcList, VcCard, VcDetail, SbtList, ApprovalDialog, NetworkSwitcher, Unlock, Onboarding
src/state/               # useWallet, useVcs, useSbts, useNetworks, useApprovals (lib/* 위 얇은 훅)
src/AppShell.tsx         # 플랫폼 무관 조합점(라우팅/화면 전환)
desktop/src/shell/       # 데스크톱 레이아웃(넓게: 사이드바/탭)
ext/pages/popup/         # 확장 씬 레이아웃(좁게: 상태·조회·승인) — 기존 ThinPopup 확장
```

## 3. 원칙
- **비파괴·점진**: 라이브 앱은 항상 실행 가능 상태 유지. 새 UI는 별도로 짓고 화면 단위로 교체.
- **플랫폼 분리**: 공통 `features`(props 기반) + 플랫폼별 `shell`. 씬클라이언트 구조 덕분에
  데스크톱=풀 UI, 확장=씬으로 **역할이 달라** 크기 미스매치가 구조적으로 해소됨.
- **스타일 보존**: 레거시 CSS에서 토큰만 추출 → 같은 룩, 새 일관성.

---

## 4. 단계별 수행 항목 (Phase 0 → 7)

각 Phase 끝에서 앱은 여전히 실행 가능(정지점). `[ ]` = 수행 항목.

### Phase 0 — 폴더 구조 통합 (reorg, 재구축의 전제)
> 최상위 코드 폴더 8개 → 도메인 3버킷. 지갑을 하나로 묶고, 심링크 공유 대신 얇은 타입 계약으로.
> **주의: 대규모 브레이킹 이동 — import/tsconfig/빌드설정/심링크/루트 스크립트 전부 갱신 필요. 착수 범위는 사용자 승인 후.**
```
did-wallet-app/
├─ wallet/
│  ├─ shared/       # 얇은 계약: RPC·DID_WALLET_* 메시지 타입 + VC/SBT 타입
│  ├─ desktop/      # Electron = 실제 지갑 (코어 lib + UI + main + native-host)
│  └─ extension/    # 린 MV3 씬클라이언트 (터보 모노레포 → 단일 경량 패키지)
├─ services/        # issuer-gov24(was issuer-web) · issuer-cnu(was cnu-issuer-web) · verifier(was verifier-web)
├─ onchain/         # contracts(was contract) · circuits(was circuits)
└─ docs/ · _archive/ · 연구과제산출물/
```
- [ ] (범위 확정) 1) 지갑만 먼저 vs 2) 전체 재편 vs 3) 계획만
- [ ] `src/` → `wallet/desktop/` 로 코어 이동(데스크톱이 코어 소유). `desktop/` 내용 병합, `../../src` import 정리
- [ ] `ext/` → `wallet/extension/` 로 이동하며 **터보 모노레포 해체 → 단일 경량 패키지**(manifest·background·content·popup). `shared-src` 심링크·`@shared` 제거
- [ ] `wallet/shared/` 신설: RPC 메서드·`DID_WALLET_*` 메시지·VC/SBT 타입만
- [ ] (전체 재편 시) `issuer-web`·`cnu-issuer-web`·`verifier-web` → `services/`, `contract`·`circuits` → `onchain/`
- [ ] 루트 `package.json` 스크립트·경로, tsconfig paths, foundry/vite 설정 경로 갱신
- 검증: 각 앱 빌드 통과(desktop·extension·services·onchain), 브리지 E2E 회귀 없음.

### Phase 0.5 — 준비 / 스캐폴딩 (구조 통합 후)
- [x] 원본 `src/` 스냅샷 아카이브 → `_archive/legacy-src-2026-07/` (+ ARCHIVE-README)
- [ ] 새 디렉터리 생성(신구조 기준): `wallet/desktop/ui/{primitives,features}`, `wallet/desktop/state/`, 빈 배럴
- [ ] UI 컴포넌트 규약(네이밍/props) 1페이지 명시
- [ ] 프리뷰 라우트 스캐폴드 — 프리미티브 갤러리(개발 중 눈으로 확인용)
- 검증: 새 폴더가 빌드에 영향 없음(아무도 아직 import 안 함).

> ※ 이하 Phase 1~7 의 `src/ui/*`·`src/state/*` 경로는 구조 통합 후 `wallet/desktop/ui/*`·`wallet/desktop/state/*` 로 읽는다.

### Phase 1 — 디자인 토큰 (느낌 보존)
- [ ] `_archive/.../App.css` + `src/App.css` 분석 → 사용 중인 **색/간격/radius/폰트/그림자** 목록화
- [ ] `src/ui/tokens.css` 작성: CSS 변수 (`--color-bg/fg/primary/danger…`, `--space-1..8`, `--radius-*`, `--font-*`, `--shadow-*`)
- [ ] 라이트/다크 토큰 분리(기존 theme 지원 유지 — `App` 의 onThemeChange 흐름 참고)
- [ ] 프리뷰에 토큰 팔레트 표시
- 검증: 토큰 프리뷰 렌더, 레거시 색상과 육안 일치.

### Phase 2 — 프리미티브 컴포넌트 (반복요소 통일)
> 여기서 "모달·버튼 제각각" 문제를 뿌리 제거. **모달은 단 하나의 `<Modal>` 셸**로 통일.
- [ ] `Button` (variant: primary/ghost/line/danger, size: sm/md, loading/disabled)
- [ ] `IconButton`
- [ ] `Modal` — 단일 셸: 헤더(제목·닫기)·본문·푸터(액션 버튼 위치 고정), ESC/backdrop 닫기, 포커스 트랩
- [ ] `Field` / `Input` / `Select` / `Textarea` (라벨·에러·힌트 규격 통일)
- [ ] `Card`, `ListRow`, `EmptyState`, `Spinner`, `Tabs`, `Sheet`(하단 시트, 확장용)
- [ ] `Toast` — 기존 `ToastContext` 를 이 프리미티브로 흡수(전역 provider 1개)
- [ ] 각 컴포넌트 프리뷰 등록
- 검증: 프리뷰에서 전 컴포넌트 상태(hover/disabled/loading) 확인. 접근성(포커스/ESC) 동작.

### Phase 3 — 상태 레이어 (App.tsx 분해)
> 79KB App.tsx 의 로직을 `lib/*` 위 얇은 훅으로 이관(UI 없음).
- [ ] `src/state/useWallet.ts` — 언락/락, 계정 목록/활성계정, 생성/임포트 (lib/wallet·hdWalletService 위임)
- [ ] `src/state/useVcs.ts` — VC 목록/추가/삭제 (storageAdapter)
- [ ] `src/state/useSbts.ts` — SBT 목록
- [ ] `src/state/useNetworks.ts` — 네트워크 선택/추가 (networkService)
- [ ] `src/state/useApprovals.ts` — 주소요청/VC발급/증명 승인 큐(플랫폼별로 소스 다름: 확장=runtimeBridge, 데스크톱=walletRpc 이벤트)
- [ ] **버그 수정(재구축 겸)**:
  - [ ] VC 저장 키 불일치: `STORAGE_KEYS.savedVCs='saved_vcs'` vs 코드가 리터럴 `'savedVCs'` 혼용 → **한 키로 통일**(마이그레이션 1회 병행)
  - [ ] `runtimeBridge` 데스크톱 no-op 비대칭 → 훅 레벨에서 플랫폼 분기 명시
- 검증: 훅 단위 동작(임시 소비 컴포넌트로) — 언락→계정→VC 로드 흐름.

### Phase 4 — 기능 컴포넌트 (플랫폼 무관)
> 화면 영역을 features 로 재작성. props/훅만 의존, 레이아웃 컨테이너 불문.
- [ ] `Unlock` (비밀번호 언락) + `Onboarding`(생성/니모닉·개인키 임포트)
- [ ] `AccountHeader`(주소·복사·계정전환) / `NetworkSwitcher`
- [ ] `VcList` / `VcCard` / `VcDetail`(선택적 공개 필드 표시)
- [ ] `SbtList` / `SbtCard`
- [ ] `ApprovalDialog` — 주소요청·VC발급·증명제출 승인(발급기관/검증자 웹 연동 흐름)
- [ ] `Settings`(테마·잠금시간·개발옵션)
- 검증: 각 feature 를 프리뷰에 목데이터로 렌더. 승인 다이얼로그가 기존 `DID_WALLET_*` 흐름과 연결.

### Phase 5 — 플랫폼 셸 (크기 미스매치 해소)
- [ ] `desktop/src/shell/DesktopShell.tsx` — **넓은 레이아웃**(좌측 내비/탭 + 본문). features 조합.
- [ ] `desktop/electron/main.ts` — `BrowserWindow` 420×700 → **넉넉한 크기**(예: 1040×720, min 900×600), 커스텀 타이틀바 유지
- [ ] `ext/pages/popup` — **씬 레이아웃**(세로 360폭): 연결상태·계정요약·VC/SBT 퀵리스트·승인만. 무거운 관리(계정 대량관리 등)는 "데스크톱 앱 열기" 유도
- [ ] `src/AppShell.tsx` — 공통 화면전환/라우팅. 데스크톱·확장 셸이 각자 조합
- 검증: 데스크톱 창에서 넓은 레이아웃, 확장 팝업에서 좁은 레이아웃. 동일 feature 재사용 확인.

### Phase 6 — 개발 편의 (테스트 용이화)
- [ ] `src/config/dev.config.ts` 확장: `DEV_AUTO_UNLOCK`(프리셋 계정/비번 자동 언락), `DEV_SEED_STATE`(데모 계정·VC·SBT 시드)
- [ ] **프로덕션 차단**: 모든 dev 동작을 `import.meta.env.DEV`(또는 빌드 플래그)로 게이트 → 배포엔 절대 미포함
- [ ] "개발 상태 리셋" 버튼(Settings 개발 섹션), 계정/네트워크 빠른 전환
- 검증: dev 빌드에서 비번 없이 즉시 지갑 진입 + 시드 상태 표시. prod 빌드에선 완전 비활성.

### Phase 7 — 컷오버 / 정리
- [ ] `desktop/src/main.tsx` · `ext/pages/popup/src/Popup.tsx` 를 새 `AppShell`/셸로 전환
- [ ] 라이브 `src/App.tsx`(레거시) 제거(이미 아카이브됨) + `src/components/*` 구모달 제거
- [ ] 데스크톱 빌드(`pnpm build`)·확장 빌드(`pnpm build`) 통과 확인
- [ ] 스모크: 언락 → 계정 → VC 목록 → 발급기관 승인(브리지) → 검증자 흐름
- 검증: 두 플랫폼 정상 구동, 회귀 없음.

---

## 5. 병행: 보안·정합 보강 (재구축 중 함께)
- [ ] `hdWalletService.encryptSeed`/`decryptSeed` 평문 스텁 → **실제 암호화**(`encryptor-factory` 활용)
- [ ] `vcVerification.ts` mock HMAC(`'issuer-web-secret'`) → **실제 EdDSA/SMT 검증**(circuits `vcsign` 스킴 재사용)
- [ ] `vpRequestHandler.ts` stub JWT 증명 → **snarkjs 실증명**(회로 wasm/zkey 번들, 데스크톱측 생성)
- [ ] 저장 키·플랫폼 분기 정리(Phase 3 버그수정과 연동)

## 6. 순서 / 리스크
1. Phase 0~2(토큰·프리미티브)는 **독립적·저위험** — 먼저 빠르게.
2. Phase 3(상태분해)이 핵심 난이도 — 여기서 App.tsx 로직을 정확히 이관(아카이브 대조).
3. Phase 4~5(features·셸)로 화면 완성, Phase 6 개발편의, Phase 7 컷오버.
4. 보안 보강(5장)은 Phase 3~4 사이에 끼워 진행.
- 각 Phase가 정지점이라 마감 리스크 낮음. 문제가 생기면 이전 Phase 상태로 앱은 여전히 동작.

## 7. 검증 방법(공통)
- 프리뷰 라우트로 컴포넌트 단위 즉시 확인(스토리북 대체).
- 데스크톱: `cd desktop && pnpm dev`; 확장: `cd ext && pnpm build` 후 unpacked 로드.
- 브리지 연동은 `desktop/native-host/README.md` 절차로 E2E.
- 각 Phase 체크리스트의 "검증:" 항목을 통과해야 다음 Phase.

## 참고
- 원본 스냅샷: `_archive/legacy-src-2026-07/` (동작·의도 대조용)
- 지갑 아키텍처(씬클라이언트/브리지): 루트 README + `desktop/native-host/README.md`
