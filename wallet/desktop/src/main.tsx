import React from 'react'
import ReactDOM from 'react-dom/client'
import { App, WalletShell } from '../../core'
import { Preview } from '../../core/ui/preview/Preview'
import TitleBar from './components/TitleBar'
import { initWalletRpc } from './walletRpc'
import { initTheme, currentTheme, setTheme as setThemePref, subscribe, type Theme } from '../../core/ui/theme'
import './index.css'

// 화면 라우팅(해시). 기본값이 실 셸이며, 나머지는 개발·참고용 진입점이다.
//   (없음) → WalletShell(실 셸)  ·  #ui-preview → 프리미티브 갤러리  ·  #legacy → 1차 개발 App(참고 전용)
const VIEW = typeof window !== 'undefined' ? window.location.hash.replace('#', '') : ''

// 확장(네이티브 호스트)에서 온 지갑 RPC 를 이 렌더러에서 처리(키·저장·승인은 데스크톱 전용).
initWalletRpc()

const DesktopApp = () => {
  // 테마: 저장된 사용자 선택 > 시스템 설정. theme 모듈이 문서 루트에 .theme--dark 적용/전환.
  const [theme, setTheme] = React.useState<Theme>(() => currentTheme());

  React.useEffect(() => {
    initTheme();
    setTheme(currentTheme());
    return subscribe(setTheme); // 토글 버튼 등에서 바뀌면 TitleBar 도 동기화
  }, []);

  const handleReload = async () => {
    if (typeof window !== 'undefined' && window.ipcRenderer?.reloadApp) {
      try {
        await window.ipcRenderer.reloadApp();
      } catch (error) {
        console.error('Failed to reload app:', error);
      }
    }
  };

  // 기존 App 의 자체 토글에서 오는 변경도 theme 모듈로 반영(저장+동기화).
  const handleThemeChange = (newTheme: 'light' | 'dark') => {
    setThemePref(newTheme);
  };

  return (
    // 고정 타이틀바(32px) 높이만큼 콘텐츠를 내려 겹침(위 잘림) 방지. box-sizing:border-box 로 패딩 포함.
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', paddingTop: 32, boxSizing: 'border-box', overflow: 'hidden' }}>
      <TitleBar onReload={handleReload} theme={theme} />
      <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
        {VIEW === 'ui-preview' ? <Preview />
          : VIEW === 'legacy' ? <App platform="desktop" onThemeChange={handleThemeChange} />
          : <WalletShell />}
      </div>
    </div>
  );
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <DesktopApp />
  </React.StrictMode>,
)

// Use contextBridge
window.ipcRenderer.on('main-process-message', (_event, message) => {
  console.log(message)
})
