// 충남대 학적 증명서 발급 흐름(아이서티 스타일): 학적조회 → 증명서 확인 → 지갑 발급.
// 백엔드 API(/api/students/verify, /api/issue/vc)와 지갑 확장 연동(postMessage)은 유지.

async function json(path, opts = {}) {
  const res = await fetch(path, { credentials: 'include', headers: { 'Content-Type': 'application/json' }, ...opts })
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || '요청 실패')
  return res.json()
}

const state = { student: null }

document.addEventListener('DOMContentLoaded', () => {
  attachBirthMask()
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

async function onVerify() {
  try {
    hideError()
    const studentId = val('studentId'), birth = val('birth')
    if (!studentId || !birth) return showError('학번과 생년월일을 입력해주세요.')
    const data = await json('/api/students/verify', { method: 'POST', body: JSON.stringify({ studentId, birth }) })
    state.student = data.student
    renderCert(data.student)
    gotoStep(2)
  } catch (e) { showError('학적 조회 실패: ' + (e.message || e)) }
}

function renderCert(s) {
  const isGrad = s.status === '졸업'
  const certType = isGrad ? '졸업증명서' : '재학증명서'
  const validText = isGrad && s.graduationYear ? `${s.graduationYear + 5}-02-28 까지` : '발급일로부터 1년'
  document.getElementById('certType').textContent = certType
  document.getElementById('c_name').textContent = s.name
  document.getElementById('c_sid').textContent = s.studentId
  document.getElementById('c_birth').textContent = s.birth
  document.getElementById('c_degree').textContent = s.degree
  document.getElementById('c_college').textContent = s.college
  document.getElementById('c_dept').textContent = s.department
  document.getElementById('c_status').textContent = s.status
  document.getElementById('c_valid').textContent = validText
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
    if (!state.student) return showError('먼저 학적을 조회해주세요.')
    const data = await json('/api/issue/vc', {
      method: 'POST',
      body: JSON.stringify({ studentId: state.student.studentId, birth: state.student.birth, walletAddress }),
    })
    displayVcResult(data.vc, data.certificateType)
    try { await requestVCIssuanceApproval(data.vc, state.student) } catch (err) { console.log('VC 발급 승인 실패:', err) }
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
function displayVcResult(vc, certType) {
  const vcJson = JSON.stringify(vc, null, 2)
  window.currentVC = vcJson
  const el = document.getElementById('vcResult')
  el.innerHTML = `
    <div class="vc-display">
      <h4>발급된 ${certType || '학적 증명서'} VC</h4>
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
