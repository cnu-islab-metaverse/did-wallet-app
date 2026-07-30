// [작업] (개발용) Chrome Native Messaging 호스트를 OS 에 등록. 실사용 시 설치 프로그램이 수행.
//        확장 ID 를 인자로 받아 manifest 의 allowed_origins·path 를 채우고 레지스트리에 등록한다.
//   node scripts/register-native-host.mjs <EXTENSION_ID>
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const hostDir = path.resolve(__dirname, '..', 'native-host')
const manifestPath = path.join(hostDir, 'com.cnu.didwallet.json')
const launcher = path.join(hostDir, process.platform === 'win32' ? 'host-launcher.bat' : 'host.mjs')

const extId = process.argv[2]
if (!extId) {
  console.error('사용법: node scripts/register-native-host.mjs <EXTENSION_ID>')
  console.error('  (확장을 unpacked 로드 후 chrome://extensions 에서 ID 확인)')
  process.exit(1)
}

const manifest = {
  name: 'com.cnu.didwallet',
  description: 'CNU DID Wallet native messaging host (research demo)',
  path: launcher,
  type: 'stdio',
  allowed_origins: [`chrome-extension://${extId}/`],
}
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2))
console.log('manifest 작성:', manifestPath)

if (process.platform === 'win32') {
  const key = 'HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\com.cnu.didwallet'
  execSync(`reg add "${key}" /ve /t REG_SZ /d "${manifestPath}" /f`, { stdio: 'inherit' })
  console.log('레지스트리 등록 완료:', key)
} else {
  // macOS/Linux: Chrome 의 NativeMessagingHosts 디렉터리에 manifest 복사
  const dir = process.platform === 'darwin'
    ? path.join(os.homedir(), 'Library/Application Support/Google/Chrome/NativeMessagingHosts')
    : path.join(os.homedir(), '.config/google-chrome/NativeMessagingHosts')
  fs.mkdirSync(dir, { recursive: true })
  fs.copyFileSync(manifestPath, path.join(dir, 'com.cnu.didwallet.json'))
  console.log('manifest 복사 완료:', dir)
}
