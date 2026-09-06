// [작업] 발급 화면 동작 — 발급 요청 생성(QR·복사·확장 전달) + 아바타의 인증토큰 보유 상태를 온체인에서 확인.
//        보유 확인은 컨트랙트의 hasValidPass 를 직접 호출한다. 보유가 아니라 "유효한 보유" 를 묻는다.
// [결과] 요청 만들기 → 지갑으로 전달(확장) 또는 QR/주소 → 승인 → 폴링이 발급을 감지해 입장 가능으로 바뀐다.
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

  // ── 브라우저 확장 연동 ──────────────────────────────────────────────────
  // 확장은 요청을 나르기만 한다. 키도 승인도 데스크톱 지갑 프로그램에 있으므로,
  // 확장이 있어도 사용자는 데스크톱 창에서 직접 승인해야 한다.
  const ext = (() => {
    let detected = false;
    const waiters = new Map();

    window.addEventListener('message', (e) => {
      if (e.source !== window || !e.data || typeof e.data.type !== 'string') return;
      if (e.data.type === 'DID_WALLET_EXTENSION_DETECTED') {
        if (!detected) { detected = true; onDetected(); }
        return;
      }
      const w = waiters.get(e.data.type);
      if (w) { waiters.delete(e.data.type); w(e.data); }
    });

    function call(reqType, resType, payload, timeoutMs) {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          waiters.delete(resType);
          reject(new Error('지갑이 응답하지 않습니다. 데스크톱 지갑 프로그램이 실행 중인지 확인하세요.'));
        }, timeoutMs);
        waiters.set(resType, (d) => { clearTimeout(timer); resolve(d); });
        window.postMessage({ type: reqType, ...payload }, '*');
      });
    }

    // 확장은 content script 가 붙은 뒤에야 응답한다. 잠깐 동안 몇 번 물어본다.
    let pings = 0;
    const pinger = setInterval(() => {
      if (detected || ++pings > 6) return clearInterval(pinger);
      window.postMessage({ type: 'DID_WALLET_PING' }, '*');
    }, 400);
    window.postMessage({ type: 'DID_WALLET_PING' }, '*');

    return {
      get detected() { return detected; },
      getAddress: () => call('DID_WALLET_REQUEST_ADDRESS', 'DID_WALLET_ADDRESS_RESPONSE', {}, 20000),
      // 데스크톱은 사용자가 승인 버튼을 누르면 곧바로 응답한다(발급 완료까지 기다리지 않는다).
      sendRequest: (url) => call('DID_WALLET_REQUEST_PASS', 'DID_WALLET_PASS_RESPONSE', { url }, 190000),
    };
  })();

  function onDetected() {
    $('extRow').hidden = false;
    $('extNote').textContent = '브라우저 확장이 감지되었습니다. 복사·QR 없이 지갑으로 바로 보낼 수 있습니다.';
    $('extNote').className = 'note ok-text';
    $('send').hidden = false;
    $('connect').hidden = false;
  }

  let poll = null;

  function setStatus(text, cls) {
    const el = $('status');
    el.textContent = text;
    el.className = 'badge' + (cls ? ' ' + cls : '');
  }

  function markStep(n) {
    for (let i = 1; i <= 4; i++) $('s' + i).classList.toggle('done', i <= n);
  }

  // 발급까지는 증명 생성 + 트랜잭션 확정이 걸린다. 다만 무한히 돌지는 않는다 —
  // 지갑 쪽에서 실패했을 수 있으므로 3분이 지나면 확인하라고 말한다.
  function startPolling() {
    if (poll) clearInterval(poll);
    if (!isAddr($('addr').value.trim())) return;
    setStatus('지갑에서 승인을 기다리는 중…', 'warn');
    markStep(3);
    let left = 45;
    poll = setInterval(() => {
      if (--left <= 0) {
        clearInterval(poll); poll = null;
        setStatus('발급이 확인되지 않았습니다. 지갑 화면을 확인해 주세요.', 'warn');
        return;
      }
      void refreshHolding();
    }, 4000);
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

  // 요청을 만들어 화면에 띄운다. 이미 만들어 둔 요청이 있으면 그대로 쓴다.
  let currentReq = null;
  async function makeRequest() {
    const scenario = $('zone').value;
    if (currentReq && currentReq.scenario === scenario) return currentReq;

    const res = await fetch('/pass-request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scenario }),
    });
    const j = await res.json();
    if (!j.ok) throw new Error(j.error || '요청 생성 실패');
    currentReq = { ...j, scenario };

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
    return currentReq;
  }

  $('make').addEventListener('click', () => {
    void (async () => {
      $('make').disabled = true;
      try {
        await makeRequest();
        startPolling();
      } catch (e) {
        setStatus('요청 생성 실패: ' + e.message, 'bad');
      } finally {
        $('make').disabled = false;
      }
    })();
  });

  // 확장이 있으면 요청 생성부터 전달까지 한 번에 한다.
  $('send').addEventListener('click', () => {
    void (async () => {
      $('send').disabled = true;
      const label = $('send').textContent;
      try {
        const req = await makeRequest();
        $('send').textContent = '지갑에서 승인해 주세요…';
        setStatus('지갑 창에서 승인을 기다리는 중…', 'warn');
        markStep(3);

        const r = await ext.sendRequest(req.url);
        if (!r.ok) throw new Error(r.error || '지갑에 전달하지 못했습니다');
        if (!r.accepted) { setStatus(r.error || '지갑에서 승인되지 않았습니다 (거절 또는 시간 초과)', 'bad'); markStep(2); return; }

        // 데스크톱이 바인딩할 지갑주소를 알려준다 — 사용자가 직접 입력할 필요가 없다.
        if (r.address && isAddr(r.address)) {
          $('addr').value = r.address;
          localStorage.setItem('demo.avatarAddress', r.address);
        }
        setStatus('승인됨 — 증명 생성 및 발급 중…', 'warn');
        startPolling();
      } catch (e) {
        setStatus(e.message, 'bad');
      } finally {
        $('send').disabled = false;
        $('send').textContent = label;
      }
    })();
  });

  // 확장을 통해 데스크톱 지갑의 활성 계정 주소를 가져온다.
  $('connect').addEventListener('click', () => {
    void (async () => {
      $('connect').disabled = true;
      try {
        const r = await ext.getAddress();
        if (!r.success || !r.address) throw new Error(r.error || '지갑 주소를 가져오지 못했습니다');
        $('addr').value = r.address;
        localStorage.setItem('demo.avatarAddress', r.address);
        await refreshHolding();
      } catch (e) {
        setStatus(e.message, 'bad');
      } finally {
        $('connect').disabled = false;
      }
    })();
  });

  $('recheck').addEventListener('click', refreshHolding);
  $('zone').addEventListener('change', () => { currentReq = null; markStep(1); refreshHolding(); });
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
