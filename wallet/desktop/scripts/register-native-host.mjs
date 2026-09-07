// [작업] (개발용) Chrome Native Messaging 호스트를 OS 에 등록. 실사용 시 설치 프로그램이 한다.
//        확장 ID 를 주지 않으면 브라우저 프로필을 뒤져 dist 를 로드한 확장을 스스로 찾는다.
// [결과] com.cnu.didwallet.json 을 채우고 브라우저별 레지스트리 키에 등록한다.
//   node scripts/register-native-host.mjs [EXTENSION_ID]
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const hostDir = path.resolve(__dirname, '..', 'native-host')
const manifestPath = path.join(hostDir, 'com.cnu.didwallet.json')
const launcher = path.join(hostDir, process.platform === 'win32' ? 'host-launcher.bat' : 'host.mjs')
const distDir = path.resolve(__dirname, '..', '..', 'extension', 'dist')

const BROWSERS = [
  { name: 'Chrome', data: path.join(process.env.LOCALAPPDATA || '', 'Google/Chrome/User Data'),
    key: 'HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\com.cnu.didwallet' },
  { name: 'Edge', data: path.join(process.env.LOCALAPPDATA || '', 'Microsoft/Edge/User Data'),
    key: 'HKCU\\Software\\Microsoft\\Edge\\NativeMessagingHosts\\com.cnu.didwallet' },
]

// 압축해제 확장의 설정은 Preferences 가 아니라 Secure Preferences 에 들어가는 경우가 많다.
function findLoaded(browser) {
  const out = []
  if (!fs.existsSync(browser.data)) return out
  for (const profile of fs.readdirSync(browser.data)) {
    for (const file of ['Preferences', 'Secure Preferences']) {
      const p = path.join(browser.data, profile, file)
      if (!fs.existsSync(p)) continue
      let settings
      try {
        settings = JSON.parse(fs.readFileSync(p, 'utf8'))?.extensions?.settings ?? {}
      } catch { continue }
      for (const [id, v] of Object.entries(settings)) {
        if (!v?.path || !path.isAbsolute(v.path)) continue
        if (path.normalize(v.path).toLowerCase() === distDir.toLowerCase()) out.push({ id, profile })
      }
    }
  }
  return out
}

const given = process.argv[2]
const found = []

if (given) {
  found.push({ browser: BROWSERS[0], id: given, profile: '(직접 지정)' })
} else if (process.platform === 'win32') {
  for (const browser of BROWSERS) {
    for (const hit of findLoaded(browser)) found.push({ browser, ...hit })
  }
}

if (!found.length) {
  console.error('확장을 찾지 못했습니다.')
  console.error(`  ${distDir} 를 브라우저에 압축해제 확장으로 로드한 뒤 다시 실행하세요.`)
  console.error('  또는 ID 를 직접: node scripts/register-native-host.mjs <EXTENSION_ID>')
  process.exit(1)
}

const ids = [...new Set(found.map(f => f.id))]
for (const f of found) console.log(`확장 발견: ${f.browser.name} / ${f.profile} / ${f.id}`)

fs.writeFileSync(manifestPath, JSON.stringify({
  name: 'com.cnu.didwallet',
  description: 'CNU DID Wallet native messaging host (research demo)',
  path: launcher,
  type: 'stdio',
  allowed_origins: ids.map(id => `chrome-extension://${id}/`),
}, null, 2))
console.log('manifest 작성:', manifestPath)

if (process.platform === 'win32') {
  const keys = new Set(found.map(f => f.browser.key))
  // 시연 자동화는 Playwright 의 Chromium 을 쓴다(설치된 Chrome 은 137 부터 --load-extension 없음).
  // 압축해제 확장 ID 는 경로에서 나오므로 같은 매니페스트가 그대로 통한다.
  keys.add(['HKCU', 'Software', 'Chromium', 'NativeMessagingHosts', 'com.cnu.didwallet'].join('\\'))
  for (const key of keys) {
    execSync(`reg add "${key}" /ve /t REG_SZ /d "${manifestPath}" /f`, { stdio: 'inherit' })
    console.log('등록:', key)
  }
  console.log('\n브라우저를 완전히 재시작해야 적용됩니다.')
} else {
  const dir = process.platform === 'darwin'
    ? path.join(os.homedir(), 'Library/Application Support/Google/Chrome/NativeMessagingHosts')
    : path.join(os.homedir(), '.config/google-chrome/NativeMessagingHosts')
  fs.mkdirSync(dir, { recursive: true })
  fs.copyFileSync(manifestPath, path.join(dir, 'com.cnu.didwallet.json'))
  console.log('manifest 복사:', dir)
}
