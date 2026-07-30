// 정부24 스타일 발급 흐름: 종류 선택(주민등록증/운전면허증) → 본인확인 → 정보확인 → 지갑 발급.
// 백엔드 API(/api/residents/verify, /api/issue/vc)와 지갑 확장 연동(postMessage)은 그대로 유지.

async function json(path, opts = {}) {
  const res = await fetch(path, { credentials: 'include', headers: { 'Content-Type': 'application/json' }, ...opts })
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || (await res.text().catch(() => '요청 실패')))
  return res.json()
}

const state = { type: 'resident', resident: null, driver: null, driverEligible: false }

const TYPE_LABEL = { resident: '주민등록증', driver: '운전면허증' }

document.addEventListener('DOMContentLoaded', () => {
  attachBirthMask()
  // 종류 탭(상단 카드 + GNB) 전환
  document.querySelectorAll('[data-tab]').forEach((el) => {
    el.addEventListener('click', (e) => { e.preventDefault(); selectType(el.dataset.tab) })
  })
  document.getElementById('verifyBtn').addEventListener('click', onVerify)
  document.getElementById('toIssueBtn').addEventListener('click', () => gotoStep(3))
  document.getElementById('backBtn').addEventListener('click', () => gotoStep(1))
  document.getElementById('genAddrBtn').addEventListener('click', onConnectWallet)
  document.getElementById('issueBtn').addEventListener('click', onIssue)
})

function attachBirthMask() {
  const birth = document.getElementById('birth')
  birth.addEventListener('input', (e) => {
    let v = e.target.value.replace(/\D/g, ''), out = ''
    if (v.length) { out = v.slice(0, 4); if (v.length > 4) out += '-' + v.slice(4, 6); if (v.length > 6) out += '-' + v.slice(6, 8) }
    e.target.value = out
  })
}

function selectType(type) {
  if (type !== 'resident' && type !== 'driver') return
  state.type = type
  document.querySelectorAll('.type-tab').forEach((t) => t.classList.toggle('is-active', t.dataset.tab === type))
  const label = TYPE_LABEL[type]
  document.getElementById('pageTitle').textContent = `${label} 전자증명서(VC) 발급`
  document.getElementById('crumbType').textContent = `${label} 발급`
  // 이미 본인확인 했으면 카드 미리보기 갱신
  if (state.resident) renderPreview()
}

async function onVerify() {
  try {
    hideError()
    const name = val('name'), birth = val('birth'), rrnSuffix = val('rrnSuffix')
    if (!name || !birth || !rrnSuffix) return showError('성명, 생년월일, 주민등록번호 뒤 1자리를 입력해주세요.')
    const data = await json('/api/residents/verify', { method: 'POST', body: JSON.stringify({ name, birth, rrnSuffix }) })
    state.resident = data.resident
    state.driver = data.driver
    state.driverEligible = !!data.driverEligible
    renderPreview()
    gotoStep(2)
  } catch (e) { showError('본인확인 실패: ' + (e.message || e)) }
}

function renderPreview() {
  const r = state.resident
  if (!r) return
  const isDriver = state.type === 'driver'
  document.getElementById('cardResident').hidden = isDriver
  document.getElementById('cardDriver').hidden = !isDriver

  // 주민등록증
  document.getElementById('r_photo').src = r.profileImage
  document.getElementById('r_name').textContent = r.name
  document.getElementById('r_rrn').textContent = r.rrnMasked
  document.getElementById('r_addr').textContent = r.address
  document.getElementById('r_date').textContent = '발급일 ' + new Date().toLocaleDateString('ko-KR')
  document.getElementById('r_issuer').textContent = r.issuernm || '행정안전부장관'

  // 운전면허증
  const blocked = document.getElementById('driverBlocked')
  const toIssue = document.getElementById('toIssueBtn')
  if (isDriver && !state.driverEligible) {
    document.getElementById('cardDriver').hidden = true
    blocked.hidden = false
    toIssue.disabled = true
    toIssue.classList.add('btn--ghost')
  } else {
    blocked.hidden = true
    toIssue.disabled = false
    toIssue.classList.remove('btn--ghost')
    if (isDriver && state.driver) {
      const d = state.driver
      document.getElementById('d_photo').src = r.profileImage
      document.getElementById('d_name').textContent = r.name
      document.getElementById('d_no').textContent = d.licenseNumber
      document.getElementById('d_type').textContent = d.licenseType
      document.getElementById('d_addr').textContent = r.address
      document.getElementById('d_renew').textContent = `${d.renewalFrom} ~ ${d.renewalUntil}`
      document.getElementById('d_date').textContent = '발급일 ' + d.issuedOn
      document.getElementById('d_issuer').textContent = d.issuer
    }
  }
}

function gotoStep(n) {
  document.getElementById('stepVerify').hidden = n !== 1
  document.getElementById('stepPreview').hidden = n !== 2
  document.getElementById('stepIssue').hidden = n !== 3
  document.querySelectorAll('.step').forEach((s) => {
    const sn = Number(s.dataset.step)
    s.classList.toggle('is-active', sn === n)
    s.classList.toggle('is-done', sn < n)
  })
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

async function onIssue() {
  try {
    hideError()
    const walletAddress = val('walletAddress')
    if (!walletAddress) return showError('지갑 주소를 입력하거나 지갑을 연결해주세요.')
    if (!state.resident) return showError('먼저 본인확인을 해주세요.')
    const data = await json('/api/issue/vc', {
      method: 'POST',
      body: JSON.stringify({ nationalId: state.resident.nationalId, walletAddress, credentialType: state.type }),
    })
    displayVcResult(data.vc)
    try { await requestVCIssuanceApproval(data.vc, state.resident) } catch (err) { console.log('VC 발급 승인 실패:', err) }
  } catch (e) { showError('VC 발급 실패: ' + (e.message || e)) }
}

/* ── 지갑 확장 연동 (기존 프로토콜 유지) ───────────────────────────── */
async function onConnectWallet() {
  try { await connectWallet() } catch (e) { showError('지갑 연결 실패: ' + (e.message || e)) }
}

function connectWallet() {
  return new Promise((resolve, reject) => {
    let detected = false, received = false
    const onMsg = (event) => {
      if (event.source !== window) return
      const { type, success, address, error } = event.data || {}
      if (type === 'DID_WALLET_EXTENSION_DETECTED') detected = true
      if (type === 'DID_WALLET_ADDRESS_RESPONSE') {
        received = true; window.removeEventListener('message', onMsg)
        if (success) { document.getElementById('walletAddress').value = address; resolve(address) }
        else reject(new Error(error || '지갑 연결이 거절되었습니다'))
      }
    }
    window.addEventListener('message', onMsg)
    window.postMessage({ type: 'DID_WALLET_PING' }, '*')
    setTimeout(() => {
      if (!detected) { window.removeEventListener('message', onMsg); return reject(new Error('DID Wallet 확장프로그램이 설치되지 않았습니다')) }
      window.postMessage({ type: 'DID_WALLET_REQUEST_ADDRESS' }, '*')
      setTimeout(() => { if (!received) { window.removeEventListener('message', onMsg); reject(new Error('지갑 주소 요청 시간이 초과되었습니다')) } }, 30000)
    }, 2000)
  })
}

function requestVCIssuanceApproval(vc, subject) {
  return new Promise((resolve, reject) => {
    let responded = false
    const onMsg = (event) => {
      if (event.source !== window) return
      const { type, approved, error } = event.data || {}
      if (type === 'DID_WALLET_VC_ISSUANCE_RESPONSE') {
        responded = true; window.removeEventListener('message', onMsg)
        if (approved) { setTimeout(saveVCToExtension, 800); resolve() }
        else reject(new Error(error || 'VC 발급이 거절되었습니다'))
      }
    }
    window.addEventListener('message', onMsg)
    window.postMessage({ type: 'DID_WALLET_REQUEST_VC_ISSUANCE', vc, subject, origin: window.location.origin }, '*')
    setTimeout(() => { if (!responded) { window.removeEventListener('message', onMsg); reject(new Error('VC 발급 승인 요청 시간이 초과되었습니다')) } }, 30000)
  })
}

function saveVCToExtension() {
  if (!window.currentVC) return
  try {
    window.postMessage({ type: 'DID_WALLET_SAVE_VC', vc: JSON.parse(window.currentVC) }, '*')
    toast('VC가 지갑에 저장되었습니다 📱')
  } catch (e) { showError('VC 저장 실패: ' + (e.message || e)) }
}

/* ── 렌더/유틸 ──────────────────────────────────────────────────── */
function displayVcResult(vc) {
  const vcJson = JSON.stringify(vc, null, 2)
  window.currentVC = vcJson
  const el = document.getElementById('vcResult')
  el.innerHTML = `
    <div class="vc-display">
      <h4>발급된 ${TYPE_LABEL[state.type]} VC</h4>
      <div class="vc-content" onclick="copyCurrentVC()" title="클릭하여 VC JSON 복사"><pre>${escapeHtml(vcJson)}</pre></div>
      <p class="copy-hint">📝 위 VC를 클릭하면 클립보드에 복사됩니다.</p>
    </div>`
}

function copyCurrentVC() { if (window.currentVC) copyToClipboard(window.currentVC, 'VC') }

async function copyToClipboard(text, label = '') {
  try { await navigator.clipboard.writeText(text); toast(`${label} 클립보드에 복사되었습니다 📋`) }
  catch {
    const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta)
    ta.select(); document.execCommand('copy'); document.body.removeChild(ta); toast(`${label} 클립보드에 복사되었습니다 📋`)
  }
}

function toast(message) {
  const old = document.getElementById('tempMessage'); if (old) old.remove()
  const div = document.createElement('div'); div.id = 'tempMessage'; div.textContent = message
  div.style.cssText = 'position:fixed;top:20px;right:20px;z-index:1000;background:#1a9d5a;color:#fff;padding:12px 20px;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,.15);font-weight:700;animation:fadeInOut 3s ease-in-out'
  document.body.appendChild(div); setTimeout(() => div.remove(), 3000)
}

function val(id) { return (document.getElementById(id).value || '').trim() }
function showError(msg) { const e = document.getElementById('errorMessage'); e.textContent = msg; e.hidden = false }
function hideError() { document.getElementById('errorMessage').hidden = true }
function escapeHtml(s) { return s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])) }
