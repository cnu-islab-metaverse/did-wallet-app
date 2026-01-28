async function json(path, opts = {}) {
  const res = await fetch(path, { credentials: 'include', headers: { 'Content-Type': 'application/json' }, ...opts })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

let currentResident = null

document.addEventListener('DOMContentLoaded', () => {
  const birthInput = document.getElementById('birth')
  if (birthInput) {
    birthInput.addEventListener('input', (e) => {
      let value = e.target.value.replace(/\D/g, '')
      let formattedValue = ''
      if (value.length > 0) {
        formattedValue = value.substring(0, 4)
        if (value.length > 4) {
          formattedValue += '-' + value.substring(4, 6)
          if (value.length > 6) {
            formattedValue += '-' + value.substring(6, 8)
          }
        }
      }
      e.target.value = formattedValue
    })
  }

  const verifyBtn = document.getElementById('verifyBtn')
  if (verifyBtn) {
    verifyBtn.addEventListener('click', async () => {
      try {
        const name = document.getElementById('name').value.trim()
        const birth = document.getElementById('birth').value.trim()
        const rrnSuffix = document.getElementById('rrnSuffix').value.trim()
        if (!name || !birth || !rrnSuffix) {
          showError('성명, 생년월일, 주민등록번호 뒤 2자리를 입력해주세요.')
          return
        }
        const data = await json('/api/residents/verify', { method: 'POST', body: JSON.stringify({ name, birth, rrnSuffix }) })
        if (data.ok) {
          currentResident = data.resident
          displayIdCard(data.resident)
          hideError()
        } else {
          showError('주민등록정보를 찾을 수 없습니다.')
        }
      } catch (e) {
        showError(`조회 실패: ${e.message || e}`)
      }
    })
  }

  const issueBtn = document.getElementById('issueBtn')
  const genAddrBtn = document.getElementById('genAddrBtn')
  if (issueBtn) {
    issueBtn.addEventListener('click', async () => {
      try {
        const walletAddress = document.getElementById('walletAddress').value.trim()
        if (!walletAddress) { showError('지갑 주소를 입력해주세요.', false); return }
        if (!currentResident) { showError('먼저 주민등록정보를 조회해주세요.', false); return }
        const data = await json('/api/issue/vc', { method: 'POST', body: JSON.stringify({ nationalId: currentResident.nationalId, walletAddress }) })
        const vc = data.vc
        displayVcResult(vc)

        // 확장프로그램에 VC 발급 승인 요청 (자동 팝업 트리거)
        try {
          await requestVCIssuanceApproval(vc, currentResident)
        } catch (error) {
          // 승인 거절 또는 확장프로그램 미응답 시에도 화면 표시 유지
          console.log('VC 발급 승인 실패:', error)
        }
      } catch (e) {
        showError(`VC 발급 실패: ${e.message || e}`, false)
      }
    })
  }

  if (genAddrBtn) {
    genAddrBtn.addEventListener('click', async () => {
      try { await connectWallet() } catch (e) { showError('지갑 연결 실패: ' + (e.message || e), false) }
    })
  }
})

async function connectWallet() {
  return new Promise((resolve, reject) => {
    let extensionDetected = false
    let addressReceived = false
    const handleMessage = (event) => {
      if (event.source !== window) return
      const { type, success, address, error } = event.data || {}
      switch (type) {
        case 'DID_WALLET_EXTENSION_DETECTED':
          extensionDetected = true
          break
        case 'DID_WALLET_ADDRESS_RESPONSE':
          addressReceived = true
          window.removeEventListener('message', handleMessage)
          if (success) {
            document.getElementById('walletAddress').value = address
            resolve(address)
          } else {
            reject(new Error(error || '지갑 연결이 거절되었습니다'))
          }
          break
      }
    }
    window.addEventListener('message', handleMessage)
    window.postMessage({ type: 'DID_WALLET_PING' }, '*')
    setTimeout(() => {
      if (!extensionDetected) {
        window.removeEventListener('message', handleMessage)
        reject(new Error('DID Wallet 확장프로그램이 설치되지 않았습니다'))
        return
      }
      window.postMessage({ type: 'DID_WALLET_REQUEST_ADDRESS' }, '*')
      setTimeout(() => {
        if (!addressReceived) {
          window.removeEventListener('message', handleMessage)
          reject(new Error('지갑 주소 요청 시간이 초과되었습니다'))
        }
      }, 30000)
    }, 2000)
  })
}

function displayIdCard(resident) {
  Array.from(document.getElementsByClassName('person-info')).forEach(element => {
    switch (element.id) {
      case 'profileImage': element.src = resident.profileImage; break
      case 'residentName': element.textContent = resident.name; break
      case 'residentBirth': element.textContent = resident.birth; break
      case 'residentAddress': element.textContent = resident.address; break
      case 'rrnMasked': element.textContent = resident.rrnMasked; break
    }
  })
  document.getElementById('idIssueDate').textContent = new Date().toLocaleDateString('ko-KR')
  document.getElementById('idSection').style.display = 'block'
}

function displayVcResult(vc) {
  const vcResultDiv = document.getElementById('vcResult')
  const vcJson = JSON.stringify(vc, null, 2)
  window.currentVC = vcJson
  vcResultDiv.innerHTML = `
    <div class="vc-display">
      <h4>발급된 신원 VC</h4>
      <div class="vc-content" onclick="copyCurrentVC()" title="클릭하여 VC JSON 복사" style="cursor: pointer; border: 1px solid #ddd; padding: 10px; border-radius: 5px; background: #f9f9f9;">
        <pre>${vcJson}</pre>
      </div>
      <p class="copy-hint">\uD83D\uDCDD 위 VC를 클릭하면 클립보드에 복사됩니다</p>
    </div>
  `
  vcResultDiv.style.display = 'block'
}

async function copyCurrentVC() {
  if (window.currentVC) {
    await copyToClipboard(window.currentVC, 'VC')
  }
}

function showError(message, hideIdCard = true) {
  document.getElementById('errorMessage').textContent = message
  document.getElementById('errorMessage').style.display = 'block'
  if (hideIdCard) document.getElementById('idSection').style.display = 'none'
}

function hideError() { document.getElementById('errorMessage').style.display = 'none' }

async function copyToClipboard(text, label = '') {
  try {
    await navigator.clipboard.writeText(text)
    showTemporaryMessage(`${label} 클립보드에 복사되었습니다! 📋`)
  } catch (err) {
    const textArea = document.createElement('textarea')
    textArea.value = text
    document.body.appendChild(textArea)
    textArea.select()
    document.execCommand('copy')
    document.body.removeChild(textArea)
    showTemporaryMessage(`${label} 클립보드에 복사되었습니다! 📋`)
  }
}

function showTemporaryMessage(message) {
  const existingMsg = document.getElementById('tempMessage')
  if (existingMsg) existingMsg.remove()
  const msgDiv = document.createElement('div')
  msgDiv.id = 'tempMessage'
  msgDiv.textContent = message
  msgDiv.style.cssText = `position: fixed; top: 20px; right: 20px; z-index: 1000; background: #10b981; color: white; padding: 12px 20px; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); font-weight: 600; animation: fadeInOut 3s ease-in-out;`
  document.body.appendChild(msgDiv)
  setTimeout(() => msgDiv.remove(), 3000)
}

// VC 발급 승인 요청 함수 (확장프로그램 팝업 자동 트리거)
async function requestVCIssuanceApproval(vc, resident) {
  return new Promise((resolve, reject) => {
    let responseReceived = false

    const handleApprovalResponse = (event) => {
      if (event.source !== window) return
      const { type, approved, error } = event.data || {}
      if (type === 'DID_WALLET_VC_ISSUANCE_RESPONSE') {
        responseReceived = true
        window.removeEventListener('message', handleApprovalResponse)
        if (approved) {
          // 승인 시 VC 표시 및 저장 시도
          displayVcResult(vc)
          setTimeout(() => { saveVCToExtension() }, 1000)
          resolve()
        } else {
          reject(new Error(error || 'VC 발급이 거절되었습니다'))
        }
      }
    }

    window.addEventListener('message', handleApprovalResponse)

    // 확장프로그램에 VC 발급 승인 요청
    window.postMessage({
      type: 'DID_WALLET_REQUEST_VC_ISSUANCE',
      vc: vc,
      student: resident,
      origin: window.location.origin
    }, '*')

    // 30초 타임아웃
    setTimeout(() => {
      if (!responseReceived) {
        window.removeEventListener('message', handleApprovalResponse)
        reject(new Error('VC 발급 승인 요청 시간이 초과되었습니다'))
      }
    }, 30000)
  })
}

// VC를 확장프로그램에 저장
async function saveVCToExtension() {
  if (!window.currentVC) return
  try {
    window.postMessage({ type: 'DID_WALLET_SAVE_VC', vc: JSON.parse(window.currentVC) }, '*')
    showTemporaryMessage('VC가 확장프로그램에 저장되었습니다! 📱')
  } catch (error) {
    showError('VC 저장에 실패했습니다: ' + (error.message || error), false)
  }
}


