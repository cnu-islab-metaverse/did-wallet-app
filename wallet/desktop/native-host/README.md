# Native Messaging 브리지

크롬 확장(`wallet/extension/`)이 설치된 데스크톱 지갑(`wallet/desktop/`)에 접속하는 통로다.
확장은 키를 갖지 않는 씬클라이언트 — 이 호스트가 없으면 지갑 기능이 동작하지 않는다.

```
웹페이지 ─postMessage→ content script ─runtime→ background
                                                  │ connectNative
                                                  ▼ host-launcher.bat → host.mjs
                                                  │ stdio(4B 길이+JSON)
                                                  ▼ \\.\pipe\cnu-didwallet
                                          Electron main (walletBridge.ts)
                                                  │ ipc
                                                  ▼ 렌더러 (walletRpc.ts → core)
```

- `framing.mjs` — 4바이트 LE 길이 + JSON 코덱(stdio·파이프 공용)
- `host.mjs` — stdio ↔ 파이프 중계. 프로그램 미실행 시 `program-not-running`
- `host-launcher.bat` — 크롬이 실행하는 진입점
- `com.cnu.didwallet.json` — 호스트 매니페스트(등록 스크립트가 채운다)

## RPC 메서드

| 메서드 | 승인 | 하는 일 |
|---|---|---|
| `ping` | | 실행 확인 |
| `getAddresses` | | 활성 계정 주소·DID |
| `getVCs` | | 보관 중인 증명서 |
| `saveVC` | | 증명서 저장 |
| `requestVCIssuance` | ✔ | 발급기관이 준 증명서를 저장 |
| `requestPassIssuance` | ✔ | 플랫폼이 준 발급 요청으로 인증토큰 발급 |

승인이 필요한 메서드는 데스크톱 창을 앞으로 가져온다.

`requestPassIssuance` 는 승인되면 곧바로 응답하고 증명·트랜잭션은 뒤에서 이어간다.
MV3 서비스워커가 그때까지 살아 있지 않고, 플랫폼도 지갑의 말 대신 `hasValidPass` 를
직접 조회해 확인해야 하기 때문이다. 요청 검증과 승인은 전부 데스크톱에 있다.

## 개발용 설치 (Windows)

1. 데스크톱 실행 — VSCode task `Wallet` 또는 `cd wallet/desktop && yarn dev`
2. 확장 빌드 — Node 22 필요(`engines.node >= 22.15.1`)
   ```
   nvm use 22.17.0
   cd wallet/extension && pnpm install && pnpm build
   ```
   `chrome://extensions` → 개발자 모드 → 압축해제된 확장 로드 → `dist` → **ID 확인**
3. 호스트 등록 — `cd wallet/desktop && yarn register:host <EXTENSION_ID>`
4. 크롬 재시작 (등록은 시작 시에만 읽힌다)
5. `http://localhost:20260` 에서 확장 감지 확인

## 주의

- 확장 ID 는 unpacked 와 게시본이 다르다. 고정하려면 매니페스트에 `key` 를 넣는다.
- MV3 서비스워커는 유휴 시 포트를 끊으므로 `nativeBridge.ts` 가 요청 시 재연결한다.
- 파이프는 사용자 범위. 실사용 시 nonce 핸드셰이크로 동일 사용자 내 타 프로세스도 차단 권장.
