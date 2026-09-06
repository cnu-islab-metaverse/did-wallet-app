import React from 'react';
import './TitleBar.css';

interface TitleBarProps {
  onReload: () => void;
  theme: 'light' | 'dark';
}

const TitleBar: React.FC<TitleBarProps> = ({ onReload, theme }) => {
  return (
    <div className={`titlebar titlebar--${theme}`}>
      <div className="titlebar-brand" aria-label="DID&SBT Wallet">
        {/* 창 내 브랜드 아이콘 — 작업표시줄 아이콘(icon.png)과 동일 디자인 */}
        <svg width="16" height="16" viewBox="0 0 256 256" aria-hidden>
          <defs><linearGradient id="tb-g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#6366f1" /><stop offset="1" stopColor="#8b5cf6" /></linearGradient></defs>
          <rect x="16" y="16" width="224" height="224" rx="52" fill="url(#tb-g)" />
          <path d="M60 86 L92 172 L128 112 L164 172 L196 86" fill="none" stroke="#fff" strokeWidth="18" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="titlebar-brand__name">DID&amp;SBT Wallet</span>
      </div>
      <div className="titlebar-controls titlebar-controls--left">
        <button
          className="titlebar-btn titlebar-btn--reload"
          onClick={onReload}
          title="Reload app"
          aria-label="Reload app"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" className="feather feather-refresh-ccw">
            <polyline points="1 4 1 10 7 10"></polyline>
            <polyline points="23 20 23 14 17 14"></polyline>
            <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"></path>
          </svg>
        </button>
      </div>
      <div className="titlebar-drag-region"></div>
      <div className="titlebar-controls titlebar-controls--right">
        <button
          className="titlebar-btn"
          onClick={() => window.ipcRenderer.windowMinimize()}
          title="Minimize"
          aria-label="Minimize"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" className="feather feather-minus">
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
        </button>
        <button
          className="titlebar-btn"
          onClick={() => window.ipcRenderer.windowToggleMaximize()}
          title="Maximize"
          aria-label="Maximize"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" className="feather feather-maximize">
            <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path>
          </svg>
        </button>
        <button
          className="titlebar-btn titlebar-btn--close"
          onClick={() => window.ipcRenderer.windowClose()}
          title="Close"
          aria-label="Close"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" className="feather feather-x">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
    </div>
  );
};

export default TitleBar;
