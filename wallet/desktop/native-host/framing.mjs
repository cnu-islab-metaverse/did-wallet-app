// Chrome Native Messaging 프레이밍: 4바이트 LE 길이 + UTF-8 JSON. 로컬 파이프에도 동일 코덱 사용.
export function encode(obj) {
  const json = Buffer.from(JSON.stringify(obj), 'utf8')
  const len = Buffer.alloc(4)
  len.writeUInt32LE(json.length, 0)
  return Buffer.concat([len, json])
}

// 스트림 청크를 누적해 완성된 메시지마다 onMessage 호출하는 디코더를 만든다.
export function createDecoder(onMessage) {
  let buf = Buffer.alloc(0)
  return (chunk) => {
    buf = Buffer.concat([buf, chunk])
    while (buf.length >= 4) {
      const len = buf.readUInt32LE(0)
      if (buf.length < 4 + len) break
      const json = buf.subarray(4, 4 + len).toString('utf8')
      buf = buf.subarray(4 + len)
      try { onMessage(JSON.parse(json)) } catch (e) { onMessage({ __parseError: String(e) }) }
    }
  }
}
