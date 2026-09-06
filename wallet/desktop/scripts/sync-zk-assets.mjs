// [작업] 회로 자산을 데스크톱 앱으로 동기화한다. witness 빌더는 포팅하지 않고 복사한다 —
//        어긋나면 증명이 조용히 검증 실패한다. wasm/zkey 는 36MB 급이라 경로만 확인한다.
// [결과] electron/zk/witness.mjs · core/config/issuers.generated.json 갱신 +
//        산출물 존재 보고. 원본이 없으면 경고만 하고 통과한다.
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath, pathToFileURL } from 'node:url'

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
    '// ⚠️ 자동 생성 — 직접 수정 금지. 원본: circuits/witness.mjs (yarn sync:zk)\n' +
    '//    손으로 포팅하면 회로와 어긋나 증명이 조용히 실패한다. 그대로 복사한다.\n'
  fs.writeFileSync(DST_WITNESS, header + fs.readFileSync(SRC_WITNESS, 'utf8'))
  const after = sha(DST_WITNESS)
  console.log(before === after ? `[sync:zk] witness.mjs 최신 (${after})` : `[sync:zk] witness.mjs 갱신 → ${after}`)
}

// 발급기관 레지스트리 — 회로의 ISSUERS 에서 공개키를 유도해 지갑이 쓸 수 있게 낸다.
// 지갑은 VC 에 적힌 기관명을 믿지 않고 이 표에서 이름을 찾는다(서명 대상이 아니므로).
async function writeIssuerRegistry() {
  const { ISSUERS } = await import(pathToFileURL(DST_WITNESS).href)
  const { buildEddsa } = await import('circomlibjs')
  const eddsa = await buildEddsa()
  const F = eddsa.F
  const out = Object.entries(ISSUERS).map(([key, v]) => {
    const pub = eddsa.prv2pub(Buffer.from(v.prv, 'hex'))
    return { key, id: v.id, name: v.name, Ax: F.toObject(pub[0]).toString(), Ay: F.toObject(pub[1]).toString() }
  })
  const dst = path.resolve(__dirname, '..', '..', 'core', 'config', 'issuers.generated.json')
  fs.mkdirSync(path.dirname(dst), { recursive: true })
  fs.writeFileSync(dst, JSON.stringify(out, null, 2) + '\n')
  console.log(`[sync:zk] 발급기관 ${out.length}곳 → core/config/issuers.generated.json`)
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
await writeIssuerRegistry()
checkArtifacts()
