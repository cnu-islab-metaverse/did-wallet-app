#!/usr/bin/env node
// [작업] Chrome Native Messaging 호스트 — 크롬(확장)의 stdio 를 실행 중인 데스크톱 지갑의
//        로컬 파이프로 중계한다. 데스크톱 프로그램이 이 호스트를 (설치 시) 등록해야만 확장이 접속 가능.
// [결과] 확장 요청 → 파이프 → Electron → (렌더러 지갑) → 응답 → 확장. 프로그램 미실행 시 program-not-running.
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { encode, createDecoder } from './framing.mjs'

const PIPE = process.platform === 'win32'
  ? '\\\\.\\pipe\\cnu-didwallet'
  : path.join(os.tmpdir(), 'cnu-didwallet.sock')

function toChrome(obj) { process.stdout.write(encode(obj)) }

let pipe = null
let pipeReady = false

function connectPipe() {
  pipe = net.connect(PIPE)
  const decodeFromPipe = createDecoder((msg) => toChrome(msg)) // 데스크톱 응답 → 크롬
  pipe.on('connect', () => { pipeReady = true })
  pipe.on('data', decodeFromPipe)
  pipe.on('error', () => { pipeReady = false })
  pipe.on('close', () => { pipeReady = false; pipe = null })
}
connectPipe()

// 크롬(확장) 요청 → 데스크톱 파이프
const decodeFromChrome = createDecoder((msg) => {
  const framed = encode(msg)
  const trySend = () => {
    if (pipeReady && pipe) { pipe.write(framed); return true }
    return false
  }
  if (trySend()) return
  if (!pipe) connectPipe()
  // 잠시 재시도 후에도 연결 안 되면 '프로그램 미실행' 응답
  const started = Date.now()
  const timer = setInterval(() => {
    if (trySend()) { clearInterval(timer); return }
    if (Date.now() - started > 1500) {
      clearInterval(timer)
      toChrome({ id: msg?.id, error: 'program-not-running' })
    }
  }, 150)
})

process.stdin.on('data', decodeFromChrome)
process.stdin.on('end', () => process.exit(0))
