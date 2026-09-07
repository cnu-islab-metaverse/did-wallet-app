// [작업] CDP 를 연 채로 개발 서버를 띄운다. 시연 자동화(demo/)가 렌더러에 붙기 위한 것.
//        cross-env 를 들이지 않으려고 스크립트로 환경변수를 넣는다.
// [결과] yarn dev:debug → 평소와 같은 앱 + 127.0.0.1:9222 CDP
import { spawn } from 'node:child_process'

const port = process.env.WALLET_DEBUG_PORT || '9222'
console.log(`[dev:debug] CDP ${port} 로 개발 서버를 시작합니다.`)

const child = spawn('npx', ['vite'], {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, WALLET_DEBUG_PORT: port },
})
child.on('exit', (code) => process.exit(code ?? 0))
