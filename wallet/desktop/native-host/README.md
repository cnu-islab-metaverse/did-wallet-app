# Native Messaging 브리지 — 확장을 데스크톱 지갑의 씬클라이언트로

이 폴더는 크롬 확장(`wallet/extension/`)이 **설치된 데스크톱 지갑 프로그램**(`wallet/desktop/`, Electron)에
접속하는 Chrome Native Messaging 호스트다. 확장은 키를 보관하지 않는 **씬클라이언트** — 이 호스트(=프로그램)가
없으면 지갑 기능이 동작하지 않는다.

## 구성 / 흐름
```
웹페이지 (메타버스 플랫폼)
   │ window.postMessage
   ▼
확장 content script ──chrome.runtime──► 확장 background
   (pages/content)                       (chrome-extension/src/background)
                                              │ connectNative('com.cnu.didwallet')
                                              ▼
                                      host-launcher.bat → host.mjs
                                              │ stdio(4B 길이+JSON)
                                              ▼ 로컬 파이프 \\.\pipe\cnu-didwallet
                                      Electron main (walletBridge.ts)
                                              │ ipc
                                              ▼ 렌더러(walletRpc.ts → 공유 core/ 지갑)
```
- `framing.mjs` — 4바이트 LE 길이 + JSON 코덱 (stdio·파이프 공용).
- `host.mjs` — 크롬 stdio ↔ 로컬 파이프 중계. 프로그램 미실행 시 `program-not-running` 반환.
- `host-launcher.bat` — 크롬이 실행하는 진입점(node host.mjs).
- `com.cnu.didwallet.json` — 호스트 매니페스트(등록 스크립트가 채움).

## RPC 메서드

| 메서드 | 승인 | 하는 일 |
|---|---|---|
| `ping` | — | 프로그램 실행 확인 |
| `getAddresses` | — | 활성 계정 주소·DID |
| `getVCs` | — | 보관 중인 증명서 |
| `saveVC` | — | 증명서 저장 |
| `requestVCIssuance` | ✔ | 발급기관이 준 증명서를 승인 후 저장 |
| `requestPassIssuance` | ✔ | 플랫폼이 준 발급 요청을 검증·승인 후 인증토큰 발급 |

승인이 필요한 메서드는 `walletBridge.ts` 가 **데스크톱 창을 앞으로 가져온다** — 모달이 다른 창 뒤에 뜨면
사용자가 못 보고 시간초과된다.

### `requestPassIssuance` 가 즉시 응답하는 이유

승인되면 곧바로 응답하고, 증명 생성과 트랜잭션 확정은 데스크톱에서 이어간다. 두 가지 이유다.

- **MV3 서비스워커가 그때까지 살아 있지 않다.** 증명 생성 + Sepolia 확정은 수십 초가 걸린다.
  승인 대기 동안에는 확장이 20초 간격으로 핑을 보내 워커를 깨워 두지만, 그 뒤까지 붙잡아 둘 이유가 없다.
- **플랫폼은 지갑의 "성공했다"는 말을 믿지 않아야 한다.** 페이지는 컨트랙트의 `hasValidPass` 를 직접
  조회해 발급을 확인한다 — 씬(`metaverse-scene`)이 입장을 판정할 때 쓰는 것과 같은 호출이다.

요청 검증(컨트랙트에 직접 조회)과 승인 모달은 전부 데스크톱에 있다. 확장은 요청을 나르기만 한다.

## 개발용 설치 (Windows)

1. **데스크톱 실행** — VSCode task `Wallet`, 또는 `cd wallet/desktop && yarn dev`
   (Electron 부팅 → 파이프 리슨).

2. **확장 빌드** — 확장은 `engines.node >= 22.15.1` 이라 Node 22 가 필요하다.
   ```
   nvm use 22.17.0
   cd wallet/extension && pnpm install && pnpm build
   ```
   `chrome://extensions` → 개발자 모드 → **압축해제된 확장 프로그램을 로드** → `wallet/extension/dist`
   → **확장 ID** 확인.

3. **네이티브 호스트 등록**(확장 ID 전달):
   ```
   cd wallet/desktop && yarn register:host <EXTENSION_ID>
   ```
   → `com.cnu.didwallet.json` 의 `allowed_origins`·`path` 를 채우고
   `HKCU\Software\Google\Chrome\NativeMessagingHosts\com.cnu.didwallet` 레지스트리에 등록.

4. **크롬 재시작** 후 플랫폼 화면(`http://localhost:20260`)에서 확장이 감지되면
   **지갑에서 가져오기** / **지갑으로 바로 보내기** 버튼이 나타난다.

## 확인 포인트
- 데스크톱 프로그램을 종료하면 "지갑으로 바로 보내기"가 **"데스크톱 지갑 프로그램을 설치하고 실행해
  주세요"** 로 실패한다 → 확장 단독 불가(의도대로).
- 키·VC 저장은 전부 데스크톱(IndexedDB)에만. 확장은 조회·중계만.
- 요청을 전달한 사이트가 요청에 적힌 출처와 다르면 승인 모달에 경고가 뜬다.

## 주의
- `allowed_origins` 의 확장 ID 는 unpacked(개발)와 게시 후가 다르다. 개발 ID 를 고정하려면 매니페스트에
  `key` 를 넣어 ID 를 고정하라.
- MV3 서비스워커는 유휴 시 네이티브 포트를 끊으므로 `nativeBridge.ts` 는 요청 시 지연 재연결한다.
- 로컬 파이프는 사용자 범위. 실사용 시 nonce 핸드셰이크로 동일 사용자 내 타 프로세스 접근도 차단 권장.
