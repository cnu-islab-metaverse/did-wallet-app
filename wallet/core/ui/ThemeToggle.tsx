import React, { useEffect, useState } from 'react'
import { currentTheme, toggleTheme, subscribe, type Theme } from './theme'

// 앱 내 라이트/다크 전환 버튼(작은 아이콘). 아카이브 지갑의 토글을 대체.
export const ThemeToggle: React.FC<{ size?: number }> = ({ size = 34 }) => {
  const [t, setT] = useState<Theme>(() => currentTheme())
  useEffect(() => subscribe(setT), [])
  const dark = t === 'dark'
  return (
    <button
      onClick={toggleTheme}
      title={dark ? '라이트 모드로' : '다크 모드로'}
      aria-label="테마 전환"
      style={{
        width: size, height: size, display: 'grid', placeItems: 'center', cursor: 'pointer',
        border: '1px solid var(--color-border)', borderRadius: 6, background: 'var(--panel-bg)', color: 'var(--color-muted)',
      }}
    >
      {dark ? (
        // sun
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4" />
        </svg>
      ) : (
        // moon
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
        </svg>
      )}
    </button>
  )
}
