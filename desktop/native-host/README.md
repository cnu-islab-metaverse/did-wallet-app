# Native Messaging 브리지 — 확장을 데스크톱 지갑의 씬클라이언트로

이 폴더는 크롬 확장(`ext/`)이 **설치된 데스크톱 지갑 프로그램**(`desktop/`, Electron)에 접속하는
Chrome Native Messaging 호스트다. 확장은 키를 보관하지 않는 **씬클라이언트** — 이 호스트(=프로그램)가
없으면 지갑 기능이 동작하지 않는다.

## 구성 / 흐름
```
확장 background ──connectNative('com.cnu.didwallet')──► host-launcher.bat → host.mjs
   (nativeBridge.ts)                                         │ stdio(4B 길이+JSON)
                                                             ▼ 로컬 파이프 \\.\pipe\cnu-didwallet
                                                      Electron main (walletBridge.ts)
                                                             │ ipc
                                                             ▼ 렌더러(walletRpc.ts → 공유 src/ 지갑)
```
- `framing.mjs` — 4바이트 LE 길이 + JSON 코덱 (stdio·파이프 공용).
- `host.mjs` — 크롬 stdio ↔ 로컬 파이프 중계. 프로그램 미실행 시 `program-not-running` 반환.
- `host-launcher.bat` — 크롬이 실행하는 진입점(node host.mjs).
- `com.cnu.didwallet.json` — 호스트 매니페스트(등록 스크립트가 채움).

## 개발용 설치 (Windows)
1. 데스크톱 실행: `cd desktop && pnpm dev` (Electron 부팅 → 파이프 리슨).
2. 확장 빌드·로드: `cd ext && pnpm build` → `chrome://extensions` 에서 `ext/dist` unpacked 로드 → **확장 ID** 확인.
3. 네이티브 호스트 등록(확장 ID 전달):
   ```
   node desktop/scripts/register-native-host.mjs <EXTENSION_ID>
   ```
   → `com.cnu.didwallet.json` 의 `allowed_origins`·`path` 를 채우고
   `HKCU\Software\Google\Chrome\NativeMessagingHosts\com.cnu.didwallet` 레지스트리에 등록.
4. 크롬 재시작 후 확장 팝업 → "연결됨" 표시. 발급기관 페이지에서 "지갑 연결" → **승인이 데스크톱 창에 표시**.

## 확인 포인트
- 데스크톱 프로그램을 종료하면 확장 팝업·"지갑 연결"이 **"프로그램 필요"** 로 바뀐다 → 확장 단독 불가(의도대로).
- 키·VC 저장은 전부 데스크톱(IndexedDB)에만. 확장은 조회·중계만.

## 주의
- `allowed_origins` 의 확장 ID 는 unpacked(개발)와 게시 후가 다르다. 개발 ID 를 고정하려면 매니페스트에
  `key` 를 넣어 ID 를 고정하라.
- MV3 서비스워커는 유휴 시 네이티브 포트를 끊으므로 `nativeBridge.ts` 는 요청 시 지연 재연결한다.
- 로컬 파이프는 사용자 범위. 실사용 시 nonce 핸드셰이크로 동일 사용자 내 타 프로세스 접근도 차단 권장.
