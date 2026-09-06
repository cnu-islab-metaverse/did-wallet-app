// [작업] 니모닉(시드) 비밀번호 암호화 — WebCrypto(PBKDF2 → AES-GCM). 의존성 없이 렌더러/브라우저에서 동작.
//        vault = JSON{v,s(salt),i(iv),c(ciphertext)} (base64). 잘못된 비번은 AES-GCM 인증 실패로 throw.
// [결과] encryptSeed(mnemonic, password) → vault 문자열 · decryptSeed(vault, password) → mnemonic.

const ITER = 600_000
const encoder = new TextEncoder()
const decoder = new TextDecoder()

const b64 = (a: Uint8Array) => btoa(String.fromCharCode(...a))
const ub64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))
// WebCrypto 는 BufferSource 를 받는다. TS 5.7 의 Uint8Array<ArrayBufferLike> 좁힘 회피용 캐스트.
const bs = (a: Uint8Array): BufferSource => a as unknown as BufferSource

async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', bs(encoder.encode(password)), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: bs(salt), iterations: ITER, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

export async function encryptSeed(mnemonic: string, password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await deriveKey(password, salt)
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: bs(iv) }, key, bs(encoder.encode(mnemonic))))
  return JSON.stringify({ v: 1, s: b64(salt), i: b64(iv), c: b64(ct) })
}

export async function decryptSeed(vault: string, password: string): Promise<string> {
  const { s, i, c } = JSON.parse(vault)
  const key = await deriveKey(password, ub64(s))
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bs(ub64(i)) }, key, bs(ub64(c)))
  return decoder.decode(pt)
}
