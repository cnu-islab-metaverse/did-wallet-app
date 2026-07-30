import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from '../../src'
import TitleBar from './components/TitleBar'
import { initWalletRpc } from './walletRpc'
import './index.css'

// 확장(네이티브 호스트)에서 온 지갑 RPC 를 이 렌더러에서 처리(키·저장·승인은 데스크톱 전용).
initWalletRpc()

const DesktopApp = () => {
  const [theme, setTheme] = React.useState<'light' | 'dark'>('light');

  const handleReload = async () => {
    if (typeof window !== 'undefined' && window.ipcRenderer?.reloadApp) {
      try {
        await window.ipcRenderer.reloadApp();
      } catch (error) {
        console.error('Failed to reload app:', error);
      }
    }
  };

  const handleThemeChange = (newTheme: 'light' | 'dark') => {
    setTheme(newTheme);
  };

  return (
    <>
      <TitleBar onReload={handleReload} theme={theme} />
      <App platform="desktop" onThemeChange={handleThemeChange} />
    </>
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
