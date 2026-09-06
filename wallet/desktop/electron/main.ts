import { app, BrowserWindow, ipcMain } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { startWalletBridge } from './walletBridge'
import { loadWindowState, manageWindowState } from './windowState'
import { generateProof, circuitReady, type Scenario } from './proofService'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// The built directory structure
//
// ├─┬─┬ dist
// │ │ └── index.html
// │ │
// │ ├─┬ dist-electron
// │ │ ├── main.js
// │ │ └── preload.mjs
// │
process.env.APP_ROOT = path.join(__dirname, '..')

// 🚧 Use ['ENV_NAME'] avoid vite:define plugin - Vite@2.x
export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, 'public') : RENDERER_DIST

let win: BrowserWindow | null

function createWindow() {
  // 저장된 창 상태(크기·위치) 복원. 없으면 데스크톱에 맞는 가로형 기본값.
  const ws = loadWindowState()
  win = new BrowserWindow({
    x: ws.x,
    y: ws.y,
    width: ws.width,
    height: ws.height,
    minWidth: 820,
    minHeight: 560,
    title: 'DID&SBT Wallet',
    frame: false, // remove default frame to create custom titlebar
    titleBarStyle: 'hidden', // hide default titlebar and overlay buttons; we provide custom ones
    autoHideMenuBar: true, // hide menu bar like File/Edit/etc
    icon: path.join(process.env.VITE_PUBLIC, 'icon.png'), // 창/작업표시줄 공통 브랜드 아이콘
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
    },
  })
  if (ws.isMaximized) win.maximize()
  manageWindowState(win) // 크기·위치 변경 시 저장 → 다음 실행 때 복원

  // Test active push message to Renderer-process.
  win.webContents.on('did-finish-load', () => {
    win?.webContents.send('main-process-message', (new Date).toLocaleString())
  })

  // 개발용 뷰 선택: WALLET_VIEW=ui-preview|ui-shell → 해당 뷰로 바로 진입(재구축 검토용).
  const viewHash = process.env.WALLET_VIEW ? `#${process.env.WALLET_VIEW}` : ''
  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL + viewHash)
  } else {
    win.loadFile(path.join(RENDERER_DIST, 'index.html'), viewHash ? { hash: process.env.WALLET_VIEW } : undefined)
  }
}

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
    win = null
  }
})

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

app.whenReady().then(() => {
  createWindow()
  // 확장(네이티브 호스트)이 접속할 로컬 지갑 브리지 시작. 요청은 렌더러 지갑 코어로 위임.
  startWalletBridge(() => win)
})

// ZK 증명 — 렌더러는 VC 만 넘기고, 무거운 증명 생성은 여기(메인)에서 한다.
ipcMain.handle('zk:ready', (_e, scenario: Scenario) => circuitReady(scenario))
ipcMain.handle('zk:prove', async (_e, scenario: Scenario, vc: unknown) => {
  const t0 = Date.now()
  const res = await generateProof(scenario, vc)
  console.log("[zk] " + scenario + " 증명 생성 " + (Date.now() - t0) + "ms · bound=" + res.boundWallet)
  return res
})

// IPC handlers
ipcMain.handle('reload-app', () => {
  if (win) {
    // Perform a hard reload ignoring cache so changes are reflected immediately
    console.log('Reloading app...')
    win.webContents.reloadIgnoringCache()
  }
})

ipcMain.handle('window:minimize', () => {
  if (win) win.minimize()
})

ipcMain.handle('window:toggle-maximize', () => {
  if (!win) return
  if (win.isMaximized()) {
    win.unmaximize()
  } else {
    win.maximize()
  }
})

ipcMain.handle('window:is-maximized', () => {
  return win ? win.isMaximized() : false
})

ipcMain.handle('window:close', () => {
  if (win) win.close()
})
