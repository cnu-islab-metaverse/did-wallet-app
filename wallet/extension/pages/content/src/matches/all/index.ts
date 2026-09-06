console.log('[CEB] All content script loaded');

// Simple function without external imports
const sampleFunction = () => {
  console.log('content script - sampleFunction() called from another module');
};

sampleFunction();

// 웹페이지와 확장프로그램 간 통신을 위한 이벤트 리스너
window.addEventListener('message', async (event) => {
  // 보안을 위해 origin 체크 (필요시 특정 도메인으로 제한)
  if (event.source !== window) return;
  
  // Issuer 웹에서 핑을 보내면 즉시 감지 신호를 재전송
  if (event.data.type === 'DID_WALLET_PING') {
    console.log('📣 [Content Script] 감지 핑 수신 → 감지 신호 재전송');
    window.postMessage({
      type: 'DID_WALLET_EXTENSION_DETECTED',
    }, '*');
    return;
  }

  if (event.data.type === 'DID_WALLET_REQUEST_ADDRESS') {
    console.log('🔗 [Content Script] 지갑 주소 요청 받음:', event.data);
    
    try {
      // 백그라운드 스크립트를 통해 popup과 통신
      console.log('📤 [Content Script] 백그라운드로 요청 전송...');
      const response = await chrome.runtime.sendMessage({
        type: 'REQUEST_WALLET_ADDRESS',
        origin: window.location.origin
      });
      
      console.log('📨 [Content Script] 백그라운드 응답 받음:', response);
      
      // 웹페이지로 응답 전송
      window.postMessage({
        type: 'DID_WALLET_ADDRESS_RESPONSE',
        success: response.success,
        address: response.address,
        error: response.error
      }, '*');
    } catch (error: unknown) {
      const msg = (error && (error as any).message) || String(error);
      console.log('❌ [Content Script] 오류 발생:', msg);
      window.postMessage({
        type: 'DID_WALLET_ADDRESS_RESPONSE',
        success: false,
        error: msg || '지갑 연결 실패'
      }, '*');
    }
  }

  // 메타버스 플랫폼이 만든 인증토큰 발급 요청을 데스크톱 지갑으로 전달한다.
  // 페이지는 요청 URL 만 넘긴다 — 지갑이 그 URL 에서 직접 가져와 컨트랙트로 검증한다.
  if (event.data.type === 'DID_WALLET_REQUEST_PASS') {
    console.log('🎫 [Content Script] 인증토큰 발급 요청 받음:', event.data.url);

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'REQUEST_PASS_ISSUANCE',
        url: event.data.url,
        request: event.data.request,
        origin: window.location.origin,
      });

      window.postMessage({
        type: 'DID_WALLET_PASS_RESPONSE',
        ok: !!response?.ok,
        accepted: !!response?.accepted,
        address: response?.address,
        error: response?.error,
      }, '*');
    } catch (error: unknown) {
      const msg = (error && (error as any).message) || String(error);
      console.log('❌ [Content Script] 인증토큰 발급 요청 오류:', msg);
      window.postMessage({
        type: 'DID_WALLET_PASS_RESPONSE',
        ok: false,
        accepted: false,
        error: msg || '인증토큰 발급 요청 실패',
      }, '*');
    }
  }

  if (event.data.type === 'DID_WALLET_REQUEST_PROOF') {
    console.log('🧩 [Content Script] Proof 제출 요청 받음:', event.data);
    console.log('🧩 [Content Script] 요청 데이터:', {
      region: event.data.region,
      vcType: event.data.vcType,
      prep: event.data.prep,
      origin: window.location.origin
    });
    
    try {
      console.log('📤 [Content Script] 백그라운드로 REQUEST_PROOF_SUBMISSION 전송 중...');
      const response = await chrome.runtime.sendMessage({
        type: 'REQUEST_PROOF_SUBMISSION',
        region: event.data.region,
        vcType: event.data.vcType,
        prep: event.data.prep,
        origin: window.location.origin
      });

      console.log('📨 [Content Script] Proof 제출 응답 받음:', response);
      console.log('📨 [Content Script] 응답 상세:', {
        success: response.success,
        approved: response.approved,
        error: response.error
      });
      
      window.postMessage({
        type: 'DID_WALLET_PROOF_RESPONSE',
        success: response.success,
        approved: response.approved,
        error: response.error
      }, '*');
      console.log('✅ [Content Script] 웹페이지로 응답 전송 완료');
    } catch (error: unknown) {
      const msg = (error && (error as any).message) || String(error);
      console.log('❌ [Content Script] Proof 제출 요청 오류:', msg);
      console.error('❌ [Content Script] 오류 상세:', error);
      window.postMessage({
        type: 'DID_WALLET_PROOF_RESPONSE',
        success: false,
        approved: false,
        error: msg || 'Proof 제출 요청 실패'
      }, '*');
    }
  }

  if (event.data.type === 'DID_WALLET_REQUEST_PROOF_WITH_ADDRESS') {
    console.log('🔗🧩 [Content Script] 주소 + Proof 제출 통합 요청 받음:', event.data);
    
    try {
      console.log('📤 [Content Script] 백그라운드로 REQUEST_PROOF_WITH_ADDRESS 전송 중...');
      const response = await chrome.runtime.sendMessage({
        type: 'REQUEST_PROOF_WITH_ADDRESS',
        region: event.data.region,
        vcType: event.data.vcType,
        prep: event.data.prep,
        contractInfo: event.data.contractInfo, // 컨트랙트 정보 전달
        origin: window.location.origin
      });

      console.log('📨 [Content Script] 주소 + Proof 응답 받음:', response);
      
      window.postMessage({
        type: 'DID_WALLET_PROOF_WITH_ADDRESS_RESPONSE',
        success: response.success,
        approved: response.approved,
        address: response.address,
        error: response.error
      }, '*');
      console.log('✅ [Content Script] 웹페이지로 응답 전송 완료');
    } catch (error: unknown) {
      const msg = (error && (error as any).message) || String(error);
      console.log('❌ [Content Script] 주소 + Proof 요청 오류:', msg);
      window.postMessage({
        type: 'DID_WALLET_PROOF_WITH_ADDRESS_RESPONSE',
        success: false,
        approved: false,
        address: null,
        error: msg || '주소 + Proof 요청 실패'
      }, '*');
    }
  }

  if (event.data.type === 'DID_WALLET_PROOF_WITH_ADDRESS_SBT') {
    // SBT 정보 및 tokenURI를 background에 전달 (트랜잭션 완료 후 저장용)
    console.log('🏷️ [Content Script] SBT 정보 및 tokenURI 받음 (트랜잭션 완료 후 저장 예정):', event.data);
    try {
      await chrome.runtime.sendMessage({
        type: 'UPDATE_PROOF_REQUEST_SBT',
        sbt: event.data.sbt,
        tokenURI: event.data.tokenURI // tokenURI도 함께 전달
      });
      console.log('✅ [Content Script] SBT 정보 및 tokenURI 전달 완료:', event.data.tokenURI);
    } catch (error: unknown) {
      console.log('❌ [Content Script] SBT 정보 전달 실패:', error);
    }
  }

  // Background에서 트랜잭션 완료 알림 받기
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'PROOF_TRANSACTION_COMPLETED') {
      console.log('✅ [Content Script] 트랜잭션 완료 알림 받음:', message);
      // verifier-web에 완료 메시지 전달
      window.postMessage({
        type: 'DID_WALLET_PROOF_COMPLETED',
        success: message.success,
        txHash: message.txHash,
        blockNumber: message.blockNumber
      }, '*');
      console.log('✅ [Content Script] verifier-web에 완료 메시지 전달 완료');
    }
  });

  if (event.data.type === 'DID_WALLET_PREPARE_PROOF_INTENT') {
    console.log('🧭 [Content Script] Proof 팝업 사전 준비 요청:', event.data);
    try {
      await chrome.runtime.sendMessage({
        type: 'PREPARE_PROOF_POPUP',
        region: event.data.region,
        vcType: event.data.vcType,
        origin: window.location.origin
      });
    } catch (error: unknown) {
      const msg = (error && (error as any).message) || String(error);
      console.log('❌ [Content Script] Proof 팝업 준비 오류:', msg);
    }
  }

  if (event.data.type === 'DID_WALLET_REQUEST_VC_ISSUANCE') {
    console.log('📋 [Content Script] VC 발급 승인 요청 받음:', event.data);
    
    try {
      // 백그라운드 스크립트로 VC 발급 승인 요청
      console.log('📤 [Content Script] 백그라운드로 VC 발급 승인 요청 전송...');
      const response = await chrome.runtime.sendMessage({
        type: 'REQUEST_VC_ISSUANCE',
        vc: event.data.vc,
        student: event.data.student,
        origin: window.location.origin
      });
      
      console.log('📨 [Content Script] VC 발급 승인 응답 받음:', response);
      
      // 웹페이지로 응답 전송
      window.postMessage({
        type: 'DID_WALLET_VC_ISSUANCE_RESPONSE',
        approved: response.approved,
        error: response.error
      }, '*');
    } catch (error: unknown) {
      const msg = (error && (error as any).message) || String(error);
      console.log('❌ [Content Script] VC 발급 승인 오류 발생:', msg);
      window.postMessage({
        type: 'DID_WALLET_VC_ISSUANCE_RESPONSE',
        approved: false,
        error: msg || 'VC 발급 승인 실패'
      }, '*');
    }
  }

  if (event.data.type === 'DID_WALLET_SAVE_VC') {
    console.log('💾 [Content Script] VC 저장 요청 받음:', event.data);
    
    try {
      // 백그라운드 스크립트로 VC 저장 요청
      console.log('📤 [Content Script] 백그라운드로 VC 저장 요청 전송...');
      const response = await chrome.runtime.sendMessage({
        type: 'SAVE_VC',
        vc: event.data.vc,
        origin: window.location.origin
      });
      
      console.log('📨 [Content Script] VC 저장 응답 받음:', response);
      
      // 웹페이지로 응답 전송
      window.postMessage({
        type: 'DID_WALLET_VC_SAVE_RESPONSE',
        success: response.success,
        error: response.error
      }, '*');
    } catch (error: unknown) {
      const msg = (error && (error as any).message) || String(error);
      console.log('❌ [Content Script] VC 저장 오류 발생:', msg);
      window.postMessage({
        type: 'DID_WALLET_VC_SAVE_RESPONSE',
        success: false,
        error: msg || 'VC 저장 실패'
      }, '*');
    }
  }

  if (event.data.type === 'DID_WALLET_SAVE_SBT') {
    console.log('🏷️ [Content Script] SBT 저장 요청 받음:', event.data);
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'SAVE_SBT',
        sbt: event.data.sbt,
        origin: window.location.origin
      });
      console.log('📨 [Content Script] SBT 저장 응답 받음:', response);
      window.postMessage({
        type: 'DID_WALLET_SBT_SAVE_RESPONSE',
        success: response.success,
        error: response.error
      }, '*');
    } catch (error: unknown) {
      const msg = (error && (error as any).message) || String(error);
      console.log('❌ [Content Script] SBT 저장 오류 발생:', msg);
      window.postMessage({
        type: 'DID_WALLET_SBT_SAVE_RESPONSE',
        success: false,
        error: msg || 'SBT 저장 실패'
      }, '*');
    }
  }
});

// 확장프로그램이 설치되어 있음을 웹페이지에 알림
console.log('📢 [Content Script] 확장프로그램 감지 신호 전송');
window.postMessage({
  type: 'DID_WALLET_EXTENSION_DETECTED'
}, '*');
