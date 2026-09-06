// [작업] 회로 자산을 데스크톱 앱으로 동기화한다.
//        witness 빌더는 circuits/witness.mjs 를 "복사"한다 — 손으로 포팅하면 SMT 키·학교코드·시도코드가
//        회로와 어긋나는 순간 증명이 조용히 검증 실패하기 때문이다(circuits/README 경고).
//        wasm/zkey 는 36MB 급이라 복사하지 않고 경로만 확인한다(런타임에 원본을 읽는다).
// [결과] electron/zk/witness.mjs 갱신 + 회로 산출물 존재 여부 보고. 원본이 없으면 경고만 하고 통과한다
//        (회로를 빌드하지 않은 환경에서도 앱 빌드는 되어야 하므로).
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DESKTOP = path.resolve(__dirname, '..')
const REPO = path.resolve(DESKTOP, '..', '..')
const CIRCUITS = path.join(REPO, 'circuits')

const SRC_WITNESS = path.join(CIRCUITS, 'witness.mjs')
const DST_DIR = path.join(DESKTOP, 'electron', 'zk')
const DST_WITNESS = path.join(DST_DIR, 'witness.mjs')

const SCENARIOS = ['youth_pass', 'regional_national_univ']

const sha = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex').slice(0, 12)

function syncWitness() {
  if (!fs.existsSync(SRC_WITNESS)) {
    console.warn(`[sync:zk] 경고: 원본이 없습니다 — ${path.relative(REPO, SRC_WITNESS)}`)
    if (!fs.existsSync(DST_WITNESS)) console.warn('[sync:zk]        사본도 없어 증명 기능이 동작하지 않습니다.')
    return
  }
  fs.mkdirSync(DST_DIR, { recursive: true })
  const before = fs.existsSync(DST_WITNESS) ? sha(DST_WITNESS) : null
  const header =
    '// ⚠️ 자동 생성 — 직접 수정 금지. 원본: circuits/witness.mjs\n' +
    '//    `yarn sync:zk` (predev/prebuild 에서 자동 실행) 가 원본을 그대로 복사한다.\n' +
    '//    회로와 SMT 키·학교코드·시도코드가 어긋나면 증명이 검증 실패하므로 포팅하지 않고 복사한다.\n'
  fs.writeFileSync(DST_WITNESS, header + fs.readFileSync(SRC_WITNESS, 'utf8'))
  const after = sha(DST_WITNESS)
  console.log(before === after ? `[sync:zk] witness.mjs 최신 (${after})` : `[sync:zk] witness.mjs 갱신 → ${after}`)
}

function checkArtifacts() {
  for (const name of SCENARIOS) {
    const dir = path.join(CIRCUITS, 'build', name)
    const wasm = path.join(dir, `${name}_js`, `${name}.wasm`)
    const zkey = path.join(dir, `${name}_final.zkey`)
    const ok = fs.existsSync(wasm) && fs.existsSync(zkey)
    const size = ok ? (fs.statSync(zkey).size / 1048576).toFixed(1) : '-'
    console.log(`[sync:zk] ${name.padEnd(24)} ${ok ? `준비됨 (zkey ${size}MB)` : `없음 — 'cd circuits && yarn build ${name}'`}`)
  }
}

syncWitness()
checkArtifacts()
