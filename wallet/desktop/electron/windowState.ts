// [작업] 창 크기·위치·최대화 상태를 저장/복원. Electron 은 기본으로 창 상태를 기억하지 않으므로
//        userData/window-state.json 에 직접 저장하고 다음 실행 때 복원한다.
// [결과] loadWindowState() 로 초기 bounds, manageWindowState(win) 으로 변경 시 저장.
import { app, BrowserWindow, screen } from 'electron'
import fs from 'node:fs'
import path from 'node:path'

export interface WindowState {
  x?: number; y?: number; width: number; height: number; isMaximized?: boolean
}

const DEFAULT: WindowState = { width: 1080, height: 740 }
const file = () => path.join(app.getPath('userData'), 'window-state.json')

// 저장된 x/y 가 현재 연결된 디스플레이 안에 보이는지 확인(모니터 변경 대비).
function isVisibleOnDisplay(s: WindowState): boolean {
  if (s.x === undefined || s.y === undefined) return true
  return screen.getAllDisplays().some((d) => {
    const b = d.bounds
    return s.x! >= b.x - 50 && s.y! >= b.y - 50 &&
      s.x! < b.x + b.width - 50 && s.y! < b.y + b.height - 50
  })
}

export function loadWindowState(): WindowState {
  try {
    const s = JSON.parse(fs.readFileSync(file(), 'utf8')) as WindowState
    if (typeof s.width === 'number' && typeof s.height === 'number') {
      if (!isVisibleOnDisplay(s)) { delete s.x; delete s.y } // 화면 밖이면 중앙 배치
      return s
    }
  } catch { /* 없음/손상 → 기본값 */ }
  return { ...DEFAULT }
}

export function manageWindowState(win: BrowserWindow): void {
  const save = () => {
    if (win.isDestroyed()) return
    try {
      const maximized = win.isMaximized()
      // 최대화 상태면 복원용 일반 bounds(getNormalBounds)를 저장
      const b = maximized ? win.getNormalBounds() : win.getBounds()
      const state: WindowState = { x: b.x, y: b.y, width: b.width, height: b.height, isMaximized: maximized }
      fs.writeFileSync(file(), JSON.stringify(state))
    } catch { /* 저장 실패 무시 */ }
  }
  let t: NodeJS.Timeout | null = null
  const debounced = () => { if (t) clearTimeout(t); t = setTimeout(save, 400) }
  win.on('resize', debounced)
  win.on('move', debounced)
  win.on('close', save)
}
