import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './App.css';
import './styles/network.css';

// Chrome Extension API 타입 선언
declare global {
  const chrome: {
    storage: {
      local: {
        get: (keys: string | string[] | null) => Promise<{ [key: string]: any }>;
        set: (items: { [key: string]: any }) => Promise<void>;
        remove: (keys: string | string[]) => Promise<void>;
        clear: () => Promise<void>;
      };
    };
    runtime: {
      sendMessage: (message: any) => Promise<any>;
      onMessage: {
        addListener: (callback: (message: any, sender: any, sendResponse: any) => void) => void;
        removeListener: (callback: (message: any, sender: any, sendResponse: any) => void) => void;
      };
      id: string;
      lastError?: { message: string };
    };
    action: {
      openPopup: () => Promise<void>;
    };
    tabs?: {
      query: (queryInfo: any) => Promise<any[]>;
      sendMessage: (tabId: number, message: any) => Promise<any>;
    };
  };
}
import { createAndStoreWallet, getAddress, getProvider, importWalletFromMnemonic, importWalletFromPrivateKey, initDevWallet, isUnlocked, lockWallet, resetStoredState, unlockWithPassword, clearAllStorageData, hasEncryptedKeystore, getWalletType, getRuntimeWallet } from './lib/wallet';
import { Interface } from 'ethers';
import { hdWalletService } from './lib/hdWalletService';
import { isDevModeEnabled } from './config';
import { APP_CONFIG } from './config/app.config';
import { STORAGE_KEYS } from './config/storage';
import { storageAdapter } from './lib/storageAdapter';
import { NetworkSelector } from './components/NetworkSelector';
import { NetworkConfig } from './types/network';
import { toastManager } from './utils/toast';
import { networkService } from './lib/networkService';
import { AddressRequestModal } from './components/AddressRequestModal';
import { SensitiveInput, SensitiveTextarea } from './components/SensitiveField';
import { AccountSelector } from './components/AccountSelector';
import { AccountManager } from './components/AccountManager';
import { WalletAccount } from './types/hdWallet';
import { VCDataModal } from './components/VCDataModal';
import { DataModal } from './components/DataModal';
import { VCIssuanceModal } from './components/VCIssuanceModal';
import { AddVCModal } from './components/AddVCModal';
import { DeleteConfirmModal } from './components/DeleteConfirmModal';
import { VerifiableCredential } from './types/vc';
import { verifyVC } from './lib/vcVerification';

// Type reference for Electron API
/// <reference path="./types/electron.d.ts" />

interface AppProps {
  platform?: 'desktop' | 'extension';
  extensionActions?: React.ReactNode;
  onThemeChange?: (theme: 'light' | 'dark') => void;
}

const AppContent = ({ platform = 'desktop', extensionActions, onThemeChange }: AppProps) => {
  
  const getInitialTheme = () => {
    try {
      // Don't read storage synchronously here. Use storageAdapter in an effect below.
      if (APP_CONFIG.defaults.theme === 'system' && typeof window !== 'undefined' && window.matchMedia) {
        return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      }
      return APP_CONFIG.defaults.theme === 'system' ? 'light' : APP_CONFIG.defaults.theme;
    } catch { return 'light'; }
  };

  const [theme, setTheme] = useState<'light' | 'dark'>(getInitialTheme);
  // 마지막으로 열었던 탭을 localStorage에서 복원
  const getInitialTab = (): 'tokens' | 'vc' | 'nft' | 'activity' => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.lastActiveTab);
      if (saved === 'tokens' || saved === 'vc' || saved === 'nft' || saved === 'activity') return saved as any;
    } catch {}
    return APP_CONFIG.defaults.lastActiveTab;
  };

  const [activeTab, setActiveTab] = useState<'tokens' | 'vc' | 'nft' | 'activity'>(getInitialTab);
  const [savedSBTs, setSavedSBTs] = useState<any[]>([]);
  const [selectedSBT, setSelectedSBT] = useState<any | null>(null);
  const [currentNetwork, setCurrentNetwork] = useState<NetworkConfig | null>(null);
  const [networksInitialized, setNetworksInitialized] = useState(false);
  const [unlocked, setUnlocked] = useState<boolean>(isUnlocked());
  const [address, setAddress] = useState<string | undefined>(getAddress());
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [showMenu, setShowMenu] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const [menuDropdownPosition, setMenuDropdownPosition] = useState({ top: 0, right: 0 });
  const [forceCloseDropdowns, setForceCloseDropdowns] = useState(false);
  const [savedVCs, setSavedVCs] = useState<VerifiableCredential[]>([]);
  const [selectedVC, setSelectedVC] = useState<VerifiableCredential | null>(null);
  const [vcIssuanceRequest, setVcIssuanceRequest] = useState<{
    vc: VerifiableCredential;
    student: any;
    origin: string;
    isDuplicate: boolean;
    duplicateId?: string;
  } | null>(null);
  const [vcSaveRequest, setVcSaveRequest] = useState<{
    vc: VerifiableCredential;
    origin: string;
    isDuplicate: boolean;
    duplicateId?: string;
    duplicateVC?: VerifiableCredential;
  } | null>(null);
  const [proofRequest, setProofRequest] = useState<{
    origin: string;
    region: string;
    vcType: string;
    status: 'awaiting-confirm' | 'awaiting-address' | 'generating-proof' | 'submitting-tx' | 'completed' | 'failed';
    createdAt?: number;
    startedAt?: number;
    proofDoneAt?: number;
    finishedAt?: number;
    contractInfo?: {
      address: string;
      functionName: string;
      functionSignature?: string;
      description?: string;
    } | null;
  } | null>(null);
  const [showAddVCModal, setShowAddVCModal] = useState(false);
  const [deleteConfirmModal, setDeleteConfirmModal] = useState<{
    isOpen: boolean;
    vcId: string;
    vcName: string;
  }>({
    isOpen: false,
    vcId: '',
    vcName: ''
  });
  
  // HD Wallet states
  const [activeAccount, setActiveAccount] = useState<WalletAccount | null>(null);
  const [showAccountManager, setShowAccountManager] = useState(false);
  const [walletType, setWalletType] = useState<'mnemonic' | 'privateKey' | null>(null);
  const [addressRequest, setAddressRequest] = useState<{
    origin: string;
  } | null>(null);
  type WizardStep = 'login' | 'setPassword' | 'chooseAddr' | 'connect';
  const [step, setStep] = useState<WizardStep>('setPassword'); // 기본값으로 설정, useEffect에서 실제 상태 확인
  const [stepHistory, setStepHistory] = useState<WizardStep[]>([]);

  const goToStep = (next: WizardStep) => {
    setStepHistory((h: WizardStep[]) => (step ? [...h, step] : h));
    setStep(next);
  };

  const goBack = () => {
    setStepHistory((h: WizardStep[]) => {
      if (h.length === 0) return h;
      const prev = h[h.length - 1];
      setStep(prev);
      return h.slice(0, -1);
    });
  };
  const [addressMode, setAddressMode] = useState<'create' | 'reuse'>('create');
  const [importMode, setImportMode] = useState<'mnemonic' | 'privateKey'>('mnemonic');
  const [mnemonic, setMnemonic] = useState('');
  const [privateKey, setPrivateKey] = useState('');
  const [showDataResetConfirm, setShowDataResetConfirm] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [toastVisible, setToastVisible] = useState(false);
  const [showAddressRequest, setShowAddressRequest] = useState(false);
  const [requestOrigin, setRequestOrigin] = useState<string>('');
  const idleTimerRef = useRef<number | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const IDLE_LOCK_MS = 5 * 60 * 1000; // 5 minutes
  const TOAST_DURATION_MS = 5000; // 5 seconds

  // Load saved theme on mount using storageAdapter (persists across background/close)
  useEffect(() => {
    (async () => {
      try {
        const saved = await storageAdapter.get(STORAGE_KEYS.theme);
        if (saved === 'light' || saved === 'dark') {
          setTheme(saved);
        }
      } catch {}
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    (async () => {
      try { await storageAdapter.set(STORAGE_KEYS.theme, theme); } catch {}
      onThemeChange?.(theme);
    })();
  }, [theme, onThemeChange]);

  // activeTab 변경 시 localStorage에 저장
  useEffect(() => {
    (async () => { try { await storageAdapter.set(STORAGE_KEYS.lastActiveTab, activeTab); } catch {} })();
  }, [activeTab]);

  // Detect standalone mode (when opened directly in browser)
  useEffect(() => {
    const isStandalone = window.location.protocol === 'chrome-extension:' && 
                        !window.location.search.includes('popup=true') &&
                        window.parent === window; // not in iframe
    
    if (isStandalone) {
      document.body.classList.add('standalone');
    } else {
      document.body.classList.remove('standalone');
    }
  }, []);
  // 토스트 매니저 연결
  useEffect(() => {
    const unsubscribe = toastManager.addListener((message: string) => {
      setToast(message);
    });
    return () => {
      unsubscribe();
    };
  }, []);

  // 백그라운드에서 VC 저장 알림 받기
  useEffect(() => {
    if (platform === 'extension') {
      const handleBackgroundMessage = (message: any) => {
        if (message.type === 'VC_SAVED') {
          // VC 목록 새로고침
          loadSavedVCs();
          
          // 토스트 메시지 표시
          if (message.isDuplicate) {
            toastManager.show('기존 VC가 새 VC로 갱신되었습니다');
          } else {
            toastManager.show('새 VC가 성공적으로 추가되었습니다');
          }
        } else if (message.type === 'PROOF_PROGRESS') {
          // Force reload of pendingProofRequest status
          console.log('[Popup] PROOF_PROGRESS 메시지 받음:', message.status);
          if (message.status === 'removed') {
            console.log('[Popup] Proof 요청 제거');
            setProofRequest(null);
          } else {
            (async () => {
              const result = await chrome.storage.local.get(['pendingProofRequest']);
              console.log('[Popup] Storage에서 읽어온 pendingProofRequest:', (result as any).pendingProofRequest);
              if ((result as any).pendingProofRequest) {
                setProofRequest((result as any).pendingProofRequest);
              } else {
                setProofRequest(null);
              }
            })();
          }
        } else if (message.type === 'SBT_SAVED') {
          // reload SBTs and switch to NFT tab on completion
          (async () => {
            const result = await chrome.storage.local.get(['savedSBTs']);
            setSavedSBTs(result.savedSBTs || []);
            setActiveTab('nft');
            toastManager.show('SBT가 저장되었습니다');
          })();
        } else if (message.type === 'SEND_PROOF_TX') {
          (async () => {
            try {
              const { address: txAddress, proofCalldata, contractInfo, tokenURI } = message;
              console.log('[Popup] Proof 트랜잭션 전송 요청 받음:', { txAddress, contractInfo, tokenURI });
              
              if (!contractInfo || !contractInfo.address) {
                throw new Error('컨트랙트 정보가 없습니다');
              }
              
              // 네트워크 정보가 있으면 해당 네트워크로 전환
              let provider = getProvider();
              if (contractInfo.network) {
                const networkInfo = contractInfo.network;
                console.log('[Popup] 컨트랙트 네트워크 정보:', networkInfo);
                
                try {
                  // 네트워크 목록에 해당 네트워크가 있는지 확인
                  const networks = networkService.getNetworks();
                  let targetNetwork = networks.find(n => n.chainId === networkInfo.chainId);
                  
                  // 네트워크가 없으면 추가
                  if (!targetNetwork) {
                    console.log('[Popup] 새로운 네트워크 추가:', networkInfo);
                    await networkService.addCustomNetwork({
                      name: networkInfo.name || `Chain ${networkInfo.chainId}`,
                      chainId: networkInfo.chainId,
                      rpcUrl: networkInfo.rpcUrl,
                      symbol: 'ETH',
                      explorerUrl: ''
                    });
                    targetNetwork = networkService.getNetworks().find(n => n.chainId === networkInfo.chainId);
                  }
                  
                  // 네트워크 전환
                  if (targetNetwork) {
                    await networkService.switchNetwork(targetNetwork.chainId);
                    // Provider 재생성
                    const { JsonRpcProvider } = await import('ethers');
                    provider = new JsonRpcProvider(targetNetwork.rpcUrl, targetNetwork.chainId);
                    console.log('[Popup] 네트워크 전환 완료:', targetNetwork.name, targetNetwork.chainId);
                  } else {
                    throw new Error('네트워크 추가 후 찾을 수 없습니다');
                  }
                } catch (error: any) {
                  console.error('[Popup] 네트워크 전환 실패:', error);
                  throw new Error(`네트워크 전환 실패: ${error.message || error}`);
                }
              }
              
              const walletAddress = getAddress();
              const wallet = getRuntimeWallet();
              
              if (!provider || !walletAddress || !isUnlocked() || !wallet) {
                throw new Error('지갑이 잠겨있거나 연결되지 않았습니다');
              }

              // proofCalldata는 [pA, pB, pC, pubSignals] 배열 표현식 문자열
              // 구조: "[0x..., 0x...], [[0x..., 0x...], [0x..., 0x...]], [0x..., 0x...], [0x...,0x...,...]"
              // pA: uint256[2], pB: uint256[2][2], pC: uint256[2], pubSignals: uint256[5]
              let parsedCalldata;
              try {
                // 배열 표현식을 배열로 변환
                const formattedCalldata = `[${proofCalldata.replace(/0x[0-9a-fA-F]+/g, (match: string) => `"${match}"`).replace(/\[/g, '[').replace(/\]/g, ']').replace(/,/g, ',')}]`;
                parsedCalldata = JSON.parse(formattedCalldata);
                console.log('Parsed Calldata:', parsedCalldata);
              } catch (e) {
                const errorMsg = e instanceof Error ? e.message : String(e);
                console.error('[Popup] Proof 데이터 파싱 실패:', e, 'calldata:', proofCalldata);
                throw new Error(`Proof 데이터 파싱 실패: ${errorMsg}`);
              }
              
              // proofData는 [pA, pB, pC, pubSignals] 형태
              const [pA, pB, pC, pubSignals] = parsedCalldata;
              
              console.log('[Popup] Proof 데이터 파싱 완료:', {
                pA,
                pB,
                pC,
                pubSignals
              });
              
              const mintSBTInterface = new Interface([
                'function mintSBT(uint256[2] calldata _pA, uint256[2][2] calldata _pB, uint256[2] calldata _pC, uint256[5] calldata _pubSignals, string memory tokenURI) public'
              ]);
              
              // 파라미터를 그대로 전달하여 트랜잭션 인코딩
              const encodedData = mintSBTInterface.encodeFunctionData('mintSBT', [
                pA,
                pB,
                pC,
                pubSignals,
                tokenURI || 'ipfs://'
              ]);
              
              console.log('[Popup] 트랜잭션 전송:', {
                to: contractInfo.address,
                from: walletAddress,
                data: encodedData
              });
              
              const connectedWallet = wallet.connect(provider);
              const txResponse = await connectedWallet.sendTransaction({
                to: contractInfo.address,
                data: encodedData,
                gasLimit: 1000000
              });
              
              console.log('[Popup] 트랜잭션 전송됨, 해시:', txResponse.hash);
              
              const receipt = await provider.waitForTransaction(txResponse.hash, 1, 60000);
              
              if (!receipt || receipt.status !== 1) {
                throw new Error('트랜잭션이 실패했습니다');
              }
              
              console.log('[Popup] 트랜잭션 확정 완료:', receipt.blockNumber);
              
              const PassMintedInterface = new Interface([
                'event PassMinted(address indexed recipient, uint256 tokenId)'
              ]);
              
              let sbtData = null;
              if (receipt.logs && receipt.logs.length > 0) {
                for (const log of receipt.logs) {
                  try {
                    const parsed = PassMintedInterface.parseLog(log);
                    if (parsed && parsed.name === 'PassMinted') {
                      sbtData = {
                        recipient: parsed.args.recipient,
                        tokenId: parsed.args.tokenId.toString(),
                        txHash: receipt.hash || (receipt as any).transactionHash,
                        blockNumber: receipt.blockNumber.toString()
                      };
                      console.log('[Popup] PassMinted 이벤트 파싱 완료:', sbtData);
                      break;
                    }
                  } catch (e) {
                  }
                }
              }
              
              chrome.runtime.sendMessage({
                type: 'PROOF_TX_RESPONSE',
                success: true,
                txHash: receipt.hash || (receipt as any).transactionHash,
                blockNumber: receipt.blockNumber.toString(),
                sbtData: sbtData
              });
              
            } catch (error: any) {
              console.error('[Popup] Proof 트랜잭션 전송 실패:', error);
              chrome.runtime.sendMessage({
                type: 'PROOF_TX_RESPONSE',
                success: false,
                error: error.message || '트랜잭션 전송 실패'
              });
            }
          })();
        }
      };

      chrome.runtime.onMessage.addListener(handleBackgroundMessage);
      
      return () => {
        chrome.runtime.onMessage.removeListener(handleBackgroundMessage);
      };
    }
  }, [platform]);

  // Load saved VCs function
  const loadSavedVCs = useCallback(async () => {
    try {
      if (platform === 'extension') {
        const result = await chrome.storage.local.get(['savedVCs']);
        let vcs = result.savedVCs || [];
        // Seed dev VCs when none exist
        if (APP_CONFIG.dev?.seedVCs && vcs.length === 0) {
          try {
            const { default: demo } = await import('./config/demo-vcs.json');
            const seeded: any[] = [demo.driver, demo.engineer, demo.diploma].filter(Boolean);
            if (seeded.length > 0) {
              await chrome.storage.local.set({ savedVCs: seeded });
              vcs = seeded;
            }
          } catch {}
        }
        setSavedVCs(vcs);
      } else {
        // Desktop: localStorage 사용
        const savedVCsJson = localStorage.getItem('savedVCs');
        let vcs = savedVCsJson ? JSON.parse(savedVCsJson) : [];
        if (APP_CONFIG.dev?.seedVCs && vcs.length === 0) {
          try {
            const { default: demo } = await import('./config/demo-vcs.json');
            const seeded: any[] = [demo.driver, demo.engineer, demo.diploma].filter(Boolean);
            if (seeded.length > 0) {
              localStorage.setItem('savedVCs', JSON.stringify(seeded));
              vcs = seeded;
            }
          } catch {}
        }
        setSavedVCs(vcs);
      }
    } catch (error) {
      console.error('VC 로드 실패:', error);
    }
  }, [platform]);

  // Load saved SBTs
  const loadSavedSBTs = useCallback(async () => {
    try {
      if (platform === 'extension') {
        const result = await chrome.storage.local.get(['savedSBTs']);
        let sbts = result.savedSBTs || [];
        // Seed dev SBTs when none exist
        if (APP_CONFIG.dev?.seedVCs && sbts.length === 0) {
          try {
            const { default: demoSBTs } = await import('./config/demo-sbts.json');
            const seeded: any[] = [demoSBTs.cnu_graduation, demoSBTs.daejeon_resident].filter(Boolean);
            if (seeded.length > 0) {
              await chrome.storage.local.set({ savedSBTs: seeded });
              sbts = seeded;
            }
          } catch (err) {
            console.error('Demo SBT 로드 실패:', err);
          }
        }
        setSavedSBTs(sbts);
      } else {
        // Desktop: localStorage 사용
        const json = localStorage.getItem('savedSBTs');
        let sbts = json ? JSON.parse(json) : [];
        if (APP_CONFIG.dev?.seedVCs && sbts.length === 0) {
          try {
            const { default: demoSBTs } = await import('./config/demo-sbts.json');
            const seeded: any[] = [demoSBTs.cnu_graduation, demoSBTs.daejeon_resident].filter(Boolean);
            if (seeded.length > 0) {
              localStorage.setItem('savedSBTs', JSON.stringify(seeded));
              sbts = seeded;
            }
          } catch (err) {
            console.error('Demo SBT 로드 실패:', err);
          }
        }
        setSavedSBTs(sbts);
      }
    } catch (error) {
      console.error('SBT 로드 실패:', error);
    }
  }, [platform]);

  // Load saved VCs on mount
  useEffect(() => {
    loadSavedVCs();
    loadSavedSBTs();
  }, [loadSavedVCs, loadSavedSBTs]);

  // Handle pending requests from storage
  useEffect(() => {
    if (platform === 'extension') {
      const checkPendingRequests = async () => {
        try {
          const result = await chrome.storage.local.get(['pendingVCIssuance', 'pendingVCSave', 'pendingAddressRequest', 'pendingProofRequest']);
          
          // VC 발급 요청 확인
          const pendingVCIssuance = result.pendingVCIssuance;
          if (pendingVCIssuance) {
            const now = Date.now();
            const requestAge = now - pendingVCIssuance.timestamp;
            
            if (requestAge < 5 * 60 * 1000) { // 5분
              setVcIssuanceRequest({
                vc: pendingVCIssuance.vc,
                student: pendingVCIssuance.student,
                origin: pendingVCIssuance.origin,
                isDuplicate: pendingVCIssuance.isDuplicate,
                duplicateId: pendingVCIssuance.duplicateId
              });
              
            } else {
              await chrome.storage.local.remove(['pendingVCIssuance']);
            }
          }
          
          // VC 저장 요청 확인 (근본적 해결)
          const pendingVCSave = result.pendingVCSave;
          if (pendingVCSave) {
            const now = Date.now();
            const requestAge = now - pendingVCSave.timestamp;
            
            if (requestAge < 5 * 60 * 1000) { // 5분
              // 모달 표시
              setVcSaveRequest({
                vc: pendingVCSave.vc,
                origin: pendingVCSave.origin,
                isDuplicate: pendingVCSave.isDuplicate,
                duplicateId: pendingVCSave.duplicateId,
                duplicateVC: pendingVCSave.duplicateVC
              });
              
              
              // 즉시 pendingVCSave 제거 (중복 표시 방지)
              await chrome.storage.local.remove(['pendingVCSave']);
            } else {
              await chrome.storage.local.remove(['pendingVCSave']);
            }
          }
          
          // 주소 요청 확인
          const pendingAddressRequest = result.pendingAddressRequest;
          if (pendingAddressRequest) {
            const now = Date.now();
            const requestAge = now - pendingAddressRequest.timestamp;
            
            if (requestAge < 5 * 60 * 1000) { // 5분
              setAddressRequest({
                origin: pendingAddressRequest.origin
              });
              
            } else {
              await chrome.storage.local.remove(['pendingAddressRequest']);
            }
          }

          // Proof 제출 요청 확인
          const pendingProofRequest = result.pendingProofRequest;
          if (pendingProofRequest) {
            setProofRequest(pendingProofRequest);
          }
        } catch (error) {
          console.error('대기 중인 요청 확인 실패:', error);
        }
      };
      
      checkPendingRequests();
    }
  }, [platform]);

  // VC 발급 승인/거절 핸들러
  const handleVCIssuanceApprove = async () => {
    if (!vcIssuanceRequest) return;
    
    try {
      // 백그라운드에 승인 응답 전송
      await chrome.runtime.sendMessage({
        type: 'VC_ISSUANCE_RESPONSE',
        approved: true
      });
      
      // VC 목록 새로고침
      if (platform === 'extension') {
        const result = await chrome.storage.local.get(['savedVCs']);
        setSavedVCs(result.savedVCs || []);
      } else {
        const savedVCsJson = localStorage.getItem('savedVCs');
        const vcs = savedVCsJson ? JSON.parse(savedVCsJson) : [];
        setSavedVCs(vcs);
      }
      
      setVcIssuanceRequest(null);
    } catch (error) {
      console.error('VC 발급 승인 실패:', error);
    }
  };

  const handleVCIssuanceReject = async () => {
    if (!vcIssuanceRequest) return;
    
    try {
      // 백그라운드에 거절 응답 전송
      await chrome.runtime.sendMessage({
        type: 'VC_ISSUANCE_RESPONSE',
        approved: false,
        error: '사용자가 거절했습니다'
      });
      
      setVcIssuanceRequest(null);
    } catch (error) {
      console.error('VC 발급 거절 실패:', error);
    }
  };

  // VC 저장 승인/거절 핸들러
  const handleVCSaveApprove = async () => {
    if (!vcSaveRequest) return;
    
    try {
      // 직접 VC 저장 (백그라운드 통신 없이)
      await saveVC(vcSaveRequest.vc, vcSaveRequest.origin);
      
      // pendingVCSave는 이미 팝업 시작 시 제거되었으므로 제거하지 않음
      setVcSaveRequest(null);
    } catch (error) {
      console.error('VC 저장 승인 실패:', error);
    }
  };

  const handleVCSaveReject = async () => {
    if (!vcSaveRequest) return;
    
    try {
      // pendingVCSave는 이미 팝업 시작 시 제거되었으므로 제거하지 않음
      setVcSaveRequest(null);
    } catch (error) {
      console.error('VC 저장 거절 실패:', error);
    }
  };

  // Proof 제출 승인/거절
  const handleProofApprove = async () => {
    try {
      console.log('[Popup] Proof 승인 버튼 클릭, 백그라운드에 메시지 전송...');
      await chrome.runtime.sendMessage({ type: 'PROOF_SUBMISSION_RESPONSE', approved: true });
      console.log('[Popup] 백그라운드 응답 받음, 상태는 background에서 업데이트됨');
      // 상태는 background에서 업데이트됨
    } catch (error) {
      console.error('[Popup] Proof 제출 승인 실패:', error);
    }
  };

  // 주소 + Proof 통합 승인
  const handleProofWithAddressApprove = async () => {
    try {
      console.log('[Popup] 주소 + Proof 승인 버튼 클릭, 백그라운드에 메시지 전송...');
      const currentAddress = getAddress();
      await chrome.runtime.sendMessage({ 
        type: 'PROOF_WITH_ADDRESS_RESPONSE', 
        approved: true, 
        address: currentAddress 
      });
      console.log('[Popup] 백그라운드 응답 받음, 상태는 background에서 업데이트됨');
      // 상태는 background에서 업데이트됨
    } catch (error) {
      console.error('[Popup] 주소 + Proof 승인 실패:', error);
    }
  };

  const handleProofReject = async () => {
    try {
      const currentProofStatus = proofRequest?.status;
      
      if (currentProofStatus === 'awaiting-address') {
        // 통합 요청 거절
        await chrome.runtime.sendMessage({ 
          type: 'PROOF_WITH_ADDRESS_RESPONSE', 
          approved: false, 
          error: '사용자가 거절했습니다' 
        });
      } else {
        // 일반 Proof 요청 거절
        await chrome.runtime.sendMessage({ 
          type: 'PROOF_SUBMISSION_RESPONSE', 
          approved: false, 
          error: '사용자가 거절했습니다' 
        });
      }
      
      await chrome.storage.local.remove(['pendingProofRequest']);
      setProofRequest(null);
    } catch (error) {
      console.error('Proof 제출 거절 실패:', error);
    }
  };

  // SBT 삭제 핸들러
  const handleDeleteSBT = async (sbtId: string) => {
    try {
      if (platform === 'extension') {
        const result = await chrome.storage.local.get(['savedSBTs']);
        const currentSBTs = result.savedSBTs || [];
        const updatedSBTs = currentSBTs.filter((sbt: any) => sbt.id !== sbtId);
        await chrome.storage.local.set({ savedSBTs: updatedSBTs });
        setSavedSBTs(updatedSBTs);
        toastManager.show('SBT가 삭제되었습니다');
      } else {
        // Desktop: 직접 삭제
        const updatedSBTs = savedSBTs.filter((sbt: any) => sbt.id !== sbtId);
        setSavedSBTs(updatedSBTs);
        // localStorage에 저장
        localStorage.setItem('savedSBTs', JSON.stringify(updatedSBTs));
        toastManager.show('SBT가 삭제되었습니다');
      }
    } catch (error) {
      console.error('SBT 삭제 실패:', error);
      toastManager.show('SBT 삭제에 실패했습니다');
    }
  };

  // 수동 VC 추가 핸들러
  const handleAddVC = async (vc: VerifiableCredential) => {
    try {
      // 모든 플랫폼에서 동일한 처리: VC 검증 후 중복 체크
      const verification = await verifyVC(vc, address);
      
      if (!verification.isValid) {
        toastManager.show(`VC 검증 실패: ${verification.errors.join(', ')}`);
        return;
      }

      // 중복 VC 체크
      const duplicateVC = checkDuplicateVC(vc, savedVCs);
      
      if (duplicateVC) {
        // 중복된 VC가 있으면 사용자에게 확인 요청
        setVcSaveRequest({
          vc: vc,
          origin: 'manual-import',
          isDuplicate: true,
          duplicateId: duplicateVC.id,
          duplicateVC: duplicateVC
        });
        setShowAddVCModal(false);
      } else {
        // 중복이 없으면 바로 저장
        await saveVC(vc, 'manual-import');
        setShowAddVCModal(false);
      }
    } catch (error: any) {
      console.error('VC 추가 실패:', error);
      toastManager.show(`VC 추가 실패: ${error.message}`);
    }
  };

  // VC 저장 함수 (플랫폼별 처리)
  const saveVC = async (vc: VerifiableCredential, origin: string) => {
    if (platform === 'extension') {
      // Extension: 백그라운드 스크립트를 통해 저장
      const response = await chrome.runtime.sendMessage({
        type: 'SAVE_VC_DIRECT',
        vc: vc,
        origin: origin,
        currentWalletAddress: address
      });
      
      if (response && response.success) {
        // 백그라운드에서 VC_SAVED 알림이 올 때까지 대기
        // VC 목록 새로고침은 백그라운드 알림에서 처리됨
      } else {
        toastManager.show(`VC 추가 실패: ${response?.error || '알 수 없는 오류'}`);
      }
    } else {
      // Desktop: 직접 저장
      const duplicateVC = checkDuplicateVC(vc, savedVCs);
      
      if (duplicateVC) {
        // 중복된 VC가 있으면 덮어쓰기
        const updatedVC = {
          ...vc,
          id: duplicateVC.id,
          savedAt: new Date().toISOString(),
          origin: origin,
          previousSavedAt: duplicateVC.savedAt
        };
        
        const updatedVCs = savedVCs.map((savedVC: VerifiableCredential) => 
          savedVC.id === duplicateVC.id ? updatedVC : savedVC
        );
        
        setSavedVCs(updatedVCs);
        // localStorage에 저장
        localStorage.setItem('savedVCs', JSON.stringify(updatedVCs));
        toastManager.show('기존 VC가 새 VC로 덮어쓰기되었습니다');
      } else {
        // 새로운 VC 추가
        const newVC = {
          ...vc,
          id: Date.now().toString(),
          savedAt: new Date().toISOString(),
          origin: origin
        };
        
        const updatedVCs = [...savedVCs, newVC];
        setSavedVCs(updatedVCs);
        // localStorage에 저장
        localStorage.setItem('savedVCs', JSON.stringify(updatedVCs));
        toastManager.show('VC가 성공적으로 추가되었습니다');
      }
    }
  };

  // 중복 VC 체크 함수 (Desktop용)
  const checkDuplicateVC = (newVC: VerifiableCredential, savedVCs: VerifiableCredential[]): VerifiableCredential | null => {
    for (const savedVC of savedVCs) {
      // 1. 발급자 비교 (issuer ID 또는 public key)
      const newIssuer = newVC.issuer?.id || newVC.issuer;
      const savedIssuer = savedVC.issuer?.id || savedVC.issuer;
      
      // 2. 소유자 비교 (credentialSubject의 식별자)
      const newSubject = newVC.credentialSubject?.id || 
                        newVC.credentialSubject?.name || 
                        newVC.credentialSubject?.studentName;
      const savedSubject = savedVC.credentialSubject?.id || 
                          savedVC.credentialSubject?.name || 
                          savedVC.credentialSubject?.studentName;
      
      // 3. VC 타입 비교 (VerifiableCredential 제외한 실제 타입)
      const newVCType = newVC.type?.find((t: string) => t !== 'VerifiableCredential');
      const savedVCType = savedVC.type?.find((t: string) => t !== 'VerifiableCredential');
      
      // 세 조건이 모두 일치하면 중복으로 판단
      if (newIssuer && savedIssuer && newIssuer === savedIssuer &&
          newSubject && savedSubject && newSubject === savedSubject &&
          newVCType && savedVCType && newVCType === savedVCType) {
        return savedVC;
      }
    }
    return null;
  };

  // VC 삭제 핸들러
  const handleDeleteVC = async (vcId: string) => {
    try {
      if (platform === 'extension') {
        // Extension: 백그라운드 스크립트에 삭제 요청
        const response = await chrome.runtime.sendMessage({
          type: 'DELETE_VC',
          vcId: vcId
        });
        
        if (response && response.success) {
          // VC 목록 새로고침
          const result = await chrome.storage.local.get(['savedVCs']);
          setSavedVCs(result.savedVCs || []);
          toastManager.show('VC가 삭제되었습니다');
        } else {
          toastManager.show(`VC 삭제 실패: ${response?.error || '알 수 없는 오류'}`);
        }
      } else {
        // Desktop: 직접 삭제
        const updatedVCs = savedVCs.filter((vc: VerifiableCredential) => vc.id !== vcId);
        setSavedVCs(updatedVCs);
        // localStorage에 저장
        localStorage.setItem('savedVCs', JSON.stringify(updatedVCs));
        toastManager.show('VC가 삭제되었습니다');
      }
    } catch (error: any) {
      console.error('VC 삭제 실패:', error);
      toastManager.show(`VC 삭제 실패: ${error.message}`);
    }
  };

  // VC 삭제 확인 모달 핸들러
  const handleDeleteConfirm = (vcId: string, vcName: string) => {
    setDeleteConfirmModal({
      isOpen: true,
      vcId: vcId,
      vcName: vcName
    });
  };

  const handleDeleteConfirmApprove = async () => {
    if (deleteConfirmModal.vcId) {
      // VC인지 SBT인지 확인 (id 형식으로 판단)
      const isSBT = deleteConfirmModal.vcId.startsWith('sbt:') || 
                    savedSBTs.some((sbt: any) => sbt.id === deleteConfirmModal.vcId);
      
      if (isSBT) {
        await handleDeleteSBT(deleteConfirmModal.vcId);
      } else {
        await handleDeleteVC(deleteConfirmModal.vcId);
      }
    }
    setDeleteConfirmModal({
      isOpen: false,
      vcId: '',
      vcName: ''
    });
  };

  const handleDeleteConfirmCancel = () => {
    setDeleteConfirmModal({
      isOpen: false,
      vcId: '',
      vcName: ''
    });
  };

  // Toast management
  useEffect(() => {
    if (toast) {
      setToastVisible(true);
      
      // Clear any existing timer
      if (toastTimerRef.current) {
        window.clearTimeout(toastTimerRef.current);
      }
      
      // Set timer to fade out after duration
      toastTimerRef.current = window.setTimeout(() => {
        setToastVisible(false);
        
        // Remove toast after fade animation completes (300ms)
        setTimeout(() => {
          setToast(null);
        }, 300);
      }, TOAST_DURATION_MS);
    }
    
    return () => {
      if (toastTimerRef.current) {
        window.clearTimeout(toastTimerRef.current);
      }
    };
  }, [toast, TOAST_DURATION_MS]);

  // Initialize app state from LevelDB
  useEffect(() => {
    (async () => {
      await networkService.init();
      const currentNet = networkService.getCurrentNetwork();
      if (currentNet) {
        setCurrentNetwork(currentNet);
      }
      setNetworksInitialized(true);
      
      // 지갑 타입 확인
      const walletType = await getWalletType();
      setWalletType(walletType);
      
      // 니모닉 기반 지갑인 경우에만 HD 지갑 초기화
      if (walletType === 'mnemonic') {
        await hdWalletService.loadState();
        const currentAccount = hdWalletService.getActiveAccount();
        if (currentAccount) {
          setActiveAccount(currentAccount);
        }
      }
      
      // Check if wallet exists to determine initial step
      const hasKeystore = await hasEncryptedKeystore();
      if (hasKeystore) {
        setStep('login');
      } else {
        setStep('setPassword');
      }
    })();
  }, []);

  // Step 전환 시 에러 초기화 (뒤로가기/탭 이동 시 잔여 에러 제거)
  useEffect(() => {
    setError(undefined);
  }, [step]);

  const formatUnlockError = (e: any): string => {
    const msg = (e && (e.message || e.toString()))?.toLowerCase?.() || '';
    if (msg.includes('keystore not found')) return '등록된 지갑이 없습니다. 먼저 지갑을 등록하세요.';
    if (msg.includes('invalid password') || msg.includes('incorrect password') || msg.includes('bad decrypt')) return '비밀번호가 올바르지 않습니다. 다시 시도해 주세요.';
    if (msg.includes('timeout')) return '네트워크 지연으로 잠금 해제에 실패했습니다. 잠시 후 다시 시도해 주세요.';
    return '잠금 해제에 실패했습니다. 비밀번호를 확인하고 다시 시도해 주세요.';
  };

  // Check for address request from URL parameters
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const requestAddress = urlParams.get('requestAddress');
    const origin = urlParams.get('origin');
    
    
    if (requestAddress === 'true' && origin) {
      setRequestOrigin(decodeURIComponent(origin));
      setShowAddressRequest(true);
    }
  }, []);

  // Initialize dev wallet on mount
  useEffect(() => {
    if (isDevModeEnabled()) {
      initDevWallet().then((initialized) => {
        if (initialized) {
          setUnlocked(true);
          setAddress(getAddress());
          // setSelectedNet('sepolia'); // Default to sepolia
        }
      }).catch((error) => {
        console.error('Dev wallet initialization failed:', error);
        setError(`개발 모드 초기화 실패: ${error.message}`);
        setUnlocked(false);
        // Force user to go through normal setup
      });
    }
  }, []);

  // 개발자 도구에서 사용할 수 있도록 전역 함수 등록
  useEffect(() => {
    if (typeof window !== 'undefined') {
      (window as any).__DID_WALLET_DEBUG__ = {
        clearAllStorageData,
        resetStoredState,
        hasEncryptedKeystore,
        getStorageInfo: async () => {
          try {
            const allData = await storageAdapter.getAll();
            console.log('All storage data:', allData);
            return allData;
          } catch (error) {
            console.error('Failed to get storage info:', error);
            return null;
          }
        },
        getHDWalletData: async () => {
          try {
            const hdData = await storageAdapter.get(STORAGE_KEYS.hdWalletState);
            console.log('HD Wallet data:', hdData);
            return hdData;
          } catch (error) {
            console.error('Failed to get HD wallet data:', error);
            return null;
          }
        },
        getChromeStorage: async () => {
          if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
            try {
              const result = await chrome.storage.local.get(null as any);
              console.log('Chrome storage data:', result);
              return result;
            } catch (e) {
              console.error('Failed to get Chrome storage data:', e);
              return null;
            }
          }
          return null;
        }
      };
    }
  }, []);

  const toggleTheme = () => setTheme((prev: 'light' | 'dark') => (prev === 'light' ? 'dark' : 'light'));

  const appClassName = useMemo(() => `app app--${platform} theme--${theme}`, [platform, theme]);

  // 메뉴 드롭다운 위치 계산
  useEffect(() => {
    if (showMenu && menuButtonRef.current) {
      const rect = menuButtonRef.current.getBoundingClientRect();
      setMenuDropdownPosition({
        top: rect.bottom + 6,
        right: window.innerWidth - rect.right
      });
    }
  }, [showMenu]);

  // Background auto-lock integration
  useEffect(() => {
    if (platform === 'extension') {
      // Send user activity to background script
      const sendActivity = () => {
        if (unlocked && typeof chrome !== 'undefined' && chrome.runtime) {
          chrome.runtime.sendMessage({ type: 'USER_ACTIVITY' }).catch(() => {
            // Ignore errors if background script is not available
          });
        }
      };

      const events: Array<keyof WindowEventMap> = ['mousemove', 'keydown', 'mousedown', 'touchstart', 'scroll'];
      events.forEach((e) => window.addEventListener(e, sendActivity, { passive: true }));

      // Listen for lock messages from background
      const handleMessage = (message: any) => {
        if (message.type === 'WALLET_LOCKED') {
          lockWallet();
          setUnlocked(false);
          setShowMenu(false); // Close menu dropdown
          setForceCloseDropdowns((prev: boolean) => !prev); // Force close all dropdowns
        }
      };

      if (typeof chrome !== 'undefined' && chrome.runtime) {
        chrome.runtime.onMessage.addListener(handleMessage);
      }

      return () => {
        events.forEach((e) => window.removeEventListener(e, sendActivity));
        if (typeof chrome !== 'undefined' && chrome.runtime) {
          chrome.runtime.onMessage.removeListener(handleMessage);
        }
      };
    } else {
      // Desktop app - use local timer
      const resetTimer = () => {
        if (!unlocked) return;
        if (idleTimerRef.current) window.clearTimeout(idleTimerRef.current);
        idleTimerRef.current = window.setTimeout(() => {
          lockWallet();
          setUnlocked(false);
          setShowMenu(false); // Close menu dropdown
          setForceCloseDropdowns((prev: boolean) => !prev); // Force close all dropdowns
        }, IDLE_LOCK_MS);
      };
      const events: Array<keyof WindowEventMap> = ['mousemove', 'keydown', 'mousedown', 'touchstart', 'scroll'];
      events.forEach((e) => window.addEventListener(e, resetTimer, { passive: true }));
      resetTimer();
      return () => {
        if (idleTimerRef.current) window.clearTimeout(idleTimerRef.current);
        events.forEach((e) => window.removeEventListener(e, resetTimer));
      };
    }
  }, [unlocked, platform]);

  const handleUnlock = async () => {
    setError(undefined);
    try {
      if (step === 'login') {
        const addr = await unlockWithPassword(password);
        setAddress(addr);
        setUnlocked(true);
        // Refresh wallet type and HD state after unlock
        const type = await getWalletType();
        setWalletType(type);
        if (type === 'mnemonic') {
          await hdWalletService.loadState();
          const currentAccount = hdWalletService.getActiveAccount();
          if (currentAccount) {
            setActiveAccount(currentAccount);
            setAddress(currentAccount.address);
          }
        }
      } else if (step === 'setPassword') {
        if (!password || password !== confirm) {
          setError('비밀번호가 일치하지 않습니다.');
          return;
        }
        if (password.length < 8) {
          setError('비밀번호는 최소 8글자 이상이어야 합니다.');
          return;
        }
        resetStoredState();
        // setIsFirstRun(false);
        goToStep('chooseAddr');
        return;
      } else if (step === 'chooseAddr') {
        if (addressMode === 'create') {
          const addr = await createAndStoreWallet(password);
          toastManager.show(`새 지갑 생성됨: ${addr.slice(0,6)}…${addr.slice(-4)}`);
          setAddress(addr);
          setUnlocked(true);
          // New wallets are mnemonic-based by design
          setWalletType('mnemonic');
          await hdWalletService.loadState();
          const currentAccount = hdWalletService.getActiveAccount();
          if (currentAccount) {
            setActiveAccount(currentAccount);
            setAddress(currentAccount.address);
          }
        } else {
          goToStep('connect');
          return;
        }
      } else if (step === 'connect') {
        if (addressMode === 'reuse') {
          let addr: string
          if (importMode === 'mnemonic') {
            if (!mnemonic.trim()) { setError('니모닉을 입력하세요'); return; }
            addr = await importWalletFromMnemonic(mnemonic.trim(), password)
          } else {
            if (!privateKey.trim()) { setError('개인키를 입력하세요'); return; }
            addr = await importWalletFromPrivateKey(privateKey.trim(), password)
          }
          toastManager.show(`기존 주소 등록됨: ${addr.slice(0,6)}…${addr.slice(-4)}`);
          setAddress(addr);
          setUnlocked(true);
          // Refresh wallet type and HD state based on import mode
          const type = await getWalletType();
          setWalletType(type);
          if ((importMode === 'mnemonic') || type === 'mnemonic') {
            await hdWalletService.loadState();
            const currentAccount = hdWalletService.getActiveAccount();
            if (currentAccount) {
              setActiveAccount(currentAccount);
              setAddress(currentAccount.address);
            }
          }
        }
      }
      setPassword('');
      setConfirm('');
      setMnemonic('');
      setPrivateKey('');
      void getProvider();
      
      // Notify background script that wallet is unlocked
      if (platform === 'extension' && typeof chrome !== 'undefined' && chrome.runtime) {
        chrome.runtime.sendMessage({ type: 'WALLET_UNLOCKED' }).catch(() => {
          // Ignore errors if background script is not available
        });
      }
    } catch (e: any) {
      console.error('Unlock error:', e);
      setError(formatUnlockError(e));
    }
  };

  const handleLogoutRequest = () => {
    setShowMenu(false);
    handleLogoutConfirm();
  };

  const handleDataResetRequest = () => {
    setShowMenu(false);
    setShowDataResetConfirm(true);
  };


  const lockWalletAndClearMemory = () => {
    // 메모리상의 지갑 개인정보 초기화
    lockWallet();
    setUnlocked(false);
    setAddress('');
    setPassword('');
    setConfirm('');
    setMnemonic('');
    setPrivateKey('');
    setStep('login');
    setForceCloseDropdowns((prev: boolean) => !prev);
    
    // 백그라운드 스크립트에 잠금 알림
    if (platform === 'extension' && typeof chrome !== 'undefined' && chrome.runtime) {
      chrome.runtime.sendMessage({ type: 'WALLET_LOCKED' }).catch(() => {});
    }
  };

  const handleLogoutConfirm = () => {
    // 지갑 잠금만 수행 (데이터는 유지)
    lockWalletAndClearMemory();
    toastManager.show('지갑이 잠금되었습니다.');
  };

  const handleDataResetConfirm = () => {
    // 모든 저장소 데이터 초기화 (지갑 연결 정보 포함)
    clearAllStorageData();
    
    // 메모리상의 지갑 개인정보 초기화
    lockWalletAndClearMemory();
    
    setShowDataResetConfirm(false);
    toastManager.show('모든 데이터가 초기화되었습니다.');
  };

  const handleLogoutCancel = () => {
    setShowDataResetConfirm(false);
  };

  const handleAddressCopy = async () => {
    if (!address) return;
    
    try {
      await navigator.clipboard.writeText(address);
      toastManager.show('클립보드에 복사되었습니다');
    } catch (error) {
      // Fallback for older browsers or when clipboard API is not available
      const textArea = document.createElement('textarea');
      textArea.value = address;
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      try {
        document.execCommand('copy');
        toastManager.show('클립보드에 복사되었습니다');
      } catch (fallbackError) {
        toastManager.show('복사 실패');
      }
      document.body.removeChild(textArea);
    }
  };

  const handleAddressRequestApprove = (approvedAddress: string) => {
    // 백그라운드 스크립트에 승인 응답 전송
    chrome.runtime.sendMessage({
      type: 'ADDRESS_REQUEST_RESPONSE',
      success: true,
      address: approvedAddress
    });
    
    setShowAddressRequest(false);
    toastManager.show(`${requestOrigin}에 주소가 연결되었습니다`);
  };

  const handleAddressRequestReject = () => {
    // 백그라운드 스크립트에 거절 응답 전송
    chrome.runtime.sendMessage({
      type: 'ADDRESS_REQUEST_RESPONSE',
      success: false,
      error: '사용자가 연결을 거절했습니다'
    });
    
    setShowAddressRequest(false);
  };

  // const handleNetworkChange = (net: SupportedNetwork) => {
  //   setSelectedNet(net);
  //   setSelectedNetwork(net);
  // };

  return (
    <div className={appClassName}>
      <div className="wallet-window" role="dialog" aria-label="Wallet Window">
        <header className="mm-header">
          {unlocked && networksInitialized && (
             <NetworkSelector 
               onNetworkChange={(network: NetworkConfig) => {
                 setCurrentNetwork(network);
               }}
               forceClose={forceCloseDropdowns}
               onDropdownOpen={() => setShowMenu(false)} // Close menu when network dropdown opens
             />
          )}
          {unlocked && activeAccount && walletType === 'mnemonic' ? (
            <AccountSelector 
              onAccountChange={(account: WalletAccount) => {
                setActiveAccount(account);
                setAddress(account.address);
              }}
              onManageAccounts={() => setShowAccountManager(true)}
              forceClose={forceCloseDropdowns}
            />
          ) : (
            <div className="mm-header__account">
              <div className="mm-header__avatar" aria-hidden>🦊</div>
              <div 
                className="mm-header__account-info" 
                onClick={() => {
                  console.log('Account info clicked:', { 
                    unlocked, 
                    activeAccount, 
                    walletType, 
                    hdInitialized: hdWalletService.isInitialized(),
                    showAccountManager: showAccountManager
                  });
                  console.log('Setting showAccountManager to true');
                  setShowAccountManager(true);
                }}
                title={unlocked ? "계정 관리" : ""}
              >
                <div className="mm-header__account-name clickable">
                  {activeAccount ? activeAccount.name : "Account 1"}
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" className="feather feather-chevron-down">
                  <polyline points="6 9 12 15 18 9"></polyline>
                  </svg>
                </div>
                <button 
                  className="mm-header__account-address" 
                  onClick={(e) => {
                    e.stopPropagation();
                    handleAddressCopy();
                  }}
                  disabled={!address}
                  title={address ? `클릭하여 주소 복사: ${address}` : ''}
                >
                  {address ? `${address.slice(0,6)}…${address.slice(-4)}` : '잠김'}
                </button>
              </div>
            </div>
          )}
          {unlocked && (
            <div className="mm-menu">
              <button className="mm-theme-toggle mm-menu__btn" onClick={toggleTheme} type="button" aria-label="Toggle theme" title={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}>
              {theme === 'light' ? 
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" className="feather feather-moon">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
                </svg>  : 
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" className="feather feather-sun">
                  <circle cx="12" cy="12" r="5"></circle>
                  <line x1="12" y1="1" x2="12" y2="3"></line>
                  <line x1="12" y1="21" x2="12" y2="23"></line>
                  <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
                  <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
                  <line x1="1" y1="12" x2="3" y2="12"></line>
                  <line x1="21" y1="12" x2="23" y2="12"></line>
                  <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
                  <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
                </svg>}
              </button>
              <button 
                ref={menuButtonRef}
                className="mm-menu__btn" 
                onClick={() => {
                  setShowMenu((v: boolean) => !v);
                  setForceCloseDropdowns((prev: boolean) => !prev); // Force close dropdowns when menu opens
                }} 
                aria-haspopup="menu" 
                aria-expanded={showMenu} 
                aria-label="열기"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" className="feather feather-menu">
                  <line x1="3" y1="12" x2="21" y2="12"></line>
                  <line x1="3" y1="6" x2="21" y2="6"></line>
                  <line x1="3" y1="18" x2="21" y2="18"></line>
                </svg>
                </button>
              {showMenu && (
                <div 
                  className="menu-dropdown" 
                  role="menu"
                  style={{
                    top: `${menuDropdownPosition.top}px`,
                    right: `${menuDropdownPosition.right}px`
                  }}
                >
                  <button className="mm-menu__item" role="menuitem" onClick={() => { setShowMenu(false); setActiveTab('activity'); }}>설정</button>
                  {walletType === 'mnemonic' && (
                    <button className="mm-menu__item" role="menuitem" onClick={() => { setShowMenu(false); setShowAccountManager(true); }}>계정 관리</button>
                  )}
                  <button className="mm-menu__item" role="menuitem" onClick={handleLogoutRequest}>로그아웃</button>
                  <button className="mm-menu__item warning" role="menuitem" onClick={handleDataResetRequest}>데이터 초기화</button>
                </div>
              )}
              </div>
            )}
          </header>

        <main className="mm-main">
          {/* unlock / create flow */}
          {!unlocked && (
            <div className="modal-overlay visible" role="dialog" aria-modal>
              <div className="auth-modal modal-content">
                {stepHistory.length > 0 && (
                  <button className="back" onClick={goBack}>← 뒤로</button>
                )}
                {step === 'login' && (
                  <>
                    <h3>지갑 잠금 해제</h3>
                    <div className="auth-field">
                      <label htmlFor="wallet-password">비밀번호</label>
                      <input id="wallet-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
                    </div>
                    {error && <div className="error-text" role="alert">{password !== confirm ? "비밀번호가 일치하지 않습니다" : error}</div>}
                    <div className="auth-actions">
                      <button className="btn btn-ghost" onClick={() => goToStep('setPassword')}>새로 등록</button>
                      <button className="btn btn-primary" onClick={handleUnlock}>로그인</button>
                    </div>
                  </>
                )}

                {step === 'setPassword' && (
                  <>
                    <h3>비밀번호 설정</h3>
                    <p>앱 전용 비밀번호를 설정하세요.</p>
                    <div className="auth-field">
                      <label htmlFor="wallet-password">비밀번호</label>
                      <SensitiveInput id="wallet-password" value={password} onChange={setPassword} />
                    </div>
                    <div className="auth-field">
                      <label htmlFor="wallet-password-confirm">비밀번호 확인</label>
                      <SensitiveInput id="wallet-password-confirm" value={confirm} onChange={setConfirm} />
                    </div>
                    {error && <div className="error-text" role="alert">{password !== confirm ? "비밀번호가 일치하지 않습니다" : error}</div>}
                    <div className="auth-actions">
                      <button className="btn btn-ghost" onClick={goBack}>취소</button>
                      <button className="btn btn-primary" onClick={handleUnlock}>다음</button>
                    </div>
                  </>
                )}

                {step === 'chooseAddr' && (
                  <>
                    <h3>지갑 선택</h3>
                    <div className="auth-options">
                      <button className={`btn ${addressMode === 'create' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setAddressMode('create')}>새 지갑 생성</button>
                      <button className={`btn ${addressMode === 'reuse' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setAddressMode('reuse')}>기존 지갑 등록</button>
                    </div>
                    <div className="auth-actions">
                      <button className="btn btn-ghost" onClick={() => setStep('login')}>취소</button>
                      <button className="btn btn-primary" onClick={handleUnlock}>{addressMode === 'create' ? '생성' : '다음'}</button>
                    </div>
                  </>
                )}

                {step === 'connect' && (
                  <>
                    <h3>지갑 연결</h3>
                    <div className="auth-options">
                      <button className={`btn ${importMode === 'mnemonic' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setImportMode('mnemonic')}>니모닉</button>
                      <button className={`btn ${importMode === 'privateKey' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setImportMode('privateKey')}>개인키</button>
                    </div>
                    {importMode === 'mnemonic' ? (
                      <div className="auth-field">
                        <label htmlFor="mnemonic">니모닉</label>
                        <SensitiveTextarea id="mnemonic" value={mnemonic} onChange={setMnemonic} placeholder="word1 word2 ..." rows={5} />
                      </div>
                    ) : (
                      <div className="auth-field">
                        <label htmlFor="private-key">개인키</label>
                        <SensitiveTextarea id="private-key" value={privateKey} onChange={setPrivateKey} placeholder="0x..." rows={4} />
                      </div>
                    )}
                    {error && <div className="error-text" role="alert">{error}</div>}
                    <div className="auth-actions">
                      <button className="btn btn-ghost" onClick={goBack}>뒤로</button>
                      <button className="btn btn-primary" onClick={handleUnlock}>지갑 연결</button>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* 데이터 초기화 확인 모달 */}
          {showDataResetConfirm && (
            <div className="modal-overlay visible">
              <div className="auth-modal modal-content">
                <h3>데이터 초기화</h3>
                <p>정말로 모든 저장 데이터를 초기화하시겠습니까?</p>
                <div className="warning-area">
                  다음 정보가 삭제/초기화됩니다.
                  <ul>
                  <li>등록된 지갑 주소</li>
                  <li>네트워크 설정</li>
                  <li>자격증명</li>
                  <li>자산 정보</li>
                  </ul>
                  이 작업은 되돌릴 수 없습니다.
                </div>
                <div className="auth-actions">
                  <button className="btn btn-ghost" onClick={handleLogoutCancel}>취소</button>
                  <button className="btn btn-danger" onClick={handleDataResetConfirm}>초기화</button>
                </div>
              </div>
            </div>
          )}

          {/* 주소 요청 모달 */}
          {showAddressRequest && (
            <AddressRequestModal
              origin={requestOrigin}
              onApprove={handleAddressRequestApprove}
              onReject={handleAddressRequestReject}
            />
          )}

           <section className="mm-balance" aria-label="Balance">
             <div className="mm-balance__amount">0.0000 {currentNetwork?.symbol || 'ETH'}</div>
             <div className="mm-balance__fiat">≈ $0.00</div>
           </section>

          <section className="mm-actions" aria-label="Quick actions">
            <button className="mm-action" type="button">Buy</button>
            <button className="mm-action" type="button">Send</button>
            <button className="mm-action" type="button">Swap</button>
          </section>

          <nav className="mm-tabs" aria-label="메인 탭">
             <button
               className={`mm-tab flat ${activeTab === 'tokens' ? 'is-active' : ''}`}
               onClick={() => setActiveTab('tokens')}
               type="button">
               자산
             </button>
            <button
              className={`mm-tab flat ${activeTab === 'vc' ? 'is-active' : ''}`}
              onClick={() => setActiveTab('vc')}
              type="button">
              VC
            </button>
            <button
              className={`mm-tab flat ${activeTab === 'nft' ? 'is-active' : ''}`}
              onClick={() => setActiveTab('nft')}
              type="button">
              NFT/SBT
            </button>
            <button
              className={`mm-tab flat ${activeTab === 'activity' ? 'is-active' : ''}`}
              onClick={() => setActiveTab('activity')}
              type="button">
              활동
            </button>
          </nav>

          <section className="mm-content" aria-live="polite">
             {activeTab === 'tokens' && (
              <div className="tab-content-container">
                  <ul className="mm-list" aria-label="자산 목록">
                  <li className="mm-list__item">
                    <div className="mm-token">{currentNetwork?.symbol || 'ETH'}</div>
                    <div className="mm-token__amount">0.0000</div>
                  </li>
                  <li className="mm-list__item is-muted">자산 추가…</li>
                </ul>
              </div>
            )}

            {activeTab === 'vc' && (
              <div className="vc-tab-content">
                <div className="vc-tab-header">
                  <button 
                    className="btn btn-primary btn-small"
                    onClick={() => setShowAddVCModal(true)}
                  >
                    📋 VC 추가
                  </button>
                </div>

                <div className="vc-list-container">
                  <ul className="mm-list" aria-label="VC 목록">
                    {savedVCs.length === 0 ? (
                      <li className="mm-list__item is-muted">저장된 VC가 없습니다</li>
                    ) : (
                      savedVCs.map((vc: VerifiableCredential) => {
                        const displayType = Array.isArray(vc.type)
                          ? (vc.type.find((t: string) => t !== 'VerifiableCredential') || 'VerifiableCredential')
                          : (typeof vc.type === 'string' ? vc.type : 'VerifiableCredential');
                        const subjectName = (vc.credentialSubject as any)?.name || (vc.credentialSubject as any)?.studentName || '';
                        const issuerName = (vc.issuer as any)?.name || (vc.issuer as any)?.id || '';
                        return (
                        <li key={vc.id} className="mm-list__item">
                          <div className="mm-list__item-content" onClick={() => setSelectedVC(vc)}>
                            <div className="mm-list__item-primary">
                              <div className="vc-item-title">
                                {displayType}
                              </div>
                              <div className="vc-item-subtitle">
                                {[subjectName, issuerName].filter(Boolean).join(' · ')}
                              </div>
                            </div>
                            <div className="mm-list__item-secondary">
                              <div className="vc-item-date">
                                {vc.issuanceDate ? new Date(vc.issuanceDate).toLocaleDateString() : ''}
                              </div>
                            </div>
                          </div>
                          <div className="mm-list__item-actions">
                            <button 
                              className="mm-list__item-action-btn delete-btn"
                              onClick={(e) => {
                                e.stopPropagation();
                                const vcName = vc.credentialSubject?.name || vc.credentialSubject?.studentName || 'VC';
                                handleDeleteConfirm(vc.id || '', vcName);
                              }}
                              title="VC 삭제"
                            >
                              🗑️
                            </button>
                          </div>
                        </li>
                        );
                      })
                    )}
                  </ul>
                </div>
              </div>
            )}

            {activeTab === 'nft' && (
              <div className="tab-content-container">
                <ul className="mm-list" aria-label="NFT/SBT 목록">
                  {savedSBTs.length === 0 ? (
                    <li className="mm-list__item is-muted">발급된 SBT 또는 NFT가 없습니다</li>
                  ) : (
                    savedSBTs.map((sbt: any) => {
                      const sbtImage = sbt.image || sbt.metadata?.image;
                      return (
                        <li key={sbt.id} className="mm-list__item sbt-item">
                          <div className="mm-list__item-content" onClick={() => setSelectedSBT(sbt)}>
                            {sbtImage && (
                              <div className="sbt-image-container">
                                <img src={sbtImage} alt={sbt.name || 'SBT'} className="sbt-thumbnail" />
                              </div>
                            )}
                            <div className="mm-list__item-primary">
                              <div className="vc-item-title">{sbt.name || sbt.tokenName || 'SBT'}</div>
                              <div className="vc-item-subtitle">
                                {sbt.description || ''}
                              </div>
                            </div>
                            <div className="mm-list__item-secondary">
                              <button 
                                className="mm-list__item-action-btn delete-btn"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const sbtName = sbt.name || sbt.tokenName || 'SBT';
                                  handleDeleteConfirm(sbt.id, sbtName);
                                }}
                                title="SBT 삭제"
                              >
                                🗑️
                              </button>
                            </div>
                          </div>
                        </li>
                      );
                    })
                  )}
                </ul>
              </div>
            )}

            {activeTab === 'activity' && (
              <div className="tab-content-container">
                <ul className="mm-list" aria-label="활동 목록">
                  <li className="mm-list__item is-muted">최근 활동 없음</li>
                </ul>
              </div>
            )}
          </section>

          {extensionActions && (
            <section className="mm-extension-actions" aria-label="Extension only actions">
              {extensionActions}
            </section>
          )}
        </main>
        {toast && (
          <div className={`toast ${toastVisible ? 'toast--visible' : 'toast--hidden'}`} role="status"><p>{toast}</p></div>
        )}
        
        {/* VC 상세 모달 */}
        <VCDataModal 
          vc={selectedVC} 
          onClose={() => setSelectedVC(null)} 
        />
        
        {/* SBT 상세 모달 */}
        {selectedSBT && (
          <DataModal
            isOpen={!!selectedSBT}
            title={<span>{selectedSBT.name || selectedSBT.tokenName || 'SBT'}</span>}
            onClose={() => setSelectedSBT(null)}
          >
            {(selectedSBT.image || selectedSBT.metadata?.image) && (
              <div style={{marginBottom: '16px', textAlign: 'center'}}>
                <img 
                  src={selectedSBT.image || selectedSBT.metadata?.image} 
                  alt={selectedSBT.name || 'SBT'} 
                  style={{
                    maxWidth: '100%', 
                    maxHeight: '300px', 
                    borderRadius: '8px',
                    objectFit: 'contain'
                  }}
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
              </div>
            )}

            <div className="data-field">
              <label>토큰 ID</label>
              <div className="data-field__value">{selectedSBT.tokenId || 'N/A'}</div>
            </div>

            {selectedSBT.description && (
              <div className="data-field">
                <label>설명</label>
                <div className="data-field__value">{selectedSBT.description}</div>
              </div>
            )}

            {selectedSBT.contract && (
              <div className="data-field">
                <label>컨트랙트 주소</label>
                <div className="data-field__value" style={{fontSize: '12px', wordBreak: 'break-all'}}>
                  {selectedSBT.contract}
                </div>
              </div>
            )}

            {selectedSBT.symbol && (
              <div className="data-field">
                <label>심볼</label>
                <div className="data-field__value">{selectedSBT.symbol}</div>
              </div>
            )}

            {selectedSBT.issuedAt && (
              <div className="data-field">
                <label>발급 일시</label>
                <div className="data-field__value">
                  {new Date(selectedSBT.issuedAt).toLocaleString('ko-KR')}
                </div>
              </div>
            )}

            {selectedSBT.metadata?.attributes && Array.isArray(selectedSBT.metadata.attributes) && (
              <div className="data-field">
                <label>속성</label>
                <div style={{marginTop: '8px'}}>
                  {selectedSBT.metadata.attributes.map((attr: any, idx: number) => (
                    <div 
                      key={idx} 
                      style={{
                        display: 'flex', 
                        justifyContent: 'space-between', 
                        padding: '8px 12px',
                        background: 'var(--panel-bg)',
                        borderRadius: '6px',
                        marginBottom: '6px'
                      }}
                    >
                      <span style={{color: 'var(--text-muted)', fontSize: '13px'}}>
                        {attr.trait_type || attr.name}
                      </span>
                      <span style={{fontWeight: 500, fontSize: '13px'}}>
                        {attr.value}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="data-json" style={{marginTop: '16px'}}>
              <label>전체 데이터</label>
              <div className="json-field">
                <pre>{JSON.stringify(selectedSBT, null, 2)}</pre>
              </div>
            </div>
          </DataModal>
        )}
        
        {/* VC 발급 승인 모달 */}
        {vcIssuanceRequest && (
          <VCIssuanceModal
            vc={vcIssuanceRequest.vc}
            student={vcIssuanceRequest.student}
            origin={vcIssuanceRequest.origin}
            isDuplicate={vcIssuanceRequest.isDuplicate}
            duplicateId={vcIssuanceRequest.duplicateId}
            onApprove={handleVCIssuanceApprove}
            onReject={handleVCIssuanceReject}
          />
        )}
        
        {/* VC 저장 승인 모달 */}
        {vcSaveRequest && (
          <VCIssuanceModal
            vc={vcSaveRequest.vc}
            student={null}
            origin={vcSaveRequest.origin}
            isDuplicate={vcSaveRequest.isDuplicate}
            duplicateId={vcSaveRequest.duplicateId}
            onApprove={handleVCSaveApprove}
            onReject={handleVCSaveReject}
          />
        )}

        {/* Proof 제출 확인 및 진행 모달 */}
        {proofRequest && (
          <div className="modal-overlay visible">
            <div className="auth-modal modal-content">
              {proofRequest.status === 'awaiting-address' ? (
                <>
                  <h3>지갑 연결 및 Proof 제출</h3>
                  <p>지갑 주소를 연결하고 Proof를 제출하시겠습니까? 약 20초 소요됩니다.</p>
                  <div style={{fontSize: '13px', color: 'var(--text-muted)', marginTop: '12px', textAlign: 'center'}}>
                    {proofRequest.region} · {proofRequest.vcType.toUpperCase()}
                  </div>
                  <div className="auth-actions">
                    <button className="btn btn-ghost" onClick={handleProofReject}>취소</button>
                    <button className="btn btn-primary" onClick={handleProofWithAddressApprove}>확인</button>
                  </div>
                </>
              ) : proofRequest.status === 'awaiting-confirm' ? (
                <>
                  <h3>Proof 제출 확인</h3>
                  <p>선택한 VC로부터 Proof를 제출하시겠습니까? 약 20초 소요됩니다.</p>
                  <div className="auth-actions">
                    <button className="btn btn-ghost" onClick={handleProofReject}>취소</button>
                    <button className="btn btn-primary" onClick={handleProofApprove}>확인</button>
                  </div>
                </>
              ) : (
                <>
                  <h3>
                    {proofRequest.status === 'generating-proof' ? 'Proof 생성 중입니다' : 
                     proofRequest.status === 'submitting-tx' ? 'Proof를 제출하는 중입니다' : 
                     proofRequest.status === 'completed' ? '완료!' :
                     proofRequest.status === 'failed' ? '실패' : '처리 중'}
                  </h3>
                  <div style={{margin: '20px 0'}}>
                    <div style={{fontSize: '13px', color: 'var(--text-muted)', marginBottom: '12px', textAlign: 'center'}}>
                      {proofRequest.region} · {proofRequest.vcType.toUpperCase()}
                    </div>
                    {(proofRequest.status === 'generating-proof' || proofRequest.status === 'submitting-tx') && (
                      <div style={{height: 8, background: 'var(--panel-border)', borderRadius: 8, overflow: 'hidden'}}>
                        <div style={{
                          height: '100%',
                          width: `${proofRequest.status === 'generating-proof' ? 50 : 90}%`,
                          background: 'linear-gradient(90deg, #6366f1, #34d399)',
                          transition: 'width 0.4s ease'
                        }} />
                      </div>
                    )}
                    {proofRequest.status === 'submitting-tx' && proofRequest.contractInfo ? (
                      <div style={{marginTop: '12px', padding: '12px', background: 'var(--panel-bg)', borderRadius: '8px', border: '1px solid var(--panel-border)'}}>
                        <div style={{fontSize: '11px', color: 'var(--text-muted)', marginBottom: '8px', fontWeight: '600'}}>트랜잭션 정보</div>
                        <div style={{fontSize: '12px', color: 'var(--text)', marginBottom: '6px'}}>
                          <span style={{color: 'var(--text-muted)'}}>컨트랙트:</span>{' '}
                          <span style={{fontFamily: 'monospace', wordBreak: 'break-all'}}>{proofRequest.contractInfo.address}</span>
                        </div>
                        <div style={{fontSize: '12px', color: 'var(--text)', marginBottom: '6px'}}>
                          <span style={{color: 'var(--text-muted)'}}>함수:</span>{' '}
                          <span style={{fontFamily: 'monospace'}}>{proofRequest.contractInfo.functionName}</span>
                        </div>
                        {proofRequest.contractInfo.description && (
                          <div style={{fontSize: '11px', color: 'var(--text-muted)', marginTop: '8px', lineHeight: '1.4'}}>
                            {proofRequest.contractInfo.description}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div style={{fontSize: '12px', color: 'var(--text-muted)', marginTop: '8px', textAlign: 'center'}}>
                        {proofRequest.status === 'generating-proof' ? '약 10초 소요...' : 
                         proofRequest.status === 'submitting-tx' ? '트랜잭션 전송 중... 블록 확정 대기...' : 
                         proofRequest.status === 'completed' ? '완료!' : 
                         proofRequest.status === 'failed' ? '오류가 발생했습니다' : '처리 중...'}
                      </div>
                    )}
                  </div>
                  <div className="auth-actions">
                    {(proofRequest.status === 'completed' || proofRequest.status === 'failed') ? (
                      <button 
                        className="btn btn-primary" 
                        onClick={() => {
                          setProofRequest(null);
                          chrome.storage.local.remove(['pendingProofRequest']);
                        }}
                        style={{width: '100%'}}
                      >
                        확인
                      </button>
                    ) : (
                      <button 
                        className="btn btn-ghost" 
                        onClick={handleProofReject}
                        style={{width: '100%'}}
                      >
                        취소
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        )}
        
        {/* 수동 VC 추가 모달 */}
        {showAddVCModal && (
          <AddVCModal
            onClose={() => setShowAddVCModal(false)}
            onAddVC={handleAddVC}
          />
        )}
        
        {/* VC 삭제 확인 모달 */}
        <DeleteConfirmModal
          isOpen={deleteConfirmModal.isOpen}
          vcName={deleteConfirmModal.vcName}
          onConfirm={handleDeleteConfirmApprove}
          onCancel={handleDeleteConfirmCancel}
        />
        
        {/* 주소 요청 모달 */}
        {addressRequest && (
          <AddressRequestModal
            origin={addressRequest.origin}
            onApprove={async () => {
              try {
                await chrome.runtime.sendMessage({
                  type: 'ADDRESS_REQUEST_RESPONSE',
                  success: true,
                  address: getAddress()
                });
                setAddressRequest(null);
              } catch (error) {
                console.error('주소 요청 승인 실패:', error);
              }
            }}
            onReject={async () => {
              try {
                await chrome.runtime.sendMessage({
                  type: 'ADDRESS_REQUEST_RESPONSE',
                  success: false,
                  error: '사용자가 거절했습니다'
                });
                setAddressRequest(null);
              } catch (error) {
                console.error('주소 요청 거절 실패:', error);
              }
            }}
          />
        )}

        {/* 계정 관리 모달 */}
        <AccountManager
          isOpen={showAccountManager}
          onClose={() => setShowAccountManager(false)}
          onAccountChange={(account: WalletAccount) => {
            setActiveAccount(account);
            setAddress(account.address);
          }}
          walletType={walletType}
        />
      </div>
    </div>
  );
};

export default AppContent;