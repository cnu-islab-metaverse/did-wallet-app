// [작업] 발급 화면 동작 — 발급 요청 생성(QR·복사) + 아바타의 인증토큰 보유 상태를 온체인에서 확인.
//        보유 확인은 컨트랙트의 hasValidPass 를 직접 호출한다. 보유가 아니라 "유효한 보유" 를 묻는다.
// [결과] 요청 만들기 → QR/주소 → 지갑에서 승인 → 폴링이 발급을 감지해 입장 가능으로 바뀐다.
(() => {
  const $ = (id) => document.getElementById(id);
  const cfg = window.DEPLOYMENT_CONFIG;
  const SBT = cfg.getDeploymentConfig().contract.zkCredentialSBT;
  const RPC = cfg.getDeploymentConfig().network.rpcUrl;
  const PASS_TYPE = cfg.PASS_TYPE;

  const ZONE = {
    youth_pass: { label: '지역청년패스', passType: PASS_TYPE.youthPass, zone: '대전 청년 라운지' },
    regional_national_univ: { label: '지방거점국립대 소속', passType: PASS_TYPE.regionalUniv, zone: '대학 협력관' },
  };

  const pad64 = (h) => h.padStart(64, '0');
  const isAddr = (a) => /^0x[0-9a-fA-F]{40}$/.test(a);

  // hasValidPass(address,uint256) — 씬(metaverse-scene)이 쓰는 것과 같은 호출.
  async function hasValidPass(addr, passType) {
    const data = '0xcf1d2878' + pad64(addr.toLowerCase().replace(/^0x/, '')) + pad64(passType.toString(16));
    const res = await fetch(RPC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ to: SBT, data }, 'latest'] }),
    });
    const j = await res.json();
    if (j.error) throw new Error(j.error.message);
    return BigInt(j.result || '0x0') !== 0n;
  }

  let poll = null;
  let currentReq = null;

  function setStatus(text, cls) {
    const el = $('status');
    el.textContent = text;
    el.className = 'badge' + (cls ? ' ' + cls : '');
  }

  function markStep(n) {
    for (let i = 1; i <= 4; i++) $('s' + i).classList.toggle('done', i <= n);
  }

  async function refreshHolding() {
    const addr = $('addr').value.trim();
    const z = ZONE[$('zone').value];
    if (!isAddr(addr)) return setStatus('주소를 입력하세요');
    setStatus('확인 중…');
    try {
      const ok = await hasValidPass(addr, z.passType);
      if (ok) {
        setStatus(`${z.zone} 입장 가능`, 'ok');
        markStep(4);
        if (poll) { clearInterval(poll); poll = null; }
      } else {
        setStatus(`${z.label} 미보유 — 입장 불가`, 'bad');
      }
      return ok;
    } catch (e) {
      setStatus('조회 실패: ' + e.message, 'warn');
      return false;
    }
  }

  async function makeRequest() {
    const scenario = $('zone').value;
    $('make').disabled = true;
    try {
      const res = await fetch('/pass-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenario }),
      });
      const j = await res.json();
      if (!j.ok) throw new Error(j.error || '요청 생성 실패');
      currentReq = j;

      $('url').value = j.url;
      $('reqCard').hidden = false;
      $('meta').innerHTML = [
        ['공간', ZONE[scenario].zone],
        ['필요 패스', `${ZONE[scenario].label} · passType ${j.request.passType}`],
        ['제출 대상', j.request.contract],
        ['네트워크', `chainId ${j.request.chainId}`],
      ].map(([k, v]) => `<div class="kv"><span>${k}</span><span class="${k === '제출 대상' ? 'mono' : ''}">${v}</span></div>`).join('');

      const qr = await fetch(j.url + '/qr.svg');
      $('qrBox').innerHTML = await qr.text();

      markStep(2);
      // 지갑에서 승인하면 온체인에 반영된다. 그때까지 주기적으로 확인한다.
      if (poll) clearInterval(poll);
      if (isAddr($('addr').value.trim())) {
        setStatus('지갑에서 승인을 기다리는 중…', 'warn');
        markStep(3);
        poll = setInterval(refreshHolding, 4000);
      }
    } catch (e) {
      setStatus('요청 생성 실패: ' + e.message, 'bad');
    } finally {
      $('make').disabled = false;
    }
  }

  $('make').addEventListener('click', makeRequest);
  $('recheck').addEventListener('click', refreshHolding);
  $('zone').addEventListener('change', () => { markStep(1); refreshHolding(); });
  $('addr').addEventListener('change', () => { markStep(1); refreshHolding(); });

  $('copy').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText($('url').value);
      $('copy').textContent = '복사됨';
      setTimeout(() => ($('copy').textContent = '복사'), 1500);
    } catch {
      $('url').select();
    }
  });

  // 이전에 입력한 주소를 기억해 시연 중 재입력을 줄인다.
  const saved = localStorage.getItem('demo.avatarAddress');
  if (saved) { $('addr').value = saved; refreshHolding(); }
  $('addr').addEventListener('input', () => localStorage.setItem('demo.avatarAddress', $('addr').value.trim()));
})();
