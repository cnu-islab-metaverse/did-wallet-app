(function(){
  const $ = (sel)=>document.querySelector(sel);
  const $$ = (sel)=>document.querySelectorAll(sel);
  const steps = $('#steps');
  const regionSel = $('#region');
  const startBtn = $('#startBtn');
  const connectBtn = $('#connectWalletBtn');
  const errBox = $('#error');
  const sbtOut = $('#sbtOut');
  const walletInput = $('#walletAddress');
  
  let selectedVcType = 'rrn';
  
  // Handle VC type toggle buttons
  $$('.toggle-btn').forEach(btn => {
    btn.addEventListener('click', ()=>{
      $$('.toggle-btn').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      selectedVcType = btn.dataset.vcType;
    });
  });

  // Update region in conditions box when region selector changes
  regionSel?.addEventListener('change', ()=>{
    const requiredRegion = $('#required-region');
    if (requiredRegion) {
      setText(requiredRegion, regionSel.value);
    }
  });

  // Initialize region on page load
  window.addEventListener('DOMContentLoaded', ()=>{
    const requiredRegion = $('#required-region');
    if (requiredRegion && regionSel) {
      setText(requiredRegion, regionSel.value);
    }
  });

  function show(el){ el.classList.remove('hidden'); }
  function hide(el){ el.classList.add('hidden'); }
  function setText(el, text){ el.textContent = text; }

  function reset(){
    hide(errBox);
    setText(errBox, '');
    show(steps);
    hide($('#step-0'));
    show($('#step-1'));
    hide($('#step-2'));
    hide($('#step-3'));
    setText(sbtOut, '');
  }

  async function json(url, init){
    const res = await fetch(url, Object.assign({ headers: { 'Content-Type': 'application/json' }}, init));
    if(!res.ok) throw new Error(await res.text().catch(()=>res.statusText));
    return await res.json();
  }

  // Mirror issuer-web handshake: ping → detect → send request → await response
  async function requestProofApproval(region, vcType, prep){
    return new Promise((resolve)=>{
      let extensionDetected = false;
      let responded = false;
      
      const handleMessage = (event)=>{
        if(event.source !== window) return;
        const d = event.data || {};
        
        // 확장프로그램 감지
        if(d.type === 'DID_WALLET_EXTENSION_DETECTED'){
          console.log('✅ [Verifier] 확장프로그램 감지됨');
          extensionDetected = true;
        }
        
        // Proof 응답 수신
        if(d.type === 'DID_WALLET_PROOF_RESPONSE'){
          console.log('📨 [Verifier] Proof 응답 받음:', d);
          responded = true;
          window.removeEventListener('message', handleMessage);
          resolve({ success: !!d.success, approved: !!d.approved, error: d.error });
        }
      };
      
      window.addEventListener('message', handleMessage);
      
      // 핑 전송
      console.log('📣 [Verifier] 확장프로그램 핑 전송');
      try { 
        window.postMessage({ type:'DID_WALLET_PING' }, '*'); 
      } catch(e) {
        console.error('❌ [Verifier] 핑 전송 실패:', e);
      }
      
      // 2초 후 확장프로그램 감지 확인 및 Proof 요청
      setTimeout(()=>{
        if(!extensionDetected){
          console.error('❌ [Verifier] 확장프로그램 미감지');
          window.removeEventListener('message', handleMessage);
          resolve({ success:false, approved:false, error:'DID Wallet 확장프로그램이 감지되지 않았습니다' });
          return;
        }
        
        // Proof 요청 전송
        console.log('📤 [Verifier] Proof 요청 전송:', { region, vcType, prep });
        try {
          window.postMessage({ 
            type:'DID_WALLET_REQUEST_PROOF', 
            origin: window.location.origin, 
            region, 
            vcType, 
            prep 
          }, '*');
        } catch(e) {
          console.error('❌ [Verifier] Proof 요청 전송 실패:', e);
          window.removeEventListener('message', handleMessage);
          resolve({ success:false, approved:false, error:'Proof 요청 전송 실패' });
          return;
        }
        
        // 30초 타임아웃
        setTimeout(()=>{
          if(!responded){
            console.error('⏱️ [Verifier] Proof 응답 타임아웃');
            window.removeEventListener('message', handleMessage);
            resolve({ success:false, approved:false, error:'Proof 응답 시간 초과 (30초)' });
          }
        }, 30000);
      }, 2000);
    });
  }

  // 주소 + Proof 통합 요청 함수
  async function requestProofWithAddress(region, vcType, prep){
    return new Promise((resolve)=>{
      let extensionDetected = false;
      let responded = false;
      
      const handleMessage = (event)=>{
        if(event.source !== window) return;
        const d = event.data || {};
        
        // 확장프로그램 감지
        if(d.type === 'DID_WALLET_EXTENSION_DETECTED'){
          console.log('✅ [Verifier] 확장프로그램 감지됨');
          extensionDetected = true;
        }
        
        // 통합 응답 수신
        if(d.type === 'DID_WALLET_PROOF_WITH_ADDRESS_RESPONSE'){
          console.log('📨 [Verifier] 주소 + Proof 응답 받음:', d);
          responded = true;
          window.removeEventListener('message', handleMessage);
          resolve({ 
            success: !!d.success, 
            approved: !!d.approved, 
            address: d.address,
            error: d.error 
          });
        }
      };
      
      window.addEventListener('message', handleMessage);
      
      // 핑 전송
      console.log('📣 [Verifier] 확장프로그램 핑 전송');
      try { 
        window.postMessage({ type:'DID_WALLET_PING' }, '*'); 
      } catch(e) {
        console.error('❌ [Verifier] 핑 전송 실패:', e);
      }
      
      // 2초 후 확장프로그램 감지 확인 및 통합 요청
      setTimeout(()=>{
        if(!extensionDetected){
          console.error('❌ [Verifier] 확장프로그램 미감지');
          window.removeEventListener('message', handleMessage);
          resolve({ success:false, approved:false, address:null, error:'DID Wallet 확장프로그램이 감지되지 않았습니다' });
          return;
        }
        
        // 컨트랙트 정보 (배포 환경 설정에서 가져오기)
        const contractInfo = window.DEPLOYMENT_CONFIG 
          ? window.DEPLOYMENT_CONFIG.getContractInfo()
          : {
              // Fallback (설정 파일 로드 실패 시)
              address: '0x0d2aa97CbBC38DBE72529169A931C5f6A10d62BE',
              functionName: 'mintSBT',
              functionSignature: 'mintSBT(uint256[2],uint256[2][2],uint256[2],uint256[5],string)',
              description: 'Zero-Knowledge Proof 검증 및 지역청년패스 SBT 발급',
              verifierAddress: '0x205868EB1c45633d3263e9C7178594c4879C5be9',
              network: {
                chainId: 31337,
                name: 'Anvil Local',
                rpcUrl: 'http://localhost:8545'
              }
            };
        
        console.log(`[Verifier] 배포 환경: ${window.DEPLOYMENT_CONFIG?.DEPLOYMENT_ENV || 'unknown'}`);
        console.log('[Verifier] 컨트랙트 정보:', contractInfo);
        
        // 통합 요청 전송 (circuitFiles 및 컨트랙트 정보 포함)
        console.log('📤 [Verifier] 주소 + Proof 통합 요청 전송:', { 
          region, 
          vcType, 
          prep,
          hasCircuitFiles: !!(prep && prep.circuitFiles),
          circuitFileNames: prep && prep.circuitFiles ? Object.keys(prep.circuitFiles) : [],
          contractInfo
        });
        try {
          window.postMessage({ 
            type:'DID_WALLET_REQUEST_PROOF_WITH_ADDRESS', 
            origin: window.location.origin, 
            region, 
            vcType, 
            prep, // circuitFiles가 prep 안에 포함됨
            contractInfo // 컨트랙트 정보 추가
          }, '*');
        } catch(e) {
          console.error('❌ [Verifier] 통합 요청 전송 실패:', e);
          window.removeEventListener('message', handleMessage);
          resolve({ success:false, approved:false, address:null, error:'통합 요청 전송 실패' });
          return;
        }
        
        // 30초 타임아웃
        setTimeout(()=>{
          if(!responded){
            console.error('⏱️ [Verifier] 통합 응답 타임아웃');
            window.removeEventListener('message', handleMessage);
            resolve({ success:false, approved:false, address:null, error:'응답 시간 초과 (30초)' });
          }
        }, 30000);
      }, 2000);
    });
  }

  async function requestWalletAddress(){
    return new Promise((resolve, reject)=>{
      let extensionDetected = false;
      let addressReceived = false;
      
      const handler = (event)=>{
        if(event.source !== window) return;
        const { type, success, address, error } = event.data || {};
        
        switch(type){
          case 'DID_WALLET_EXTENSION_DETECTED':
            console.log('✅ [Verifier] 확장프로그램 감지됨 (주소 요청)');
            extensionDetected = true; 
            break;
          case 'DID_WALLET_ADDRESS_RESPONSE':
            console.log('📨 [Verifier] 지갑 주소 응답 받음:', { success, address, error });
            addressReceived = true;
            window.removeEventListener('message', handler);
            if(success){ 
              resolve(address); 
            } else { 
              reject(new Error(error || '지갑 연결이 거절되었습니다')); 
            }
            break;
        }
      };
      
      window.addEventListener('message', handler);
      
      // 핑 전송
      console.log('📣 [Verifier] 확장프로그램 핑 전송 (주소 요청)');
      try { 
        window.postMessage({ type:'DID_WALLET_PING' }, '*'); 
      } catch(e) {
        console.error('❌ [Verifier] 핑 전송 실패:', e);
      }
      
      // 2초 후 확장프로그램 감지 확인 및 주소 요청
      setTimeout(()=>{
        if(!extensionDetected){
          console.error('❌ [Verifier] 확장프로그램 미감지 (주소 요청)');
          window.removeEventListener('message', handler);
          reject(new Error('DID Wallet 확장프로그램이 설치되지 않았습니다'));
          return;
        }
        
        // 주소 요청 전송
        console.log('📤 [Verifier] 지갑 주소 요청 전송');
        try { 
          window.postMessage({ type:'DID_WALLET_REQUEST_ADDRESS' }, '*'); 
        } catch(e) {
          console.error('❌ [Verifier] 주소 요청 전송 실패:', e);
          window.removeEventListener('message', handler);
          reject(new Error('주소 요청 전송 실패'));
          return;
        }
        
        // 30초 타임아웃
        setTimeout(()=>{
          if(!addressReceived){
            console.error('⏱️ [Verifier] 지갑 주소 응답 타임아웃');
            window.removeEventListener('message', handler);
            reject(new Error('지갑 주소 요청 시간이 초과되었습니다'));
          }
        }, 30000);
      }, 2000);
    });
  }

  // Step 0 -> 1: 준비 데이터 요청 후 지갑 연동 버튼 표시
  startBtn?.addEventListener('click', async()=>{
    reset();
    const region = regionSel.value;

    try {
      // Step 1: circuit 파일 수신 진행상황 표시 및 순차 다운로드
      show($('#step-1'));
      const step1 = $('#step-1');
      
      // HTML 구조로 초기화: 제목 + 진행상황 영역 분리
      if (step1) {
        step1.innerHTML = '1. 증명 생성용 데이터를 불러오는 중입니다...<div class="step-progress"><div class="step-progress-item">⏳ verification_key.json 대기 중</div><div class="step-progress-item">⏳ circuit.wasm 대기 중</div><div class="step-progress-item">⏳ circuit_final.zkey 대기 중</div></div>';
      }

      const updateStatus = (name, status, checkmark = '⏳')=>{
        if (!step1) return;
        const progressDiv = step1.querySelector('.step-progress');
        if (!progressDiv) return;
        
        const items = progressDiv.querySelectorAll('.step-progress-item');
        items.forEach(item => {
          if (item.textContent.includes(name)) {
            item.innerHTML = `${checkmark} ${name} ${status}`;
          }
        });
      };

      const files = [
        { name: 'verification_key.json', url: '/circuit/verification_key.json', parse: r=>r.json(), store: true },
        { name: 'circuit.wasm', url: '/circuit/circuit.wasm', parse: r=>r.arrayBuffer(), store: true },
        { name: 'circuit_final.zkey', url: '/circuit/circuit_final.zkey', parse: r=>r.arrayBuffer(), store: true }
      ];

      const circuitFiles = {};

      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        updateStatus(f.name, '수신 중...', '⏳');
        await new Promise(r => setTimeout(r, 200)); // 시각적 효과를 위한 짧은 딜레이
        
        const res = await fetch(f.url);
        if (!res.ok) throw new Error(`${f.name} 요청 실패 (${res.status})`);
        const data = await f.parse(res); // 실제 데이터 저장
        
        // 파일 내용 저장
        if (f.store) {
          if (f.name.endsWith('.json')) {
            circuitFiles[f.name] = { type: 'json', data: data };
          } else {
            // ArrayBuffer를 Base64로 인코딩 (큰 파일은 URL만 저장)
            const sizeMB = data.byteLength / (1024 * 1024);
            if (sizeMB > 10) {
              // 10MB 이상이면 URL만 저장 (지갑에서 직접 다운로드)
              circuitFiles[f.name] = { type: 'url', url: window.location.origin + f.url, size: data.byteLength };
            } else {
              // 작은 파일은 base64로 인코딩해서 전달 (청크 단위로 처리하여 스택 오버플로우 방지)
              const uint8Array = new Uint8Array(data);
              let binary = '';
              const chunkSize = 8192; // 8KB 청크
              for (let i = 0; i < uint8Array.length; i += chunkSize) {
                const chunk = uint8Array.subarray(i, i + chunkSize);
                binary += String.fromCharCode.apply(null, chunk);
              }
              const base64 = btoa(binary);
              circuitFiles[f.name] = { type: 'base64', data: base64, size: data.byteLength };
            }
          }
        }
      
        updateStatus(f.name, '수신 완료', '✅');
        
        if (i < files.length - 1) {
          await new Promise(r => setTimeout(r, 500));
        }
      }

      // prep 메타에 circuit 파일 정보 포함
      const prep = { 
        ok: true, 
        data: null, 
        meta: { 
          region, 
          files: files.length, 
          receivedAt: Date.now() 
        },
        circuitFiles: circuitFiles // circuit 파일 데이터 포함
      };

      // 완료 메시지 추가
      if (step1) {
        const progressDiv = step1.querySelector('.step-progress');
        if (progressDiv) {
          const completeMsg = document.createElement('div');
          completeMsg.className = 'step-progress-item';
          completeMsg.style.marginTop = '8px';
          completeMsg.style.color = '#2ecc71';
          completeMsg.textContent = '✓ 모든 증명 데이터 수신 완료.';
          progressDiv.appendChild(completeMsg);
        }
      }

      // 다음 단계 표시
      show($('#step-2'));

      // 전역 저장 (circuitFiles 포함)
      window.prepData = prep;
      window.selectedRegion = region;
      window.circuitFiles = circuitFiles; // 별도로도 저장 (디버깅용)
    } catch(e){
      show(errBox);
      setText(errBox, `오류: ${e?.message || e}`);
    }
  });

  // Step 2: 지갑 앱에 연동하기 버튼 클릭 시 (통합 버전)
  connectBtn?.addEventListener('click', async()=>{
    console.log('🔘 [Verifier] 지갑 앱에 연동하기 버튼 클릭됨');
    hide(errBox);
    try {
      const region = window.selectedRegion || regionSel.value;
      const prep = window.prepData;
      
      console.log('📋 [Verifier] 저장된 데이터:', { region, vcType: selectedVcType, prep });

      // 통합 요청: 주소 + Proof 제출을 한 번에 처리
      console.log('🚀 [Verifier] 주소 + Proof 통합 요청 시작...');
      const result = await requestProofWithAddress(region, selectedVcType, prep);
      console.log('✅ [Verifier] 통합 요청 결과:', result);

      if (!result || !result.success || !result.approved) {
        // 승인 거절 또는 실패 시 오류 표시
        console.error('❌ [Verifier] 통합 요청 실패:', result);
        setText(errBox, `오류: ${(result && result.error) || '지갑 연결 및 Proof 제출 실패'}`);
        show(errBox);
        return;
      }

      const address = result.address;
      console.log('✅ [Verifier] 받은 주소:', address);
      if (walletInput) walletInput.value = address;

      // VP 생성 및 제출
      console.log('📝 [Verifier] VP 생성 및 제출 중...');
      const vc = {
        '@context': ['https://www.w3.org/ns/credentials/v2'],
        type: ['VerifiableCredential','IdentityCredential'],
        issuer: { id: 'https://gov.example.kr/moi' },
        issuanceDate: new Date().toISOString(),
        credentialSubject: {
          id: `did:ethr:${address}`,
          walletAddress: address,
          name: '홍길동',
          residentialAddress: `${region} 어딘가`
        }
      };
      const vp = { verifiableCredential: [vc] };

      await new Promise(r=>setTimeout(r, 1200));
      const resp = await json('/submit-vp', { method:'POST', body: JSON.stringify({ region, vp }) });
      console.log('✅ [Verifier] VP 제출 완료:', resp);

      // SBT 정보 및 tokenURI를 background에 전달 (트랜잭션 완료 후 저장될 예정)
      // SBT는 트랜잭션이 완료된 후 background에서 자동 저장됨
      console.log('💾 [Verifier] SBT 정보 및 tokenURI를 background에 전달 (트랜잭션 완료 후 저장 예정)...');
      try {
        window.postMessage({ 
          type:'DID_WALLET_PROOF_WITH_ADDRESS_SBT', 
          sbt: resp.sbt,
          tokenURI: resp.tokenURI // tokenURI도 함께 전달
        }, '*');
        console.log('✅ [Verifier] SBT 정보 및 tokenURI 전달 완료 (저장은 트랜잭션 완료 후):', resp.tokenURI);
      } catch(e) {
        console.warn('⚠️ [Verifier] SBT 정보 전달 실패:', e);
      }
      
      // 주의: 실제 SBT 저장은 background에서 트랜잭션이 완료된 후에 수행됨

      // Proof 생성 및 트랜잭션 제출 진행 중 상태 표시
      console.log('⏳ [Verifier] Proof 생성 및 트랜잭션 제출 진행 중...');
      const processingDiv = document.createElement('div');
      processingDiv.id = 'step-processing';
      processingDiv.innerHTML = `
        <div style="text-align: center; padding: 20px;">
          <div style="margin-bottom: 16px;">⏳ Proof 생성 및 트랜잭션 제출 중입니다...</div>
          <div style="font-size: 12px; color: #6b7a86;">지갑에서 진행 상황을 확인할 수 있습니다</div>
          <div style="font-size: 12px; color: #6b7a86; margin-top: 8px;">트랜잭션이 완료되면 자동으로 결과가 표시됩니다</div>
        </div>
      `;
      const step2 = $('#step-2');
      if (step2) {
        step2.innerHTML = '';
        step2.appendChild(processingDiv);
      }

      // 트랜잭션 완료 대기 (지갑에서 완료 메시지 수신)
      const handleTransactionComplete = (event) => {
        if (event.data?.type === 'DID_WALLET_PROOF_COMPLETED') {
          console.log('✅ [Verifier] 트랜잭션 완료 알림 받음:', event.data);
          window.removeEventListener('message', handleTransactionComplete);
          
          if (event.data.success) {
            // 성공 화면 표시
            console.log('🎉 [Verifier] 모든 과정 완료!');
            hide($('#step-2'));
            show($('#step-3'));
            setText(sbtOut, JSON.stringify(resp.sbt, null, 2));
          } else {
            // 실패 시 오류 표시
            setText(errBox, `트랜잭션 실패: ${event.data.error || '알 수 없는 오류'}`);
            show(errBox);
            hide($('#step-2'));
          }
        }
      };
      
      window.addEventListener('message', handleTransactionComplete);
      
      // 타임아웃 (60초 후 타임아웃 처리)
      setTimeout(() => {
        window.removeEventListener('message', handleTransactionComplete);
        const step2Element = $('#step-2');
        if (step2Element && step2Element.querySelector('#step-processing')) {
          setText(errBox, '트랜잭션 처리 시간이 초과되었습니다. 지갑에서 진행 상황을 확인해주세요.');
          show(errBox);
        }
      }, 60000);
    } catch(e){
      console.error('❌ [Verifier] 전체 오류:', e);
      show(errBox);
      setText(errBox, `오류: ${e?.message || e}`);
    }
  });
})();


