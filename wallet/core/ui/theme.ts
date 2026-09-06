// [작업] 앱 테마(라이트/다크) 관리 — 시스템 설정 추종을 기본으로, 사용자가 앱 내에서 전환하면
//        그 선택을 localStorage 에 저장해 우선 적용. 문서 루트에 .theme--dark 를 토글해 토큰을 전환.
// [결과] initTheme() 1회 호출 + toggleTheme()/setTheme()/subscribe() 로 전역 테마 제어.

export type Theme = 'light' | 'dark'
const KEY = 'wallet-theme'
const listeners = new Set<(t: Theme) => void>()

export function systemTheme(): Theme {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}
export function storedTheme(): Theme | null {
  try { const v = localStorage.getItem(KEY); return v === 'dark' || v === 'light' ? v : null } catch { return null }
}
export function currentTheme(): Theme {
  return storedTheme() ?? systemTheme()
}
export function applyTheme(t: Theme): void {
  if (typeof document !== 'undefined') document.documentElement.classList.toggle('theme--dark', t === 'dark')
}
export function setTheme(t: Theme): void {
  try { localStorage.setItem(KEY, t) } catch { /* ignore */ }
  applyTheme(t)
  listeners.forEach((l) => l(t))
}
export function toggleTheme(): void {
  setTheme(currentTheme() === 'dark' ? 'light' : 'dark')
}
export function subscribe(l: (t: Theme) => void): () => void {
  listeners.add(l)
  return () => { listeners.delete(l) }
}
// 앱 시작 시 1회: 현재 테마 적용 + (사용자 선택이 없을 때만) 시스템 변경 추종.
export function initTheme(): void {
  applyTheme(currentTheme())
  const mq = typeof window !== 'undefined' ? window.matchMedia?.('(prefers-color-scheme: dark)') : undefined
  mq?.addEventListener?.('change', () => { if (!storedTheme()) setTheme(systemTheme()) })
}
