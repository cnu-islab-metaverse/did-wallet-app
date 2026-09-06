import 'webextension-polyfill';
import { exampleThemeStorage } from '@extension/storage';
import * as nativeBridge from './nativeBridge';

exampleThemeStorage.get().then(theme => {
});

// Wallet auto-lock
let lockTimer: NodeJS.Timeout | null = null;
const IDLE_LOCK_MS = 5 * 60 * 1000;

function resetLockTimer() {
  if (lockTimer) {
    clearTimeout(lockTimer);
  }
  
  lockTimer = setTimeout(() => {
    chrome.storage.local.set({ walletLocked: true }, () => {
      chrome.tabs.query({}, (tabs) => {
        tabs.forEach(tab => {
          if (tab.id) {
            chrome.tabs.sendMessage(tab.id, { type: 'WALLET_LOCKED' }).catch(() => {});
          }
        });
      });
    });
  }, IDLE_LOCK_MS);
}
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'USER_ACTIVITY') {
    resetLockTimer();
    return false;
  } else if (message.type === 'WALLET_UNLOCKED') {
    resetLockTimer();
    return false;
  } else if (message.type === 'WALLET_LOCKED') {
    if (lockTimer) {
      clearTimeout(lockTimer);
      lockTimer = null;
    }
    return false;
  } else if (message.type === 'REQUEST_WALLET_ADDRESS') {
    handleAddressRequest(message, sender, sendResponse);
    return true;
  } else if (message.type === 'REQUEST_VC_ISSUANCE') {
    handleVCIssuanceRequest(message, sender, sendResponse);
    return true;
  } else if (message.type === 'SAVE_VC' || message.type === 'DID_WALLET_SAVE_VC') {
    handleSaveVC(message, sender, sendResponse);
    return true;
  } else if (message.type === 'SAVE_VC_DIRECT') {
    handleSaveVCDirect(message, sender, sendResponse);
    return true;
  } else if (message.type === 'DELETE_VC') {
    handleDeleteVC(message, sender, sendResponse);
    return true;
  } else if (message.type === 'REQUEST_PROOF_SUBMISSION') {
    handleProofSubmission(message, sender, sendResponse);
    return true;
  } else if (message.type === 'REQUEST_PROOF_WITH_ADDRESS') {
    handleProofWithAddress(message, sender, sendResponse);
    return true;
  } else if (message.type === 'PREPARE_PROOF_POPUP') {
    (async () => {
      try { await chrome.action.openPopup(); } catch {}
    })();
    sendResponse({ ok: true });
    return true;
  } else if (message.type === 'UPDATE_PROOF_REQUEST_SBT') {
    (async () => {
      try {
        const { pendingProofRequest } = await chrome.storage.local.get(['pendingProofRequest']);
        if (pendingProofRequest) {
          await chrome.storage.local.set({
            pendingProofRequest: { 
              ...pendingProofRequest, 
              sbt: message.sbt,
              tokenURI: message.tokenURI || message.sbt?.tokenURI // tokenURI도 함께 저장
            }
          });
          console.log('[Background] Proof 요청에 SBT 정보 및 tokenURI 추가됨:', message.tokenURI || message.sbt?.tokenURI);
        }
        sendResponse({ success: true });
      } catch (error: any) {
        console.error('[Background] SBT 정보 업데이트 실패:', error);
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true;
  } else if (message.type === 'SAVE_SBT') {
    handleSaveSBT(message, sender, sendResponse);
    return true;
  } else if (message.type === 'DESKTOP_RPC') {
    handleDesktopRpc(message, sendResponse);
    return true;
  }
  return false;
});

// 씬 팝업이 데스크톱 지갑을 조회할 때 쓰는 릴레이(읽기 위주 메서드만 허용).
const DESKTOP_RPC_ALLOW = new Set(['ping', 'getAddresses', 'getVCs']);
async function handleDesktopRpc(message: any, sendResponse: (response: any) => void) {
  try {
    if (!DESKTOP_RPC_ALLOW.has(message.method)) throw new Error('method-not-allowed');
    const result = await nativeBridge.request(message.method, message.params, message.method === 'ping' ? 3000 : 30000);
    sendResponse({ ok: true, result });
  } catch (error: any) {
    sendResponse({ ok: false, error: nativeBridge.friendlyError(error) });
  }
}

// 주소 요청 처리 — 데스크톱 지갑 프로그램에 위임(확장은 키 미보유). 승인은 데스크톱 창에서.
async function handleAddressRequest(message: any, sender: chrome.runtime.MessageSender, sendResponse: (response: any) => void) {
  try {
    const res = await nativeBridge.request('getAddresses', { origin: message.origin });
    const address = res?.address || res?.active?.address || res?.accounts?.[0]?.address;
    if (!address) throw new Error('데스크톱 지갑에 주소가 없습니다');
    sendResponse({ success: true, address });
  } catch (error: any) {
    sendResponse({ success: false, error: nativeBridge.friendlyError(error) });
  }
}

// VC 발급 승인 처리 — 데스크톱에 위임. 승인 팝업은 데스크톱 창에서 표시되고, VC 저장도 데스크톱.
async function handleVCIssuanceRequest(message: any, sender: chrome.runtime.MessageSender, sendResponse: (response: any) => void) {
  try {
    const res = await nativeBridge.request('requestVCIssuance', { vc: message.vc, origin: message.origin }, 120000);
    sendResponse({ approved: !!res?.approved });
  } catch (error: any) {
    sendResponse({ approved: false, error: nativeBridge.friendlyError(error) });
  }
}

// VC 중복 체크 (발급자, 소유자, 타입 기준)
function checkDuplicateVC(newVC: any, savedVCs: any[]): any | null {
  for (const savedVC of savedVCs) {
    const newIssuer = newVC.issuer?.id || newVC.issuer;
    const savedIssuer = savedVC.issuer?.id || savedVC.issuer;
    
    const newSubject = newVC.credentialSubject?.id || 
                      newVC.credentialSubject?.name || 
                      newVC.credentialSubject?.studentName;
    const savedSubject = savedVC.credentialSubject?.id || 
                        savedVC.credentialSubject?.name || 
                        savedVC.credentialSubject?.studentName;
    
    const newVCType = newVC.type?.find((t: string) => t !== 'VerifiableCredential');
    const savedVCType = savedVC.type?.find((t: string) => t !== 'VerifiableCredential');
    
    if (newIssuer && savedIssuer && newIssuer === savedIssuer &&
        newSubject && savedSubject && newSubject === savedSubject &&
        newVCType && savedVCType && newVCType === savedVCType) {
      
      console.log('🔄 중복 VC 발견 - 덮어쓰기 대상:', {
        issuer: newIssuer,
        subject: newSubject,
        type: newVCType,
        existingId: savedVC.id
      });
      return savedVC;
    }
  }
  return null;
}

function extractPublicKeyFromVerificationMethod(verificationMethod: string): string | null {
  if (!verificationMethod) return null;
  const match = verificationMethod.match(/did:key:([^#]+)/);
  return match ? match[1] : null;
}

function extractAddressFromDID(did: string): string | null {
  try {
    const ethrMatch = did.match(/did:ethr:([^#]+)/);
    if (ethrMatch) {
      return ethrMatch[1];
    }
    
    const keyMatch = did.match(/did:key:([^#]+)/);
    if (keyMatch) {
      return null;
    }
    
    const otherMatch = did.match(/did:([^:]+):([^#]+)/);
    if (otherMatch) {
      const identifier = otherMatch[2];
      if (identifier.startsWith('0x') && identifier.length === 42) {
        return identifier;
      }
    }
    
    return null;
  } catch (error) {
    console.error('DID에서 주소 추출 실패:', error);
    return null;
  }
}

// VC 저장 처리 — 데스크톱 지갑에 저장(단일 저장소). 중복 처리·확인도 데스크톱에서.
async function handleSaveVC(message: any, sender: chrome.runtime.MessageSender, sendResponse: (response: any) => void) {
  try {
    const res = await nativeBridge.request('saveVC', { vc: message.vc, origin: message.origin });
    sendResponse({ success: !!res?.saved, vcId: message.vc?.id || message.vc?.proof?.merkleRoot || '' });
  } catch (error: any) {
    sendResponse({ success: false, error: nativeBridge.friendlyError(error) });
  }
}

// VC 저장 (실제 storage 작업)
async function saveVCToStorage(vc: any, origin: string, duplicateVC: any, verificationResult: any, sendResponse: (response: any) => void) {
  try {
    const result = await chrome.storage.local.get(['savedVCs']);
    const savedVCs = result.savedVCs || [];
    
    if (duplicateVC) {
      const index = savedVCs.findIndex((item: any) => item.proof?.merkleRoot === duplicateVC.proof?.merkleRoot || item.id === duplicateVC.id);
      if (index !== -1) savedVCs[index] = vc;
    } else {
      savedVCs.push(vc);
    }
    
    await chrome.storage.local.set({ savedVCs });
    
    try {
      chrome.runtime.sendMessage({
        type: 'VC_SAVED',
        vcId: vc.id || vc.proof?.merkleRoot || '',
        isDuplicate: !!duplicateVC
      });
    } catch (error) {
    }
    
    sendResponse({
      success: true,
      vcId: vc.id || vc.proof?.merkleRoot || ''
    });
    
  } catch (error: any) {
    sendResponse({
      success: false,
      error: error.message || 'VC 저장 실패'
    });
  }
}


// VC 직접 저장 (팝업 열지 않음)
async function handleSaveVCDirect(message: any, sender: chrome.runtime.MessageSender, sendResponse: (response: any) => void) {
  try {
    const verificationResult = { isValid: true, errors: [] as string[] } as any;
    const result = await chrome.storage.local.get(['savedVCs']);
    const savedVCs = result.savedVCs || [];
    const duplicateVC = checkDuplicateVC(message.vc, savedVCs);
    
    if (duplicateVC) {
      console.log('🔄 [Background] 중복된 VC 덮어쓰기:', duplicateVC.id);
      const index = savedVCs.findIndex((vc: any) => vc.id === duplicateVC.id);
      if (index !== -1) savedVCs[index] = message.vc;
    } else {
      savedVCs.push(message.vc);
    }
    
    await chrome.storage.local.set({ savedVCs });
    
    if (duplicateVC) {
      console.log('✅ [Background] VC 덮어쓰기 완료:', {
        vcId: duplicateVC.id,
        issuer: message.vc.issuer?.id || message.vc.issuer,
        subject: message.vc.credentialSubject?.name || message.vc.credentialSubject?.studentName,
        type: message.vc.type?.find((t: string) => t !== 'VerifiableCredential')
      });
    } else {
      console.log('✅ [Background] 새 VC 저장 완료:', {
        vcId: message.vc.id,
        issuer: message.vc.issuer?.id || message.vc.issuer,
        subject: message.vc.credentialSubject?.name || message.vc.credentialSubject?.studentName,
        type: message.vc.type?.find((t: string) => t !== 'VerifiableCredential')
      });
    }
    
    try {
      chrome.runtime.sendMessage({
        type: 'VC_SAVED',
        vcId: message.vc.id || message.vc.proof?.merkleRoot || '',
        isDuplicate: !!duplicateVC
      });
    } catch (error) {
      console.log('⚠️ 팝업에 VC 저장 알림 전송 실패 (팝업이 열려있지 않을 수 있음):', error);
    }
    
    sendResponse({
      success: true,
      vcId: message.vc.id || message.vc.proof?.merkleRoot || ''
    });
    
  } catch (error: any) {
    console.log('❌ [Background] VC 직접 저장 오류:', error);
    sendResponse({
      success: false,
      error: error.message || 'VC 저장 실패'
    });
  }
}

// VC 삭제 처리
async function handleDeleteVC(message: any, sender: chrome.runtime.MessageSender, sendResponse: (response: any) => void) {
  try {
    console.log('🗑️ [Background] VC 삭제 처리 시작...');
    
    const { vcId } = message;
    if (!vcId) {
      sendResponse({
        success: false,
        error: 'VC ID가 필요합니다'
      });
      return;
    }
    
    const result = await chrome.storage.local.get(['savedVCs']);
    const savedVCs = result.savedVCs || [];
    
    const vcIndex = savedVCs.findIndex((vc: any) => vc.id === vcId);
    if (vcIndex === -1) {
      sendResponse({
        success: false,
        error: '삭제할 VC를 찾을 수 없습니다'
      });
      return;
    }
    
    const deletedVC = savedVCs[vcIndex];
    savedVCs.splice(vcIndex, 1);
    
    await chrome.storage.local.set({ savedVCs });
    
    console.log('✅ [Background] VC 삭제 완료:', {
      vcId: vcId,
      issuer: deletedVC.issuer?.id || deletedVC.issuer,
      subject: deletedVC.credentialSubject?.name || deletedVC.credentialSubject?.studentName,
      type: deletedVC.type?.find((t: string) => t !== 'VerifiableCredential')
    });
    
    sendResponse({
      success: true,
      vcId: vcId
    });
    
  } catch (error: any) {
    console.log('❌ [Background] VC 삭제 오류:', error);
    sendResponse({
      success: false,
      error: error.message || 'VC 삭제 실패'
    });
  }
}

// Proof 트랜잭션 전송 (팝업으로 메시지 전송하여 실제 트랜잭션 전송 및 확정 대기)
async function sendProofTransaction(
  address: string, 
  proofCalldata: string, 
  contractInfo: any, 
  tokenURI: string
): Promise<{ 
  success: boolean; 
  txHash?: string; 
  blockNumber?: string;
  sbtData?: any;
  error?: string 
}> {
  return new Promise((resolve) => {
    const handleTxResponse = async (message: any) => {
      if (message.type === 'PROOF_TX_RESPONSE') {
        chrome.runtime.onMessage.removeListener(handleTxResponse);
        resolve({
          success: message.success || false,
          txHash: message.txHash,
          blockNumber: message.blockNumber,
          sbtData: message.sbtData,
          error: message.error
        });
      }
    };

    chrome.runtime.onMessage.addListener(handleTxResponse);

    chrome.runtime.sendMessage({
      type: 'SEND_PROOF_TX',
      address,
      proofCalldata,
      contractInfo,
      tokenURI
    }).catch((error) => {
      chrome.runtime.onMessage.removeListener(handleTxResponse);
      resolve({
        success: false,
        error: error.message || '팝업과 통신 실패'
      });
    });

    setTimeout(() => {
      chrome.runtime.onMessage.removeListener(handleTxResponse);
      resolve({
        success: false,
        error: '트랜잭션 전송 시간 초과'
      });
    }, 60000);
  });
}

// 주소 + Proof 제출 통합 처리
async function handleProofWithAddress(message: any, sender: chrome.runtime.MessageSender, sendResponse: (response: any) => void) {
  try {
    const existing = await chrome.storage.local.get(['pendingProofRequest']);
    if (existing.pendingProofRequest && existing.pendingProofRequest.status !== 'completed') {
      sendResponse({ 
        success: false, 
        approved: false, 
        error: '이미 진행 중인 Proof 제출이 있습니다. 완료될 때까지 기다려주세요.' 
      });
      return;
    }

    const pending = {
      origin: message.origin,
      region: message.region,
      vcType: message.vcType,
      prep: message.prep,
      circuitFiles: message.prep?.circuitFiles || null,
      contractInfo: message.contractInfo || null,
      needsAddress: true,
      status: 'awaiting-address',
      createdAt: Date.now()
    };
    console.log('[Background] Proof 요청 저장 (circuitFiles 포함):', {
      hasCircuitFiles: !!pending.circuitFiles,
      circuitFileNames: pending.circuitFiles ? Object.keys(pending.circuitFiles) : []
    });
    await chrome.storage.local.set({ pendingProofRequest: pending });

    try {
      await chrome.action.openPopup();
    } catch (error) {
      await chrome.storage.local.remove(['pendingProofRequest']);
      sendResponse({ success: false, approved: false, address: null, error: '확장프로그램 팝업을 열 수 없습니다' });
      return;
    }

    const handlePopupMessage = async (popupMessage: any) => {
      if (popupMessage.type === 'PROOF_WITH_ADDRESS_RESPONSE') {
        chrome.runtime.onMessage.removeListener(handlePopupMessage);

        if (!popupMessage.approved) {
          await chrome.storage.local.remove(['pendingProofRequest']);
          sendResponse({ success: true, approved: false, address: null });
          return;
        }

        const address = popupMessage.address;
        
        console.log('[Background] 주소 + Proof 승인됨, 증명 생성 시작...', address);
        await chrome.storage.local.set({
          pendingProofRequest: { ...pending, status: 'generating-proof', startedAt: Date.now(), address }
        });

        try { 
          await chrome.runtime.sendMessage({ type: 'PROOF_PROGRESS', status: 'generating-proof' }); 
        } catch(e) {
          console.error('[Background] PROOF_PROGRESS 메시지 전송 실패:', e);
        }

        setTimeout(async () => {
          console.log('[Background] 증명 생성 완료, 트랜잭션 제출 시작...');
          await chrome.storage.local.set({
            pendingProofRequest: { ...pending, status: 'submitting-tx', proofDoneAt: Date.now(), address }
          });
          try { 
            await chrome.runtime.sendMessage({ type: 'PROOF_PROGRESS', status: 'submitting-tx' }); 
          } catch(e) {
            console.error('[Background] PROOF_PROGRESS 메시지 전송 실패:', e);
          }
          
          try {
            // TODO: 실제 proof 연산 후 동적으로 생성된 calldata 사용
            const proofCalldata = "[0x280ae4ad4c8c58ad7692b66a12d2b30a5c99186e4822124e11ca49bf8285d611, 0x185aac88d540a116143caef7cf31e72f02ad81100dcd0d39c2162b57fa077b18],[[0x10b36ed6db66bdd1daf23ec15b5f03421e5d8aaa7576fd2460144c7670e1b932, 0x1193d4e899d73b062a2b8591e16c0944c1e99c52a62635ed1c0185d6004fa7aa],[0x2cdc1c1f373f4f7ce57379f494176086b701d0985d7cb5994d4c8a6d5e6dbddc, 0x072fd6c6bca259a1f64a6f6d300706bac64ec83f34a95d2282cf98e33adf0d4b]],[0x012e66fcbaf82ddf81a834a5475458c773ff6dab1d3934f15c4f7ed6185a309e, 0x089a4ee10ce655f485ee6da990599ad22c845613ef6e7b051c1d2a8ccc011b99],[0x0000000000000000000000000000000000000000000000000000000000000002,0x0000000000000000000000000000000000000000000000000000000000000004,0x0000000000000000000000000000000000000000000000000000000000000001,0x1d5ac1f31407018b7d413a4f52c8f74463b30e6ac2238220ad8b254de4eaa3a2,0x1e1de8a908826c3f9ac2e0ceee929ecd0caf3b99b3ef24523aaab796a6f733c4]";
            
            const contractInfo = pending.contractInfo || null;
            const { pendingProofRequest: latestPending } = await chrome.storage.local.get(['pendingProofRequest']);
            const sbtData = latestPending?.sbt || null;
            // verifier-web에서 받은 tokenURI 사용 (없으면 기본값)
            const tokenURI = latestPending?.tokenURI || sbtData?.tokenURI || 'ipfs://Qm...';
            
            console.log('[Background] tokenURI 사용:', tokenURI);
            
            const txResult = await sendProofTransaction(address, proofCalldata, contractInfo, tokenURI);
            
            if (txResult.success) {
              console.log('[Background] 트랜잭션 확정 완료!', txResult.txHash, 'Block:', txResult.blockNumber);
              
              await chrome.storage.local.set({
                pendingProofRequest: { 
                  ...pending, 
                  status: 'completed', 
                  finishedAt: Date.now(), 
                  address,
                  txHash: txResult.txHash
                }
              });
              
              try { 
                await chrome.runtime.sendMessage({ type: 'PROOF_PROGRESS', status: 'completed' }); 
              } catch(e) {
                console.error('[Background] PROOF_PROGRESS 메시지 전송 실패:', e);
              }
              
              try {
                const tabs = await chrome.tabs.query({ url: pending.origin + '/*' });
                for (const tab of tabs) {
                  if (tab.id) {
                    chrome.tabs.sendMessage(tab.id, {
                      type: 'PROOF_TRANSACTION_COMPLETED',
                      success: true,
                      txHash: txResult.txHash,
                      blockNumber: txResult.blockNumber,
                      origin: pending.origin
                    }).catch((err) => {
                      console.warn('[Background] verifier-web에 완료 메시지 전송 실패:', err);
                    });
                  }
                }
              } catch(e) {
                console.error('[Background] verifier-web 알림 전송 실패:', e);
              }
              
              // 모달 완료 상태 업데이트 후 토스트 표시
              setTimeout(async () => {
                // 우선순위: 1) 트랜잭션 receipt에서 파싱, 2) verifier-web에서 전달받은 데이터
                let sbtData = txResult.sbtData;
                
                if (!sbtData) {
                  const { pendingProofRequest: latestPending } = await chrome.storage.local.get(['pendingProofRequest']);
                  if (latestPending && (latestPending as any).sbt) {
                    sbtData = (latestPending as any).sbt;
                  }
                }
                
                if (sbtData) {
                  try {
                    const result = await chrome.storage.local.get(['savedSBTs']);
                    const savedSBTs = result.savedSBTs || [];
                    const id = sbtData.id || `sbt:${txResult.txHash || Date.now()}`;
                    const exists = savedSBTs.find((x: any) => x.id === id);
                    
                    if (exists) {
                      const idx = savedSBTs.findIndex((x: any) => x.id === id);
                      savedSBTs[idx] = sbtData;
                    } else {
                      savedSBTs.push(sbtData);
                    }
                    
                    await chrome.storage.local.set({ savedSBTs });
                    console.log('[Background] SBT 저장 완료 (트랜잭션 확정 후)');
                    
                    try {
                      chrome.runtime.sendMessage({ type: 'SBT_SAVED', id }).catch(() => {});
                    } catch(e) {
                      console.error('[Background] SBT_SAVED 메시지 전송 실패:', e);
                    }
                  } catch (error: any) {
                    console.error('[Background] SBT 저장 실패:', error);
                  }
                } else {
                  console.warn('[Background] SBT 데이터를 찾을 수 없습니다');
                }
              }, 500);
            } else {
              throw new Error(txResult.error || '트랜잭션 전송 실패');
            }
          } catch (error: any) {
            console.error('[Background] 트랜잭션 제출 실패:', error);
            await chrome.storage.local.set({
              pendingProofRequest: { 
                ...pending, 
                status: 'failed', 
                error: error.message || '트랜잭션 전송 실패',
                address
              }
            });
            try { 
              await chrome.runtime.sendMessage({ 
                type: 'PROOF_PROGRESS', 
                status: 'failed',
                error: error.message || '트랜잭션 전송 실패'
              }); 
            } catch(e) {
              console.error('[Background] PROOF_PROGRESS 메시지 전송 실패:', e);
            }
            
            try {
              const tabs = await chrome.tabs.query({ url: pending.origin + '/*' });
              for (const tab of tabs) {
                if (tab.id) {
                  chrome.tabs.sendMessage(tab.id, {
                    type: 'PROOF_TRANSACTION_COMPLETED',
                    success: false,
                    error: error.message || '트랜잭션 전송 실패',
                    origin: pending.origin
                  }).catch((err) => {
                    console.warn('[Background] verifier-web에 실패 메시지 전송 실패:', err);
                  });
                }
              }
            } catch(e) {
              console.error('[Background] verifier-web 알림 전송 실패:', e);
            }
            
            return;
          }
          
          setTimeout(async () => {
            console.log('[Background] Proof 요청 제거');
            await chrome.storage.local.remove(['pendingProofRequest']);
            try { 
              await chrome.runtime.sendMessage({ type: 'PROOF_PROGRESS', status: 'removed' }); 
            } catch(e) {
              console.error('[Background] PROOF_PROGRESS 메시지 전송 실패:', e);
            }
          }, 3000);
        }, 10000);

        sendResponse({ success: true, approved: true, address });
      }
    };

    chrome.runtime.onMessage.addListener(handlePopupMessage);

    setTimeout(async () => {
      chrome.runtime.onMessage.removeListener(handlePopupMessage);
      const { pendingProofRequest } = await chrome.storage.local.get(['pendingProofRequest']);
      if (pendingProofRequest && (pendingProofRequest.status === 'awaiting-address' || pendingProofRequest.status === 'awaiting-confirm')) {
        await chrome.storage.local.remove(['pendingProofRequest']);
        sendResponse({ success: false, approved: false, address: null, error: '사용자 응답 시간 초과' });
      }
    }, 30000);

  } catch (error: any) {
    sendResponse({ success: false, approved: false, address: null, error: error?.message || 'Proof 제출 처리 실패' });
  }
}

// Proof 제출 처리
async function handleProofSubmission(message: any, sender: chrome.runtime.MessageSender, sendResponse: (response: any) => void) {
  try {
    const existing = await chrome.storage.local.get(['pendingProofRequest']);
    if (existing.pendingProofRequest && existing.pendingProofRequest.status !== 'completed') {
      sendResponse({ 
        success: false, 
        approved: false, 
        error: '이미 진행 중인 Proof 제출이 있습니다. 완료될 때까지 기다려주세요.' 
      });
      return;
    }

    const pending = {
      origin: message.origin,
      region: message.region,
      vcType: message.vcType,
      prep: message.prep,
      status: 'awaiting-confirm',
      createdAt: Date.now()
    };
    await chrome.storage.local.set({ pendingProofRequest: pending });

    try {
      await chrome.action.openPopup();
    } catch (error) {
      await chrome.storage.local.remove(['pendingProofRequest']);
      sendResponse({ success: false, approved: false, error: '확장프로그램 팝업을 열 수 없습니다' });
      return;
    }

    const handlePopupMessage = async (popupMessage: any) => {
      if (popupMessage.type === 'PROOF_SUBMISSION_RESPONSE') {
        chrome.runtime.onMessage.removeListener(handlePopupMessage);

        if (!popupMessage.approved) {
          await chrome.storage.local.remove(['pendingProofRequest']);
          sendResponse({ success: true, approved: false });
          return;
        }

        console.log('[Background] Proof 승인됨, 증명 생성 시작...');
        await chrome.storage.local.set({
          pendingProofRequest: { ...pending, status: 'generating-proof', startedAt: Date.now() }
        });

        try { 
          await chrome.runtime.sendMessage({ type: 'PROOF_PROGRESS', status: 'generating-proof' }); 
        } catch(e) {
          console.error('[Background] PROOF_PROGRESS 메시지 전송 실패:', e);
        }

        setTimeout(async () => {
          console.log('[Background] 증명 생성 완료, 트랜잭션 제출 시작...');
          await chrome.storage.local.set({
            pendingProofRequest: { ...pending, status: 'submitting-tx', proofDoneAt: Date.now() }
          });
          try { 
            await chrome.runtime.sendMessage({ type: 'PROOF_PROGRESS', status: 'submitting-tx' }); 
          } catch(e) {
            console.error('[Background] PROOF_PROGRESS 메시지 전송 실패:', e);
          }
          
          setTimeout(async () => {
            console.log('[Background] 트랜잭션 제출 완료!');
            await chrome.storage.local.set({
              pendingProofRequest: { ...pending, status: 'completed', finishedAt: Date.now() }
            });
            try { 
              await chrome.runtime.sendMessage({ type: 'PROOF_PROGRESS', status: 'completed' }); 
            } catch(e) {
              console.error('[Background] PROOF_PROGRESS 메시지 전송 실패:', e);
            }
            
            setTimeout(async () => {
              console.log('[Background] Proof 요청 제거');
              await chrome.storage.local.remove(['pendingProofRequest']);
              try { 
                await chrome.runtime.sendMessage({ type: 'PROOF_PROGRESS', status: 'removed' }); 
              } catch(e) {
                console.error('[Background] PROOF_PROGRESS 메시지 전송 실패:', e);
              }
            }, 3000);
          }, 10000);
        }, 10000);

        sendResponse({ success: true, approved: true });
      }
    };

    chrome.runtime.onMessage.addListener(handlePopupMessage);

    setTimeout(async () => {
      chrome.runtime.onMessage.removeListener(handlePopupMessage);
      const { pendingProofRequest } = await chrome.storage.local.get(['pendingProofRequest']);
      if (pendingProofRequest && pendingProofRequest.status === 'awaiting-confirm') {
        await chrome.storage.local.remove(['pendingProofRequest']);
        sendResponse({ success: false, approved: false, error: '사용자 응답 시간 초과' });
      }
    }, 30000);

  } catch (error: any) {
    sendResponse({ success: false, approved: false, error: error?.message || 'Proof 제출 처리 실패' });
  }
}

// SBT 저장 처리 (Proof 트랜잭션 완료 후에만 호출되어야 함)
async function handleSaveSBT(message: any, sender: chrome.runtime.MessageSender, sendResponse: (response: any) => void) {
  try {
    console.warn('[Background] handleSaveSBT 직접 호출됨 - Proof 관련 SBT는 트랜잭션 완료 후에만 저장됩니다');
    sendResponse({ 
      success: false, 
      error: 'SBT는 트랜잭션 완료 후에만 저장됩니다. 직접 저장할 수 없습니다.' 
    });
    return;
  } catch (error: any) {
    sendResponse({ success: false, error: error?.message || 'SBT 저장 실패' });
  }
}

chrome.storage.local.get(['walletLocked'], (result) => {
  if (!result.walletLocked) {
    resetLockTimer();
  }
});

console.log('Background loaded');
console.log("Edit 'chrome-extension/src/background/index.ts' and save to reload.");
