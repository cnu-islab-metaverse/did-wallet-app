// [작업] 데스크톱 지갑의 로컬 브리지 — 네이티브 호스트(크롬 확장)가 접속하는 사용자 로컬 파이프
//        서버. 요청을 렌더러(공유 src/ 지갑 코어)로 위임하고 응답을 되돌린다. 키·승인은 데스크톱에만.
// [결과] startWalletBridge(getWindow) 로 파이프 리슨. 확장 → 호스트 → 파이프 → 렌더러 → 응답.
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'
import { ipcMain, BrowserWindow } from 'electron'

const PIPE = process.platform === 'win32'
  ? '\\\\.\\pipe\\cnu-didwallet'
  : path.join(os.tmpdir(), 'cnu-didwallet.sock')

// 프레이밍(4바이트 LE 길이 + JSON) — native-host/framing.mjs 와 동일 규격.
function encode(obj: any): Buffer {
  const json = Buffer.from(JSON.stringify(obj), 'utf8')
  const len = Buffer.alloc(4)
  len.writeUInt32LE(json.length, 0)
  return Buffer.concat([len, json])
}
function createDecoder(onMessage: (m: any) => void) {
  let buf = Buffer.alloc(0)
  return (chunk: Buffer) => {
    buf = Buffer.concat([buf, chunk])
    while (buf.length >= 4) {
      const len = buf.readUInt32LE(0)
      if (buf.length < 4 + len) break
      const json = buf.subarray(4, 4 + len).toString('utf8')
      buf = buf.subarray(4 + len)
      try { onMessage(JSON.parse(json)) } catch { /* ignore */ }
    }
  }
}

export function startWalletBridge(getWindow: () => BrowserWindow | null): void {
  // 렌더러 RPC 상관관계(id 로 요청/응답 매칭)
  const pending = new Map<number, { resolve: (v: any) => void; reject: (e: any) => void }>()
  let seq = 0

  ipcMain.on('wallet-rpc-response', (_e, msg: any) => {
    const p = pending.get(msg?.id)
    if (!p) return
    pending.delete(msg.id)
    if (msg.error) p.reject(new Error(msg.error))
    else p.resolve(msg.result)
  })

  function callRenderer(method: string, params: any): Promise<any> {
    return new Promise((resolve, reject) => {
      const w = getWindow()
      if (!w) return reject(new Error('no-window'))
      const id = ++seq
      pending.set(id, { resolve, reject })
      w.webContents.send('wallet-rpc-request', { id, method, params })
      setTimeout(() => {
        if (pending.has(id)) { pending.delete(id); reject(new Error('rpc-timeout')) }
      }, 120000)
    })
  }

  const server = net.createServer((sock) => {
    const write = (o: any) => { try { sock.write(encode(o)) } catch { /* closed */ } }
    const decode = createDecoder(async (req: any) => {
      const { id, method, params } = req || {}
      try {
        const result = await callRenderer(method, params)
        write({ id, result })
      } catch (e: any) {
        write({ id, error: String(e?.message || e) })
      }
    })
    sock.on('data', decode)
    sock.on('error', () => { /* ignore */ })
  })

  if (process.platform !== 'win32') { try { fs.unlinkSync(PIPE) } catch { /* none */ } }
  server.on('error', (e) => console.error('[walletBridge] server error', e))
  server.listen(PIPE, () => console.log('[walletBridge] listening on', PIPE))
}
