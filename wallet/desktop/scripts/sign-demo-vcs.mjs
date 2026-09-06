// [작업] 개발용 시드 VC 에 "진짜" 발급기관 서명을 붙인다.
//        demoVcs.ts 의 정의(DEMO_VCS_UNSIGNED)를 그대로 읽어 circuits 의 buildWitness + signVc 로
//        SMT root 와 EdDSA 서명을 만들고 demoVcs.signed.json 으로 내보낸다.
//        손으로 옮겨 적지 않으므로 클레임이 어긋날 일이 없다.
// [결과] core/ui/shell/demoVcs.signed.json — 회로 검증을 통과하는 시드 VC.
//        predev/prebuild 에서 자동 실행되므로 정의를 고치면 서명이 따라 갱신된다.
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { transform } from 'esbuild'
import { buildWitness, signVc } from '../electron/zk/witness.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DESKTOP = path.resolve(__dirname, '..')
const SHELL = path.resolve(DESKTOP, '..', 'core', 'ui', 'shell')
const SRC = path.join(SHELL, 'demoVcs.ts')
const OUT = path.join(SHELL, 'demoVcs.signed.json')

/** demoVcs.ts 에서 미서명 정의만 꺼낸다(타입만 벗겨 실행). */
async function loadUnsigned() {
  const ts = fs.readFileSync(SRC, 'utf8')
  const { code } = await transform(ts, { loader: 'ts', format: 'esm' })
  // 서명 JSON 을 다시 import 하지 않도록(순환) 해당 import 줄을 제거하고 평가한다.
  const stripped = code.replace(/^import .*demoVcs\.signed\.json.*$/gm, 'const SIGNED_DEMO_VCS = []')
  const tmp = path.join(SHELL, `.demoVcs.extract.${process.pid}.mjs`)
  fs.writeFileSync(tmp, stripped)
  try {
    const mod = await import(pathToFileURL(tmp).href)
    return mod.DEMO_VCS_UNSIGNED
  } finally {
    fs.rmSync(tmp, { force: true })
  }
}

async function main() {
  if (!fs.existsSync(SRC)) {
    console.warn(`[sign-demo-vcs] 원본 없음: ${SRC}`)
    return
  }
  const unsigned = await loadUnsigned()
  if (!Array.isArray(unsigned) || !unsigned.length) {
    console.warn('[sign-demo-vcs] DEMO_VCS_UNSIGNED 를 찾지 못했습니다 — 건너뜁니다.')
    return
  }

  const signed = []
  for (const vc of unsigned) {
    const w = await buildWitness(vc)
    const sig = signVc(w)
    signed.push({
      ...vc,
      issuer: { ...vc.issuer, publicKey: { Ax: sig.Ax.toString(), Ay: sig.Ay.toString() } },
      proof: {
        type: 'BabyJubJubSMTSignature2024',
        created: vc.issuanceDate ?? new Date(0).toISOString(),
        proofPurpose: 'assertionMethod',
        verificationMethod: vc.proofVerificationMethod ?? `${vc.issuer?.id ?? ''}/keys/1`,
        merkleRoot: w.root.toString(),
        signature: { R8x: sig.R8x.toString(), R8y: sig.R8y.toString(), S: sig.S.toString() },
      },
    })
  }

  fs.writeFileSync(OUT, JSON.stringify(signed, null, 2) + '\n')
  console.log(`[sign-demo-vcs] ${signed.length}건 서명 → ${path.relative(DESKTOP, OUT)}`)
  for (const v of signed) {
    const s = v.credentialSubject ?? {}
    const claims = ['name', 'birthDate', 'residentialAddress', 'university'].filter((k) => s[k] != null)
    console.log(`  ${(v.issuer?.name ?? '?').padEnd(12)} ${claims.join(',') || '(회로 클레임 없음)'}`)
  }
}

main().catch((e) => {
  console.error('[sign-demo-vcs]', e?.message || e)
  process.exitCode = 1
})
