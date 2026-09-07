// [작업] 시나리오 실증 자동화 — 실제 브라우저와 실제 지갑을 조작해 전 과정을 눈앞에서 재현한다.
//        플랫폼에서 발급 요청 → 확장이 지갑으로 전달 → 지갑에서 승인 → 영지식 증명 → 온체인 발급
//        → 플랫폼이 체인을 조회해 입장 가능으로 바뀜.
// [결과] node run.mjs [--scenario youth_pass|regional_national_univ] [--check] [--slow ms]
//
// 앱과 검증자 서버는 띄우지 않고 **실행 중인 것에 붙는다**. 자동화가 소유하면 끝날 때 같이 죽는다.
import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const EXT_DIST = path.join(ROOT, 'wallet', 'extension', 'dist')

const argv = process.argv.slice(2)
const arg = (name, dflt) => {
  const i = argv.indexOf(`--${name}`)
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : dflt
}
const has = (name) => argv.includes(`--${name}`)

const SCENARIO = arg('scenario', 'youth_pass')
const PLATFORM = arg('platform', 'http://localhost:20260')
const CDP = `http://127.0.0.1:${arg('cdp', '9222')}`
const SLOW = Number(arg('slow', '350'))
const CHECK_ONLY = has('check')

const ZONE = {
  youth_pass: { label: '지역청년패스', zone: '대전 청년 라운지' },
  regional_national_univ: { label: '지방거점국립대 소속', zone: '대학 협력관' },
}
if (!ZONE[SCENARIO]) fail(`알 수 없는 시나리오: ${SCENARIO}`)

// ── 진행 표시 ────────────────────────────────────────────────────────
const t0 = Date.now()
const stamp = () => `${((Date.now() - t0) / 1000).toFixed(1).padStart(5)}s`
let stepNo = 0
function step(msg) {
  stepNo++
  console.log(`\n[${stamp()}] ${String(stepNo).padStart(2)}. ${msg}`)
}
function info(msg) { console.log(`[${stamp()}]     ${msg}`) }
function ok(msg) { console.log(`[${stamp()}]     ✓ ${msg}`) }
function fail(msg) { console.error(`\n✗ ${msg}\n`); process.exit(1) }

// ── 화면 위 자막 — 무엇을 하고 있는지 보이게 한다 ──────────────────────
const NARRATE = `(text) => {
  let el = document.getElementById('__demo_narration')
  if (!el) {
    el = document.createElement('div')
    el.id = '__demo_narration'
    el.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:2147483647;' +
      'background:linear-gradient(90deg,#6d8bff,#a06dff);color:#fff;font:600 15px/1.5 ' +
      '"Malgun Gothic",system-ui,sans-serif;padding:12px 20px;box-shadow:0 -4px 20px rgba(0,0,0,.35);' +
      'pointer-events:none;letter-spacing:-0.01em'
    document.body.appendChild(el)
  }
  el.textContent = '▶ ' + text
}`

async function say(targets, text) {
  info(text)
  for (const t of targets) {
    try { await t.evaluate(NARRATE, text) } catch { /* 페이지 전환 중 */ }
  }
}

// ── 사전 점검 ────────────────────────────────────────────────────────
async function reachable(url) {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(2500) })
    return r.ok || r.status < 500
  } catch { return false }
}

/** 압축해제 확장의 ID 는 경로에서 나온다. 등록된 것과 같아야 네이티브 메시징이 열린다. */
function registeredExtensionIds() {
  try {
    const key = 'HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\com.cnu.didwallet'
    const out = execSync(`reg query "${key}" /ve`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
    const m = out.match(/REG_SZ\s+(.+)$/m)
    if (!m) return null
    const manifest = JSON.parse(fs.readFileSync(m[1].trim(), 'utf8'))
    return (manifest.allowed_origins || []).map((o) => o.replace('chrome-extension://', '').replace('/', ''))
  } catch { return null }
}

async function preflight() {
  step('사전 점검')

  if (!fs.existsSync(path.join(EXT_DIST, 'manifest.json'))) {
    fail(`확장 빌드가 없습니다: ${EXT_DIST}\n  nvm use 22.17.0 && cd wallet/extension && pnpm build`)
  }
  ok(`확장 빌드 ${EXT_DIST}`)

  const ids = registeredExtensionIds()
  if (!ids) info('⚠ 네이티브 호스트가 등록돼 있지 않습니다 — cd wallet/desktop && yarn register:host')
  else ok(`네이티브 호스트 등록됨 (${ids.join(', ')})`)

  if (!(await reachable(PLATFORM))) {
    fail(`검증자 웹이 응답하지 않습니다: ${PLATFORM}\n  cd verifier-web && yarn dev`)
  }
  ok(`플랫폼 ${PLATFORM}`)

  if (!(await reachable(`${CDP}/json/version`))) {
    fail(
      `데스크톱 지갑에 붙을 수 없습니다: ${CDP}\n` +
      `  지갑을 CDP 를 연 채로 띄워 주세요 — cd wallet/desktop && yarn dev:debug\n` +
      `  (이 스크립트는 앱을 대신 띄우지 않습니다. 앱은 직접 띄워 두시는 것이 맞습니다.)`,
    )
  }
  ok(`지갑 CDP ${CDP}`)
  return ids
}

// ── 지갑(Electron) 렌더러 붙기 ───────────────────────────────────────
async function attachWallet() {
  const browser = await chromium.connectOverCDP(CDP)
  const pages = browser.contexts().flatMap((c) => c.pages())
  for (const p of pages) {
    const isWallet = await p.evaluate(() => typeof (window).ipcRenderer !== 'undefined').catch(() => false)
    if (isWallet) return { browser, page: p }
  }
  fail('지갑 렌더러를 찾지 못했습니다. 지갑 창이 열려 있는지 확인하세요.')
}

// ── 본편 ─────────────────────────────────────────────────────────────
async function main() {
  const ids = await preflight()
  if (CHECK_ONLY) { console.log('\n사전 점검만 수행했습니다 (--check).\n'); return }

  step('지갑 렌더러에 붙는 중')
  const { page: wallet } = await attachWallet()
  ok(`지갑 창 연결됨 — ${await wallet.title()}`)

  step('브라우저를 띄우고 확장을 싣는 중')
  const profile = path.join(os.tmpdir(), `cnu-demo-profile-${Date.now()}`)
  const ctx = await chromium.launchPersistentContext(profile, {
    channel: 'chrome',
    headless: false,
    viewport: null,
    slowMo: SLOW,
    args: [
      `--disable-extensions-except=${EXT_DIST}`,
      `--load-extension=${EXT_DIST}`,
      '--start-maximized',
      '--no-first-run',
    ],
  })

  // 서비스워커가 뜨면 그 URL 에서 확장 ID 를 읽는다.
  let sw = ctx.serviceWorkers()[0]
  if (!sw) sw = await ctx.waitForEvent('serviceworker', { timeout: 15000 }).catch(() => null)
  const extId = sw ? new URL(sw.url()).host : null
  if (extId) {
    ok(`확장 로드됨 — ${extId}`)
    if (ids && !ids.includes(extId)) {
      info(`⚠ 등록된 ID(${ids.join(', ')})와 다릅니다. 네이티브 메시징이 거부될 수 있습니다.`)
      info(`   cd wallet/desktop && yarn register:host ${extId}`)
    }
  }

  const page = ctx.pages()[0] ?? (await ctx.newPage())
  const stage = [page, wallet]

  step('플랫폼 메인 화면')
  await page.goto(PLATFORM, { waitUntil: 'domcontentloaded' })
  await say([page], '메타버스 플랫폼에 접속했습니다.')
  await page.waitForTimeout(900)

  step('인증토큰 발급 화면으로 이동')
  await page.click('a[href="/platform/pass.html"]')
  await page.waitForLoadState('domcontentloaded')
  await say([page], '입장하려는 공간을 고릅니다.')

  await page.selectOption('#zone', SCENARIO)
  await page.waitForTimeout(600)

  step('지갑에서 아바타 주소 가져오기 (확장 경유)')
  await say([page], '브라우저 확장을 통해 지갑의 계정 주소를 가져옵니다.')
  await page.waitForSelector('#connect:not([hidden])', { timeout: 20000 })
  await page.click('#connect')
  await page.waitForFunction(() => /^0x[0-9a-fA-F]{40}$/.test(document.querySelector('#addr').value), null, { timeout: 30000 })
  const avatar = await page.inputValue('#addr')
  ok(`아바타 주소 ${avatar}`)

  const before = (await page.textContent('#status'))?.trim()
  info(`현재 상태: ${before}`)
  await say([page], `현재 상태 — ${before}`)
  await page.waitForTimeout(1200)

  step('발급 요청을 만들어 지갑으로 보내기')
  await say(stage, '플랫폼이 발급 요청을 만들고, 확장이 그것을 데스크톱 지갑으로 나릅니다.')
  await page.click('#send')

  step('지갑에서 요청 승인')
  await say([wallet], '지갑이 요청을 컨트랙트에 직접 확인한 뒤 승인 창을 띄웁니다.')
  const approve = wallet.getByRole('button', { name: /승인.*발급받기/ })
  await approve.waitFor({ state: 'visible', timeout: 60000 })
  ok('승인 창이 떴습니다')
  await wallet.waitForTimeout(1500) // 사용자가 내용을 볼 시간
  await say([wallet], '승인합니다. 영지식 증명이 만들어져 온체인에 제출됩니다.')
  await approve.click()

  step('증명 생성 · 온체인 발급 (수십 초)')
  await say(stage, '영지식 증명을 만들고 Sepolia 에 제출하는 중입니다…')
  const result = wallet.getByText('인증토큰 발급 완료')
  await result.waitFor({ state: 'visible', timeout: 240000 })
  ok('발급 완료 창')

  const detail = await wallet.evaluate(() => {
    const t = document.body.innerText
    const tx = t.match(/0x[0-9a-fA-F]{64}/)
    const id = t.match(/토큰 ID:\s*(\S+)/)
    return { txHash: tx?.[0] ?? null, tokenId: id?.[1] ?? null }
  })
  if (detail.tokenId) ok(`토큰 ID ${detail.tokenId}`)
  if (detail.txHash) ok(`트랜잭션 ${detail.txHash}`)

  step('플랫폼이 체인을 조회해 입장 판정')
  await say([page], '플랫폼은 지갑의 말을 믿지 않고 컨트랙트에 직접 물어 확인합니다.')
  await page.waitForFunction(
    (want) => (document.querySelector('#status')?.textContent || '').includes(want),
    `${ZONE[SCENARIO].zone} 입장 가능`,
    { timeout: 180000 },
  )
  const after = (await page.textContent('#status'))?.trim()
  ok(`상태: ${after}`)
  await say([page], `${after} — 시연 완료`)

  console.log(`\n${'─'.repeat(58)}`)
  console.log(`  시나리오   ${ZONE[SCENARIO].label} (${SCENARIO})`)
  console.log(`  아바타     ${avatar}`)
  console.log(`  이전 상태  ${before}`)
  console.log(`  이후 상태  ${after}`)
  if (detail.tokenId) console.log(`  토큰 ID    ${detail.tokenId}`)
  if (detail.txHash) console.log(`  트랜잭션   https://sepolia.etherscan.io/tx/${detail.txHash}`)
  console.log(`  소요       ${((Date.now() - t0) / 1000).toFixed(1)}초`)
  console.log(`${'─'.repeat(58)}\n`)

  if (!has('keep')) {
    info('20초 뒤 브라우저를 닫습니다 (--keep 으로 열어 둘 수 있습니다).')
    await page.waitForTimeout(20000)
    await ctx.close()
  } else {
    info('브라우저를 열어 둡니다. Ctrl+C 로 끝내세요.')
  }
}

main().catch((e) => {
  console.error(`\n✗ ${e?.message || e}\n`)
  process.exit(1)
})
