import { useEffect, useState } from 'react';

// [작업] 씬클라이언트 팝업 — 확장은 지갑을 보관하지 않는다. 데스크톱 지갑 프로그램(네이티브 호스트)
//        연결 상태를 확인하고, 연결 시 주소·VC 목록을 읽기 전용으로 보여준다. 승인·서명은 데스크톱 창에서.
// [결과] 프로그램 미설치/미실행 → 안내. 연결 → 주소/VC 표시.

type Status = 'checking' | 'connected' | 'unavailable';

function rpc(method: string, params?: any): Promise<any> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'DESKTOP_RPC', method, params }, (res) => resolve(res || { ok: false, error: 'no-response' }));
  });
}

const ThinPopup = () => {
  const [status, setStatus] = useState<Status>('checking');
  const [error, setError] = useState<string>('');
  const [address, setAddress] = useState<string>('');
  const [vcs, setVcs] = useState<any[]>([]);

  async function refresh() {
    setStatus('checking');
    const ping = await rpc('ping');
    if (!ping?.ok) {
      setError(ping?.error || '데스크톱 지갑 프로그램에 연결할 수 없습니다.');
      setStatus('unavailable');
      return;
    }
    const [addr, vc] = await Promise.all([rpc('getAddresses'), rpc('getVCs')]);
    setAddress(addr?.result?.address || addr?.result?.active?.address || '');
    setVcs(Array.isArray(vc?.result) ? vc.result : []);
    setStatus('connected');
  }

  useEffect(() => { refresh(); }, []);

  return (
    <div style={{ width: 360, minHeight: 420, padding: 18, fontFamily: 'Malgun Gothic, Noto Sans KR, sans-serif', color: '#1a1a1a' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <div style={{ width: 30, height: 30, borderRadius: 8, background: '#12508a', color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 800 }}>W</div>
        <div>
          <div style={{ fontWeight: 800 }}>DID·SBT 지갑</div>
          <div style={{ fontSize: 11, color: '#5a6472' }}>데스크톱 프로그램 연동 (씬클라이언트)</div>
        </div>
      </div>

      {status === 'checking' && <p style={{ color: '#5a6472' }}>데스크톱 지갑 연결 확인 중…</p>}

      {status === 'unavailable' && (
        <div style={{ background: '#fdf0f0', border: '1px solid #f3c2c2', borderRadius: 10, padding: 16 }}>
          <div style={{ fontWeight: 800, color: '#b02a2a', marginBottom: 6 }}>데스크톱 지갑 프로그램이 필요합니다</div>
          <p style={{ fontSize: 13, color: '#7a3b3b', margin: '0 0 12px' }}>
            이 확장은 <b>단독으로 동작하지 않습니다.</b> PC에 지갑 프로그램을 설치·실행한 뒤 다시 시도하세요.
          </p>
          <p style={{ fontSize: 11, color: '#a06a6a', margin: '0 0 12px' }}>{error}</p>
          <button onClick={refresh} style={{ padding: '8px 16px', borderRadius: 8, border: 0, background: '#12508a', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>
            다시 연결
          </button>
        </div>
      )}

      {status === 'connected' && (
        <div>
          <div style={{ background: '#eef4fb', border: '1px solid #cfe0f2', borderRadius: 10, padding: 14, marginBottom: 14 }}>
            <div style={{ fontSize: 11, color: '#5a6472', marginBottom: 4 }}>연결됨 · 지갑 주소</div>
            <div style={{ fontFamily: 'monospace', fontSize: 12, wordBreak: 'break-all' }}>{address || '(주소 없음 — 데스크톱에서 지갑 생성)'}</div>
          </div>
          <div style={{ fontWeight: 800, fontSize: 14, margin: '0 0 8px' }}>보관된 증명서(VC) {vcs.length}건</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 220, overflow: 'auto' }}>
            {vcs.length === 0 && <p style={{ fontSize: 12, color: '#5a6472' }}>아직 발급받은 VC가 없습니다.</p>}
            {vcs.map((vc, i) => {
              const t = Array.isArray(vc?.type) ? vc.type.find((x: string) => x !== 'VerifiableCredential') : 'VC';
              const name = vc?.credentialSubject?.name || '';
              return (
                <div key={i} style={{ border: '1px solid #dbe2ec', borderRadius: 8, padding: '10px 12px' }}>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>{t}</div>
                  <div style={{ fontSize: 11, color: '#5a6472' }}>{name}{vc?.issuer?.name ? ` · ${vc.issuer.name}` : ''}</div>
                </div>
              );
            })}
          </div>
          <p style={{ fontSize: 11, color: '#8b96ab', marginTop: 14 }}>서명·발급 승인은 데스크톱 지갑 창에서 처리됩니다.</p>
        </div>
      )}
    </div>
  );
};

export default ThinPopup;
