// [작업] 시나리오 실증 자동화 — 실제 브라우저와 실제 지갑을 조작해 전 과정을 눈앞에서 재현한다.
//        마우스를 실제로 움직여 누르고, 화면에 커서와 자막을 그려 사람이 조작하는 것처럼 보인다.
// [결과] node run.mjs [--scenario …] [--check] [--slow ms] [--half left|right]
//
// 필요한 서비스는 알아서 켠다. 켠 것은 끄지 않는다 — 결과를 봐야 하고,
// 부모만 죽이면 Electron 자식이 파이프를 쥔 채 남는다.
import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
import { execSync, spawn } from 'node:child_process'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const EXT_DIST = path.join(ROOT, 'wallet', 'extension', 'dist')
const NL = String.fromCharCode(10)

const argv = process.argv.slice(2)
const arg = (name, dflt) => {
  const i = argv.indexOf(`--${name}`)
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : dflt
}
const has = (name) => argv.includes(`--${name}`)

const SCENARIO = arg('scenario', 'youth_pass')
const PLATFORM = arg('platform', 'http://localhost:20260')
const CDP = `http://127.0.0.1:${arg('cdp', '9222')}`
const SLOW = Number(arg('slow', '250'))
const CHECK_ONLY = has('check')
const NO_SPAWN = has('no-spawn')
const HALF = has('full') ? null : arg('half', 'left')
const MARGIN = Number(arg('margin', '28'))
const NO_SHOTS = has('no-shots')

const ZONE = {
  youth_pass: { label: '지역청년패스', zone: '대전 청년 라운지' },
  regional_national_univ: { label: '지방거점국립대 소속', zone: '대학 협력관' },
}

// ── 진행 표시 ────────────────────────────────────────────────────────
const t0 = Date.now()
const stamp = () => `${((Date.now() - t0) / 1000).toFixed(1).padStart(5)}s`
let stepNo = 0
const step = (m) => console.log(`${NL}[${stamp()}] ${String(++stepNo).padStart(2)}. ${m}`)
const info = (m) => console.log(`[${stamp()}]     ${m}`)
const ok = (m) => console.log(`[${stamp()}]     ✓ ${m}`)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
function fail(m) { console.error(`${NL}✗ ${m}${NL}`); process.exit(1) }

if (!ZONE[SCENARIO]) fail(`알 수 없는 시나리오: ${SCENARIO}`)

// ── 화면 위 커서와 자막 ──────────────────────────────────────────────
// Playwright 의 마우스는 실제 입력 이벤트를 보내므로, 페이지에서 그 좌표를 받아 커서를 그린다.
const OVERLAY = `() => {
  if (window.__demoOverlay) return
  window.__demoOverlay = true
  const add = () => {
    if (!document.body) return setTimeout(add, 30)
    const c = document.createElement('div')
    c.id = '__demo_cursor'
    c.style.cssText = 'position:fixed;left:-99px;top:-99px;z-index:2147483647;width:24px;height:24px;' +
      'margin:-12px 0 0 -12px;border-radius:50%;background:rgba(109,139,255,.30);border:2px solid #6d8bff;' +
      'box-shadow:0 0 0 5px rgba(109,139,255,.14);pointer-events:none;transition:transform .09s ease-out'
    document.body.appendChild(c)
    const n = document.createElement('div')
    n.id = '__demo_narration'
    n.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:2147483646;' +
      'background:linear-gradient(90deg,#6d8bff,#a06dff);color:#fff;font:600 14px/1.5 ' +
      '"Malgun Gothic",system-ui,sans-serif;padding:11px 18px;box-shadow:0 -4px 20px rgba(0,0,0,.35);' +
      'pointer-events:none;letter-spacing:-0.01em'
    document.body.appendChild(n)
    addEventListener('mousemove', (e) => {
      c.style.left = e.clientX + 'px'; c.style.top = e.clientY + 'px'
    }, true)
    addEventListener('mousedown', () => { c.style.transform = 'scale(.55)' }, true)
    addEventListener('mouseup', () => { c.style.transform = 'scale(1)' }, true)
  }
  add()
}`

const SAY = `(text) => {
  const n = document.getElementById('__demo_narration')
  if (n) n.textContent = '▶ ' + text
}`

async function overlay(page) { try { await page.evaluate(OVERLAY) } catch { /* */ } }
async function say(targets, text) {
  info(text)
  for (const t of targets) { try { await t.evaluate(SAY, text) } catch { /* */ } }
}

/** 마우스를 그 자리까지 움직여서 누른다. 사람이 조작하는 것처럼 보이게. */
async function click(page, target, label) {
  const el = typeof target === 'string' ? page.locator(target) : target
  await el.waitFor({ state: 'visible', timeout: 30000 })
  await el.scrollIntoViewIfNeeded().catch(() => {})
  const box = await el.boundingBox()
  if (!box) throw new Error(`요소 위치를 알 수 없습니다: ${label ?? target}`)
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 30 })
  await page.waitForTimeout(280)
  await page.mouse.down()
  await page.waitForTimeout(90)
  await page.mouse.up()
  if (label) info(`클릭 — ${label}`)
  await page.waitForTimeout(220)
}

// 한 번에 하나만 조작하고, 조작하는 창이 위에 있어야 한다.
let front = null
let frontPage = null
async function focus(which, page, wallet) {
  frontPage = which === 'wallet' ? wallet : page
  if (front === which) return
  front = which
  try {
    if (which === 'wallet') await wallet.evaluate(() => window.ipcRenderer?.windowFocus?.())
    else await page.bringToFront()
  } catch { /* 창이 없으면 넘어간다 */ }
  await frontPage.waitForTimeout(500)
  info(which === 'wallet' ? '── 지갑 창 ──' : '── 브라우저 ──')
}

// ── 단계별 스크린샷 ──────────────────────────────────────────────────
// 실행할 때마다 비우고 처음부터 모은다. 보고서·발표자료에 그대로 쓰기 위한 것이라
// 파일명에 순번과 제목을 넣고, 목록을 index.md 로 함께 낸다.
const SHOTS = path.join(__dirname, 'shots')
const shots = []
function resetShots() {
  fs.rmSync(SHOTS, { recursive: true, force: true })
  fs.mkdirSync(SHOTS, { recursive: true })
}
async function capture(title) {
  if (!frontPage || NO_SHOTS) return
  const n = String(shots.length + 1).padStart(2, '0')
  const safe = title.replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, ' ').trim()
  const name = `${n}_${safe}.png`
  try {
    await frontPage.screenshot({ path: path.join(SHOTS, name) })
    shots.push({ n, title, name, where: front === 'wallet' ? '지갑' : '브라우저' })
    info(`스크린샷 ${name}`)
  } catch (e) { info(`스크린샷 실패(무시): ${e?.message || e}`) }
}
function writeShotIndex(meta) {
  if (NO_SHOTS || !shots.length) return
  const rows = shots.map((s) => `| ${s.n} | ${s.where} | ${s.title} | \`${s.name}\` |`).join(NL)
  const md = [
    `# 시연 스크린샷 — ${meta.label}`,
    '',
    ...Object.entries(meta.facts).map(([k, v]) => `- **${k}**: ${v}`),
    '',
    '| # | 화면 | 단계 | 파일 |',
    '|---|---|---|---|',
    rows,
    '',
    '> `npm run demo` 를 다시 돌리면 이 폴더를 비우고 새로 모읍니다.',
    '',
  ].join(NL)
  fs.writeFileSync(path.join(SHOTS, 'index.md'), md)
  ok(`스크린샷 ${shots.length}장 → demo/shots/ (index.md 포함)`)
}

// ── 사전 점검 / 서비스 확보 ──────────────────────────────────────────
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

async function ensure(name, check, cwd, script, timeoutMs) {
  if (await check()) { ok(`${name} 이미 실행 중`); return }
  if (CHECK_ONLY) { info(`· ${name} 꺼져 있음 — demo 실행 시 자동으로 켭니다`); return }
  if (NO_SPAWN) fail(`${name} 이 실행돼 있지 않습니다 (--no-spawn).`)

  // 로그를 파일로 남긴다 — 버리면 왜 안 떴는지 알 수 없다.
  const log = path.join(__dirname, `${cwd.replace(/[\\/]/g, '-')}.log`)
  info(`${name} 이 없어 시작합니다 — ${cwd} · yarn ${script}`)
  const fd = fs.openSync(log, 'w')
  const child = spawn('yarn', [script], {
    cwd: path.join(ROOT, cwd), shell: true, detached: true, stdio: ['ignore', fd, fd],
  })
  child.unref()

  const t = Date.now()
  while (Date.now() - t < timeoutMs) {
    await sleep(1000)
    if (await check()) { ok(`${name} 준비됨 (${((Date.now() - t) / 1000).toFixed(0)}초)`); return }
  }
  const tail = fs.existsSync(log) ? fs.readFileSync(log, 'utf8').split(NL).slice(-12).join(NL) : ''
  fail(`${name} 을 시작했지만 ${timeoutMs / 1000}초 안에 응답하지 않았습니다.${NL}  로그: ${log}${NL}${tail}`)
}

async function preflight() {
  step('준비')
  if (!fs.existsSync(path.join(EXT_DIST, 'manifest.json'))) {
    fail(`확장 빌드가 없습니다: ${EXT_DIST}${NL}  nvm use 22.17.0 && cd wallet/extension && pnpm build`)
  }
  ok(`확장 빌드 ${EXT_DIST}`)

  const ids = registeredExtensionIds()
  if (!ids) info('⚠ 네이티브 호스트 미등록 — cd wallet/desktop && yarn register:host')
  else ok(`네이티브 호스트 등록됨 (${ids.join(', ')})`)

  await ensure('플랫폼(검증자 웹)', () => reachable(PLATFORM), 'verifier-web', 'dev', 90000)
  await ensure('데스크톱 지갑', () => reachable(`${CDP}/json/version`), 'wallet/desktop', 'dev:debug', 180000)
  return ids
}

// ── 창 배치 ──────────────────────────────────────────────────────────
async function workArea(page) {
  return page.evaluate(() => ({
    x: screen.availLeft ?? 0, y: screen.availTop ?? 0, w: screen.availWidth, h: screen.availHeight,
  }))
}

async function placeBrowser(ctx, page, side) {
  try {
    const a = await workArea(page)
    const width = Math.floor(a.w / 2)
    const left = side === 'right' ? a.x + (a.w - width) : a.x
    const cdp = await ctx.newCDPSession(page)
    const { windowId } = await cdp.send('Browser.getWindowForTarget')
    await cdp.send('Browser.setWindowBounds', {
      windowId, bounds: { left, top: a.y, width, height: a.h, windowState: 'normal' },
    })
    ok(`브라우저 → ${side === 'right' ? '오른쪽' : '왼쪽'} 절반 (${width}x${a.h})`)
    return a
  } catch (e) { info(`브라우저 배치 실패(무시): ${e?.message || e}`); return null }
}

/** 지갑은 브라우저와 같은 쪽 절반 한가운데에 정사각형으로. 반대쪽은 비워 둔다. */
async function placeWallet(wallet, area, side) {
  if (!area) return
  try {
    const halfW = Math.floor(area.w / 2)
    const originX = side === 'right' ? area.x + halfW : area.x
    const size = Math.max(560, Math.min(halfW, area.h) - MARGIN * 2)
    const x = Math.round(originX + (halfW - size) / 2)
    const y = Math.round(area.y + (area.h - size) / 2)
    const done = await wallet.evaluate(
      (b) => window.ipcRenderer?.windowSetBounds?.(b) ?? false,
      { x, y, width: size, height: size },
    )
    if (done === false) info('지갑 창 배치 API 가 없습니다 — 앱을 다시 띄우면 적용됩니다.')
    else ok(`지갑 → 같은 절반 중앙 정사각형 (${size}x${size})`)
  } catch (e) { info(`지갑 배치 실패(무시): ${e?.message || e}`) }
}

// ── 지갑 렌더러 붙기 ─────────────────────────────────────────────────
async function attachWallet() {
  const browser = await chromium.connectOverCDP(CDP)
  for (const p of browser.contexts().flatMap((c) => c.pages())) {
    const isWallet = await p.evaluate(() => typeof window.ipcRenderer !== 'undefined').catch(() => false)
    if (isWallet) return p
  }
  fail('지갑 렌더러를 찾지 못했습니다. 지갑 창이 열려 있는지 확인하세요.')
}

/** 지갑 좌측 메뉴 이동 — 있으면 누르고, 없으면 조용히 넘어간다(시연 연출용). */
async function walletNav(wallet, name) {
  try {
    const el = wallet.getByText(name, { exact: true }).first()
    await el.waitFor({ state: 'visible', timeout: 4000 })
    await click(wallet, el, `지갑 메뉴 · ${name}`)
    await wallet.waitForTimeout(700)
  } catch { /* 메뉴 구조가 다르면 넘어간다 */ }
}

// ── 본편 ─────────────────────────────────────────────────────────────
async function main() {
  if (!CHECK_ONLY && !NO_SHOTS) resetShots()
  const ids = await preflight()
  if (CHECK_ONLY) { console.log(`${NL}사전 점검만 수행했습니다 (--check).${NL}`); return }

  step('지갑 렌더러에 붙는 중')
  const wallet = await attachWallet()
  await overlay(wallet)
  ok(`지갑 창 연결됨 — ${await wallet.title()}`)

  step('브라우저를 띄우고 확장을 싣는 중')
  const profile = path.join(os.tmpdir(), `cnu-demo-profile-${Date.now()}`)
  const ctx = await chromium.launchPersistentContext(profile, {
    // 설치된 Chrome 은 137 부터 --load-extension 을 없앴다(현재 152). 확장을 실으려면
    // Playwright 가 받아 둔 Chromium 을 쓴다 — channel 을 지정하지 않으면 그쪽이다.
    headless: false, viewport: null, slowMo: SLOW,
    args: [
      `--disable-extensions-except=${EXT_DIST}`,
      `--load-extension=${EXT_DIST}`,
      ...(HALF ? [] : ['--start-maximized']),
      '--no-first-run',
    ],
  })
  await ctx.addInitScript(OVERLAY) // 페이지가 바뀌어도 커서·자막이 유지된다

  let sw = ctx.serviceWorkers()[0]
  if (!sw) sw = await ctx.waitForEvent('serviceworker', { timeout: 15000 }).catch(() => null)
  const extId = sw ? new URL(sw.url()).host : null
  if (extId) {
    ok(`확장 로드됨 — ${extId}`)
    if (ids && !ids.includes(extId)) {
      info(`⚠ 등록된 ID 와 다릅니다 — cd wallet/desktop && yarn register:host ${extId}`)
    }
  }

  const page = ctx.pages()[0] ?? (await ctx.newPage())
  let area = null
  if (HALF) { area = await placeBrowser(ctx, page, HALF); await placeWallet(wallet, area, HALF) }
  const stage = [page, wallet]

  step('지갑을 둘러본다')
  await focus('wallet', page, wallet)
  await say([wallet], '지갑에 보관된 증명서를 확인합니다.')
  await walletNav(wallet, '증명서 (VC)')
  await capture('지갑에 보관된 증명서')

  step('플랫폼 메인 화면')
  await focus('browser', page, wallet)
  await page.goto(PLATFORM, { waitUntil: 'domcontentloaded' })
  await overlay(page)
  await say([page], '메타버스 플랫폼에 접속했습니다.')
  await page.waitForTimeout(1000)
  await capture('메타버스 플랫폼 메인')

  step('인증토큰 발급 화면으로 이동')
  await click(page, page.getByRole('link', { name: /인증토큰 발급받기/ }), '인증토큰 발급받기')
  await page.waitForLoadState('domcontentloaded')
  await overlay(page)
  await say([page], '입장하려는 공간을 고릅니다.')

  const zone = page.locator('#zone')
  await click(page, zone, '공간 선택')
  await zone.selectOption(SCENARIO)
  await page.waitForTimeout(700)
  await capture('입장할 공간 선택')

  step('지갑에서 아바타 주소 가져오기 (확장 경유)')
  await say([page], '브라우저 확장을 통해 지갑의 계정 주소를 가져옵니다.')
  await page.waitForSelector('#connect:not([hidden])', { timeout: 20000 })
  await click(page, '#connect', '지갑에서 가져오기')
  await page.waitForFunction(
    () => /^0x[0-9a-fA-F]{40}$/.test(document.querySelector('#addr').value),
    null, { timeout: 30000 },
  )
  const avatar = await page.inputValue('#addr')
  ok(`아바타 주소 ${avatar}`)

  // 조회가 끝나기 전에 읽으면 "확인 중…" 이 그대로 남는다. 결론이 날 때까지 기다린다.
  await page.waitForFunction(
    () => !/확인 중/.test(document.querySelector('#status')?.textContent || '확인 중'),
    null, { timeout: 30000 },
  ).catch(() => {})
  const before = (await page.textContent('#status'))?.trim()
  await say([page], `현재 상태 — ${before}`)
  await page.waitForTimeout(1600)
  await capture('발급 전 — 미보유 확인')

  step('발급 요청을 만들어 지갑으로 보내기')
  await say(stage, '플랫폼이 발급 요청을 만들고, 확장이 그것을 데스크톱 지갑으로 나릅니다.')
  await click(page, '#send', '지갑으로 바로 보내기')
  await capture('발급 요청 생성 (QR·주소)')

  step('지갑에서 요청 승인')
  await focus('wallet', page, wallet)
  await say([wallet], '지갑이 요청을 컨트랙트에 직접 확인한 뒤 승인 창을 띄웁니다.')
  const approve = wallet.getByRole('button', { name: /승인.*발급받기/ })
  await approve.waitFor({ state: 'visible', timeout: 60000 })
  ok('승인 창이 떴습니다')
  await wallet.waitForTimeout(2000) // 내용을 볼 시간
  await capture('지갑 승인 화면 — 체인에서 확인한 내용')
  await say([wallet], '승인합니다. 영지식 증명이 만들어져 온체인에 제출됩니다.')
  await click(wallet, approve, '승인 · 발급받기')

  step('증명 생성 · 온체인 발급 (수십 초)')
  await say(stage, '영지식 증명을 만들고 Sepolia 에 제출하는 중입니다…')
  // 실패해도 4분을 기다리면 안 된다. 둘 중 먼저 뜨는 것을 잡는다.
  const verdict = await wallet.waitForFunction(() => {
    const t = document.body.innerText
    if (t.includes('인증토큰 발급 완료')) return 'ok'
    if (t.includes('인증토큰 발급 실패')) return 'fail'
    return null
  }, null, { timeout: 240000 }).then((h) => h.jsonValue())

  if (verdict === 'fail') {
    await capture('발급 실패')
    const why = await wallet.evaluate(() => {
      const t = document.body.innerText
      const i = t.indexOf('인증토큰 발급 실패')
      return t.slice(i, i + 400).split(String.fromCharCode(10)).slice(1, 5).join(' ').trim()
    })
    throw new Error(`지갑에서 발급이 실패했습니다 — ${why}`)
  }
  ok('발급 완료 창')
  await capture('발급 완료 — 토큰 ID·트랜잭션')

  const detail = await wallet.evaluate(() => {
    const t = document.body.innerText
    return { txHash: t.match(/0x[0-9a-fA-F]{64}/)?.[0] ?? null, tokenId: t.match(/토큰 ID:\s*(\S+)/)?.[1] ?? null }
  })
  if (detail.tokenId) ok(`토큰 ID ${detail.tokenId}`)
  if (detail.txHash) ok(`트랜잭션 ${detail.txHash}`)

  step('지갑에서 발급된 인증토큰 확인')
  await say([wallet], '발급된 인증토큰을 지갑에서 확인합니다.')
  await click(wallet, wallet.getByRole('button', { name: '인증토큰 보기' }), '인증토큰 보기').catch(() => {})
  await wallet.waitForTimeout(1500)
  await capture('지갑의 인증토큰 목록')

  step('플랫폼이 체인을 조회해 입장 판정')
  await focus('browser', page, wallet)
  await say([page], '플랫폼은 지갑의 말을 믿지 않고 컨트랙트에 직접 물어 확인합니다.')
  await page.waitForFunction(
    (want) => (document.querySelector('#status')?.textContent || '').includes(want),
    `${ZONE[SCENARIO].zone} 입장 가능`,
    { timeout: 180000 },
  )
  const after = (await page.textContent('#status'))?.trim()
  ok(`상태: ${after}`)
  await say([page], `${after} — 시연 완료`)
  await page.waitForTimeout(600)
  await capture('발급 후 — 입장 가능')

  const line = '─'.repeat(58)
  console.log(`${NL}${line}`)
  console.log(`  시나리오   ${ZONE[SCENARIO].label} (${SCENARIO})`)
  console.log(`  아바타     ${avatar}`)
  console.log(`  이전 상태  ${before}`)
  console.log(`  이후 상태  ${after}`)
  if (detail.tokenId) console.log(`  토큰 ID    ${detail.tokenId}`)
  if (detail.txHash) console.log(`  트랜잭션   https://sepolia.etherscan.io/tx/${detail.txHash}`)
  console.log(`  소요       ${((Date.now() - t0) / 1000).toFixed(1)}초`)
  console.log(`${line}${NL}`)

  writeShotIndex({
    label: `${ZONE[SCENARIO].label} (${SCENARIO})`,
    facts: {
      '아바타': avatar,
      '이전 상태': before,
      '이후 상태': after,
      '토큰 ID': detail.tokenId ?? '-',
      '트랜잭션': detail.txHash ? `https://sepolia.etherscan.io/tx/${detail.txHash}` : '-',
    },
  })

  if (!has('keep')) {
    info('20초 뒤 브라우저를 닫습니다 (--keep 으로 열어 둘 수 있습니다).')
    await page.waitForTimeout(20000)
    await ctx.close()
  } else {
    info('브라우저를 열어 둡니다. Ctrl+C 로 끝내세요.')
  }
}

main().catch((e) => { console.error(`${NL}✗ ${e?.message || e}${NL}`); process.exit(1) })
