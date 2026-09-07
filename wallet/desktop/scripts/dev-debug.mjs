// [작업] CDP 를 연 채로 개발 서버를 띄운다. 시연 자동화(demo/)가 렌더러에 붙기 위한 것.
//        cross-env 를 들이지 않으려고 스크립트로 환경변수를 넣는다.
// [결과] yarn dev:debug → 평소와 같은 앱 + 127.0.0.1:9222 CDP
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import path from 'node:path'

// npx 는 yarn 워크스페이스에서 node_modules 를 겹쳐 찾는다. 직접 해석해서 노드로 실행한다.
// bin/vite.js 는 exports 에 없으므로 package.json 위치에서 찾는다.
const require = createRequire(import.meta.url)
const vite = path.join(path.dirname(require.resolve('vite/package.json')), 'bin', 'vite.js')

const port = process.env.WALLET_DEBUG_PORT || '9222'
console.log(`[dev:debug] CDP ${port} · vite ${vite}`)

const child = spawn(process.execPath, [vite], {
  stdio: 'inherit',
  env: { ...process.env, WALLET_DEBUG_PORT: port },
})
child.on('exit', (code) => process.exit(code ?? 0))
