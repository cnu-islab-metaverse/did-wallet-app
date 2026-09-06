// [작업] 지정 TCP 포트를 LISTENING 중인 프로세스를 종료 — 이전 dev 서버(orphan) 정리용.
//        대상이 없으면 조용히 통과. 각 서비스의 predev 훅에서 자기 포트에 대해 실행.
// 사용: node scripts/kill-port.mjs <port> [--dry]
import { execSync } from 'node:child_process'

const port = String(process.argv[2] || '').trim()
const dry = process.argv.includes('--dry')
if (!port) process.exit(0)

function pidsOnPort(p) {
  const set = new Set()
  try {
    if (process.platform === 'win32') {
      const out = execSync('netstat -ano -p tcp', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
      for (const line of out.split(/\r?\n/)) {
        const parts = line.trim().split(/\s+/)
        if (parts.length < 5) continue
        const [proto, local, , state, pid] = parts
        if (!/^TCP$/i.test(proto)) continue
        if (String(state).toUpperCase() !== 'LISTENING') continue
        if (!local.endsWith(':' + p)) continue
        if (pid && pid !== '0') set.add(pid)
      }
    } else {
      const out = execSync(`lsof -ti tcp:${p} -sTCP:LISTEN`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
      out.split(/\s+/).filter(Boolean).forEach((pid) => set.add(pid))
    }
  } catch { /* 점유 프로세스 없음 */ }
  return [...set]
}

const pids = pidsOnPort(port)
if (pids.length === 0) { console.log(`[kill-port] :${port} 비어있음`); process.exit(0) }
for (const pid of pids) {
  if (dry) { console.log(`[kill-port] (dry) :${port} → PID ${pid}`); continue }
  try {
    if (process.platform === 'win32') execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore' })
    else execSync(`kill -9 ${pid}`, { stdio: 'ignore' })
    console.log(`[kill-port] :${port} 정리 → PID ${pid} 종료`)
  } catch { console.log(`[kill-port] :${port} PID ${pid} 종료 실패(무시)`) }
}
process.exit(0)
