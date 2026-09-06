import { useEffect, useRef, useState } from 'react';

// [작업] 씬클라이언트 팝업 — 확장은 지갑을 보관하지 않는다. 데스크톱 프로그램 연결 상태를 보이고,
//        연결되면 주소·VC 를 읽기 전용으로 보여준다. 승인·서명은 데스크톱 창에서.
// [결과] 미등록/미실행을 구분해 안내하고, 2초마다 다시 확인해 실행하면 저절로 연결된다.

type Status = 'checking' | 'connected' | 'unavailable';
type Fault = 'not-registered' | 'not-running' | 'other';

function rpc(method: string, params?: any): Promise<any> {
  return new Promise(resolve => {
    chrome.runtime.sendMessage({ type: 'DESKTOP_RPC', method, params }, res =>
      resolve(res || { ok: false, fault: 'other', error: 'no-response' }),
    );
  });
}

const GUIDE: Record<Fault, { title: string; body: React.ReactNode }> = {
  'not-running': {
    title: '지갑 프로그램이 실행되어 있지 않습니다',
    body: <>PC 에서 지갑을 실행하면 <b>자동으로 연결</b>됩니다. 개발 중이라면 <code>yarn dev</code> 로 띄워도 됩니다.</>,
  },
  'not-registered': {
    title: '브라우저와 아직 연결되지 않았습니다',
    body: <><code>wallet/desktop</code> 에서 <code>yarn register:host</code> 를 실행하고 브라우저를 재시작하세요. 한 번만 하면 됩니다.</>,
  },
  other: {
    title: '데스크톱 지갑에 연결할 수 없습니다',
    body: <>확장은 단독으로 동작하지 않습니다.</>,
  },
};

const ThinPopup = () => {
  const [status, setStatus] = useState<Status>('checking');
  const [fault, setFault] = useState<Fault>('other');
  const [error, setError] = useState('');
  const [address, setAddress] = useState('');
  const [vcs, setVcs] = useState<any[]>([]);
  const busy = useRef(false);

  async function refresh(silent = false) {
    if (busy.current) return;
    busy.current = true;
    if (!silent) setStatus('checking');
    try {
      const ping = await rpc('ping');
      if (!ping?.ok) {
        setFault((ping?.fault as Fault) || 'other');
        setError(ping?.error || '');
        setStatus('unavailable');
        return;
      }
      const [addr, vc] = await Promise.all([rpc('getAddresses'), rpc('getVCs')]);
      setAddress(addr?.result?.address || addr?.result?.active?.address || '');
      setVcs(Array.isArray(vc?.result) ? vc.result : []);
      setStatus('connected');
    } finally {
      busy.current = false;
    }
  }

  useEffect(() => { void refresh(); }, []);

  // 지갑을 켜면 버튼을 누르지 않아도 연결되도록 계속 확인한다.
  useEffect(() => {
    if (status !== 'unavailable') return;
    const t = setInterval(() => void refresh(true), 2000);
    return () => clearInterval(t);
  }, [status]);

  return (
    <div style={{ width: 360, minHeight: 420, padding: 18, fontFamily: 'Malgun Gothic, Noto Sans KR, sans-serif', color: '#1a1a1a' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <div style={{ width: 30, height: 30, borderRadius: 8, background: 'linear-gradient(135deg,#6d8bff,#a06dff)', color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 800 }}>W</div>
        <div>
          <div style={{ fontWeight: 800 }}>DID·SBT 지갑</div>
          <div style={{ fontSize: 11, color: '#5a6472' }}>데스크톱 프로그램 연동 (씬클라이언트)</div>
        </div>
      </div>

      {status === 'checking' && <p style={{ color: '#5a6472' }}>데스크톱 지갑 연결 확인 중…</p>}

      {status === 'unavailable' && (
        <div style={{ background: '#fdf0f0', border: '1px solid #f3c2c2', borderRadius: 10, padding: 16 }}>
          <div style={{ fontWeight: 800, color: '#b02a2a', marginBottom: 6 }}>{GUIDE[fault].title}</div>
          <p style={{ fontSize: 13, color: '#7a3b3b', margin: '0 0 12px', lineHeight: 1.6 }}>{GUIDE[fault].body}</p>
          {error && <p style={{ fontSize: 11, color: '#a06a6a', margin: '0 0 12px' }}>{error}</p>}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button onClick={() => void refresh()} style={{ padding: '8px 16px', borderRadius: 8, border: 0, background: '#12508a', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>
              다시 연결
            </button>
            <span style={{ fontSize: 11, color: '#a06a6a' }}>2초마다 자동으로 다시 확인합니다</span>
          </div>
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
