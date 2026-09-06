import React, { useState, useEffect } from 'react'
import { Button, Modal, Field } from '../index'
import { ThemeToggle } from '../ThemeToggle'
import { DEMO_VCS, computeStatus, vcTitle, vcIssuer, vcDates, claimRows } from './demoVcs'
import { useWallet } from '../../state/useWallet'
import { useVCs } from '../../state/useVCs'
import { isDevModeEnabled } from '../../config/dev.config'
import { issuePass, canIssue, scenariosForVc, fetchOnChainPasses, SCENARIO_LABEL as SCENARIO_LABEL_MAP, type OnChainPass } from '../../lib/passIssuance'
import { fetchPassRequest, formatValidity, type CheckedPassRequest } from '../../lib/passRequest'

// [실 셸] 데스크톱 지갑 본체 UI — 좌측 메뉴로 뷰 전환(대시보드 / 증명서·인증토큰 목록 / 활동 / 설정).
// 계정·VC 는 실제 저장소(hdWalletService·vcStore)에 연결돼 있고, 확장에서 오는 승인 요청도 여기서 받는다.
// SBT 목록·활동 내역·연결된 서비스는 아직 목데이터이며 dev 빌드에서만 노출된다(Phase 4 에서 실데이터 연결).

const Icon: React.FC<{ d: string; size?: number }> = ({ d, size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
)
const ICONS = {
  home: 'M3 10.5 12 3l9 7.5M5 9.5V21h14V9.5',
  doc: 'M7 3h7l5 5v13H7zM14 3v5h5',
  token: 'M12 3l8 4.5v9L12 21l-8-4.5v-9zM12 3v18M4 7.5l8 4.5 8-4.5',
  activity: 'M3 12h4l3 8 4-16 3 8h4',
  gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 13a7.9 7.9 0 0 0 0-2l2-1.5-2-3.4-2.3 1a7.6 7.6 0 0 0-1.7-1L14.9 3H9.1l-.4 2.6a7.6 7.6 0 0 0-1.7 1l-2.3-1-2 3.4L2.6 11a7.9 7.9 0 0 0 0 2l-2 1.5 2 3.4 2.3-1a7.6 7.6 0 0 0 1.7 1l.4 2.6h5.8l.4-2.6a7.6 7.6 0 0 0 1.7-1l2.3 1 2-3.4z',
  plus: 'M12 5v14M5 12h14', copy: 'M9 9h10v10H9zM5 15V5h10', warn: 'M12 9v4M12 17h.01M10.3 3.9 2 18a2 2 0 0 0 1.7 3h16.6a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
}
const NAV = [
  { key: 'home', label: '대시보드', d: ICONS.home },
  { key: 'vcs', label: '증명서 (VC)', d: ICONS.doc },
  { key: 'sbts', label: '인증토큰 (SBT)', d: ICONS.token },
  { key: 'activity', label: '활동', d: ICONS.activity },
  { key: 'settings', label: '설정', d: ICONS.gear },
]
const INIT_SBTS = [
  { t: '지역청년패스', issuer: 'Daejeon Youth Pass · Sepolia', status: '보유', issued: '2026-07-20', contract: '0x9dCa1C3d54548E86ACc9341c6CA9bc0748B93539' },
  { t: '지방거점국립대 소속', issuer: 'Regional Univ Pass · Sepolia', status: '보유', issued: '2026-07-25', contract: '0x7bE9c3f0aA4d2e51C6b8dF9012aB34Cd56Ef7890' },
]
const ACTIVITY = [
  { d: ICONS.token, title: '지역청년패스 인증토큰 발급', sub: 'Sepolia · 온체인 발급(mint)', time: '3일 전' },
  { d: ICONS.activity, title: "‘만 19~34세’ 영지식 증명 제시", sub: '검증자: 대전청년몰', time: '6일 전' },
  { d: ICONS.doc, title: '졸업증명서 발급받음', sub: '충남대학교', time: '2주 전' },
  { d: ICONS.doc, title: '운전면허증 발급받음', sub: '경찰청', time: '3주 전' },
  { d: ICONS.doc, title: '주민등록증 발급받음', sub: '행정안전부', time: '1개월 전' },
]
const TRUST = ['행정안전부', '경찰청', '충남대학교', '한국산업인력공단', '국민건강보험공단']
const CONNECTED = [
  { name: '정부24 발급기관 (데모)', origin: 'http://localhost:20251' },
  { name: '충남대 증명서 발급 (데모)', origin: 'http://localhost:20252' },
  { name: '대전청년몰 검증자 (데모)', origin: 'http://localhost:20260' },
]
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`

// 화면 폭 감지 — 넓으면 우측 상세 패널, 좁으면 모달.
function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia(query)
    const on = () => setMatches(mq.matches)
    on()
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [query])
  return matches
}

// ── 온보딩 / 잠금해제 게이트 ─────────────────────────────────
// 실제 HD 지갑(useWallet)에 연결. 언락 전에는 앱 대신 이 화면을 보여준다.
const centerWrap: React.CSSProperties = { flex: 1, width: '100%', height: '100%', display: 'grid', placeItems: 'center', padding: 24, boxSizing: 'border-box' }
const cardStyle: React.CSSProperties = { width: '100%', maxWidth: 420, border: '1px solid var(--color-border-strong)', borderRadius: 12, background: 'var(--panel-bg)', padding: 28, display: 'grid', gap: 16 }
const AccountGate: React.FC<{ wallet: ReturnType<typeof useWallet> }> = ({ wallet }) => {
  const [mode, setMode] = useState<'create' | 'import'>('create')
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [mnemonic, setMnemonic] = useState('')
  const [phrase, setPhrase] = useState<string | null>(null) // 생성된 복구구문(확인 전)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  if (wallet.status === 'loading') return <div style={centerWrap}><span style={{ color: 'var(--color-muted)' }}>불러오는 중…</span></div>

  if (wallet.status === 'locked') {
    const doUnlock = async () => { setErr(''); setBusy(true); const ok = await wallet.unlock(pw); setBusy(false); if (!ok) setErr('비밀번호가 올바르지 않습니다.') }
    return (
      <div style={centerWrap}><div style={cardStyle}>
        <div><div style={{ fontSize: 18, fontWeight: 800 }}>지갑 잠금 해제</div><div style={{ fontSize: 13, color: 'var(--color-muted)', marginTop: 4 }}>비밀번호를 입력해 지갑을 엽니다.</div></div>
        <Field label="비밀번호" type="password" value={pw} autoFocus onChange={(e) => { setPw(e.target.value); setErr('') }} onKeyDown={(e) => { if (e.key === 'Enter') doUnlock() }} />
        {err && <div style={{ fontSize: 12.5, color: 'var(--btn-danger)' }}>{err}</div>}
        <Button variant="primary" onClick={doUnlock} disabled={busy || !pw}>잠금 해제</Button>
      </div></div>
    )
  }

  // uninitialized: 생성 / 가져오기
  const doCreate = () => {
    setErr(''); if (pw.length < 8) { setErr('비밀번호는 8자 이상이어야 합니다.'); return }
    if (pw !== pw2) { setErr('비밀번호가 일치하지 않습니다.'); return }
    setPhrase(wallet.generateMnemonic())
  }
  const confirmCreate = async () => { if (!phrase) return; setBusy(true); await wallet.createWallet(phrase, pw); setBusy(false) }
  const doImport = async () => {
    setErr(''); if (pw.length < 8) { setErr('비밀번호는 8자 이상이어야 합니다.'); return }
    const n = mnemonic.trim().split(/\s+/).length; if (n !== 12 && n !== 24) { setErr('복구구문(니모닉)은 12 또는 24 단어여야 합니다.'); return }
    setBusy(true); const ok = await wallet.importWallet(mnemonic, pw); setBusy(false); if (!ok) setErr('가져오기에 실패했습니다.')
  }

  return (
    <div style={centerWrap}><div style={cardStyle}>
      <div><div style={{ fontSize: 18, fontWeight: 800 }}>DID&SBT Wallet 시작</div><div style={{ fontSize: 13, color: 'var(--color-muted)', marginTop: 4 }}>새 아바타 지갑을 만들거나 복구구문으로 가져옵니다.</div></div>
      <div style={{ display: 'flex', gap: 6, background: 'var(--panel-soft)', padding: 4, borderRadius: 8 }}>
        {(['create', 'import'] as const).map((m) => (
          <button key={m} onClick={() => { setMode(m); setErr(''); setPhrase(null) }} style={{ flex: 1, padding: '7px 0', borderRadius: 6, border: 0, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700, fontSize: 13, background: mode === m ? 'var(--panel-bg)' : 'transparent', color: mode === m ? 'var(--color-fg)' : 'var(--color-muted)' }}>{m === 'create' ? '새로 만들기' : '가져오기'}</button>
        ))}
      </div>
      {mode === 'create' ? (
        phrase ? (
          <>
            <div style={{ fontSize: 13, color: 'var(--color-muted)' }}>아래 <b>복구구문(12단어)</b>을 안전한 곳에 보관하세요. 분실 시 계정을 복구할 수 없습니다.</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, padding: 12, border: '1px solid var(--color-border)', borderRadius: 8, background: 'var(--panel-soft)' }}>
              {phrase.split(' ').map((w, i) => (<div key={i} style={{ fontSize: 12.5, fontFamily: 'var(--font-mono)' }}><span style={{ color: 'var(--color-muted)' }}>{i + 1}.</span> {w}</div>))}
            </div>
            <Button variant="primary" onClick={confirmCreate} disabled={busy}>{busy ? '생성 중…' : '보관했습니다 · 지갑 시작'}</Button>
          </>
        ) : (
          <>
            <Field label="비밀번호 (8자 이상)" type="password" value={pw} onChange={(e) => { setPw(e.target.value); setErr('') }} />
            <Field label="비밀번호 확인" type="password" value={pw2} onChange={(e) => { setPw2(e.target.value); setErr('') }} />
            {err && <div style={{ fontSize: 12.5, color: 'var(--btn-danger)' }}>{err}</div>}
            <Button variant="primary" onClick={doCreate} disabled={!pw || !pw2}>복구구문 생성</Button>
          </>
        )
      ) : (
        <>
          <div style={{ display: 'grid', gap: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>복구구문 (니모닉)</span>
            <textarea value={mnemonic} onChange={(e) => { setMnemonic(e.target.value); setErr('') }} placeholder="12 또는 24 단어" style={{ width: '100%', height: 84, fontFamily: 'var(--font-mono)', fontSize: 12.5, padding: 10, borderRadius: 6, border: '1px solid var(--color-border)', background: 'var(--panel-soft)', color: 'var(--color-fg)', resize: 'vertical', outline: 'none' }} />
          </div>
          <Field label="비밀번호 (8자 이상)" type="password" value={pw} onChange={(e) => { setPw(e.target.value); setErr('') }} />
          {err && <div style={{ fontSize: 12.5, color: 'var(--btn-danger)' }}>{err}</div>}
          <Button variant="primary" onClick={doImport} disabled={busy || !mnemonic.trim() || !pw}>가져오기</Button>
        </>
      )}
    </div></div>
  )
}

const Badge: React.FC<{ tone?: 'muted'; children: React.ReactNode }> = ({ tone, children }) => (
  <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 4, background: tone ? 'var(--panel-soft)' : 'var(--btn-success-light)', color: tone ? 'var(--color-muted)' : 'var(--btn-success-hover)', border: tone ? '1px solid var(--color-border)' : 'none' }}>{children}</span>
)

// 설정용 재사용 요소
type SettingRow = { label: React.ReactNode; sub?: React.ReactNode; ctrl?: React.ReactNode }
const Section: React.FC<{ title: string; rows: SettingRow[] }> = ({ title, rows }) => (
  <section style={{ border: '1px solid var(--color-border-strong)', borderRadius: 8, background: 'var(--panel-bg)', overflow: 'hidden', breakInside: 'avoid', marginBottom: 14 }}>
    <div style={{ padding: '8px 15px', borderBottom: '1px solid var(--color-border)', fontSize: 12, fontWeight: 700, color: 'var(--color-muted)' }}>{title}</div>
    {rows.map((r, i) => (
      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 15px', borderBottom: i < rows.length - 1 ? '1px solid var(--color-border)' : 'none' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>{r.label}</div>
          {r.sub != null && <div style={{ fontSize: 12.5, color: 'var(--color-muted)', marginTop: 2 }}>{r.sub}</div>}
        </div>
        {r.ctrl}
      </div>
    ))}
  </section>
)
const Switch: React.FC<{ checked: boolean; onChange: () => void }> = ({ checked, onChange }) => (
  <button role="switch" aria-checked={checked} onClick={onChange} style={{ width: 42, height: 24, borderRadius: 999, border: 0, cursor: 'pointer', padding: 2, background: checked ? 'var(--btn-primary)' : 'var(--color-border-strong)', transition: 'background .15s', flex: 'none' }}>
    <span style={{ display: 'block', width: 20, height: 20, borderRadius: 999, background: '#fff', transform: checked ? 'translateX(18px)' : 'translateX(0)', transition: 'transform .15s' }} />
  </button>
)
const selectStyle: React.CSSProperties = { fontFamily: 'inherit', fontSize: 13, padding: '6px 10px', borderRadius: 6, border: '1px solid var(--color-border)', background: 'var(--panel-bg)', color: 'var(--color-fg)', cursor: 'pointer', outline: 'none' }

export const WalletShell: React.FC = () => {
  const wallet = useWallet()
  const [active, setActive] = useState('home')
  const [tab, setTab] = useState<'vcs' | 'sbts'>('vcs')
  const [vcFilter, setVcFilter] = useState<'all' | 'valid' | 'expired'>('all')
  const isWide = useMediaQuery('(min-width: 1220px)')
  const [issuanceReq, setIssuanceReq] = useState<any>(null)
  const [accOpen, setAccOpen] = useState(false)
  const [logoutAsk, setLogoutAsk] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  // 아직 실데이터에 연결되지 않은 화면(보유 SBT·활동 내역·연결된 서비스)은 dev 빌드에서만 목데이터를
  // 보여준다. 배포 빌드에서는 빈 목록으로 시작해 사용자가 실제로 보유한 것만 나타난다. (Phase 4 에서 연결)
  const showMocks = isDevModeEnabled()
  const activity = showMocks ? ACTIVITY : []
  const connected = showMocks ? CONNECTED : []
  const vcHook = useVCs(wallet.active?.address, showMocks ? DEMO_VCS : undefined)
  // 목록에는 계보별 최신 발급본만 세운다. 이전 발급본은 상세의 '재발급 이력' 로 접힌다.
  const vcGroups = vcHook.groups
  const vcs = vcGroups.map((g) => g.current)
  const historyOf = (vc: any) => vcGroups.find((g) => g.current === vc)?.history ?? []
  const lineageOf = (vc: any) => vcGroups.find((g) => g.current === vc)?.lineage ?? null
  const [sbts, setSbts] = useState<any[]>(showMocks ? INIT_SBTS : [])
  // 온체인에서 실제로 읽어온 보유 패스. 목데이터와 달리 체인 상태다.
  const [chainPasses, setChainPasses] = useState<OnChainPass[]>([])
  const [issuing, setIssuing] = useState<string | null>(null)  // 진행 단계 문구
  const [issueErr, setIssueErr] = useState('')
  const [issuedResult, setIssuedResult] = useState<any | null>(null)
  // 검증자(플랫폼)가 준 발급 요청. 지갑이 대상을 들고 있는 게 아니라 요청이 지정한다.
  const [reqOpen, setReqOpen] = useState(false)
  const [reqInput, setReqInput] = useState('')
  const [reqBusy, setReqBusy] = useState(false)
  const [reqErr, setReqErr] = useState('')
  const [checked, setChecked] = useState<CheckedPassRequest | null>(null)
  const [detailVc, setDetailVc] = useState<any | null>(null)
  const [detailSbt, setDetailSbt] = useState<any | null>(null)
  const [adding, setAdding] = useState(false)
  const [addingSbt, setAddingSbt] = useState(false)
  const [vp, setVp] = useState(false)
  const [paste, setPaste] = useState('')
  const [err, setErr] = useState('')
  const [sbtContract, setSbtContract] = useState('')
  const [sbtName, setSbtName] = useState('')
  const [sbtErr, setSbtErr] = useState('')
  const [copied, setCopied] = useState(false)
  const [autoLock, setAutoLock] = useState('5분')
  const [language, setLanguage] = useState('한국어')
  const [devUnlock, setDevUnlock] = useState(false)

  const activeAddress = wallet.active?.address
  const refreshChainPasses = React.useCallback(async () => {
    if (!activeAddress) { setChainPasses([]); return }
    try { setChainPasses(await fetchOnChainPasses(activeAddress)) } catch { /* RPC 실패는 무시 */ }
  }, [activeAddress])
  useEffect(() => { void refreshChainPasses() }, [refreshChainPasses])

  // 화면에 뿌릴 목록 = 온체인 보유분 + (dev 목데이터)
  const sbtList = [
    ...chainPasses.map((p) => ({
      t: p.label,
      issuer: `${short(p.contract)} · Sepolia`,
      status: p.valid ? '보유' : '만료',
      issued: p.expiresAt ? `만료 ${new Date(p.expiresAt * 1000).toISOString().slice(0, 10)}` : '무기한',
      contract: p.contract,
      tokenId: p.tokenId,
      onChain: true,
    })),
    ...sbts,
  ]

  // VC → ZK 증명 → 온체인 mintPass. 증명은 메인 프로세스에서 수 초 걸린다.
  // 붙여넣은 URL(또는 JSON)로 요청을 가져와 온체인으로 검증한다.
  const loadRequest = () => {
    void (async () => {
      setReqErr(''); setReqBusy(true)
      try {
        const r = await fetchPassRequest(reqInput)
        setChecked(r); setReqOpen(false); setReqInput('')
      } catch (e: any) { setReqErr(e?.message || String(e)) }
      finally { setReqBusy(false) }
    })()
  }

  // 요청이 지정한 대상으로 제출한다. 쓸 VC 는 시나리오로 고른다.
  const runRequestedIssue = (r: CheckedPassRequest) => {
    void (async () => {
      setIssueErr('')
      const vc = vcs.find((v) => scenariosForVc(v).includes(r.request.scenario))
      if (!vc) { setIssueErr(`이 요청에 맞는 증명서가 없습니다 (${SCENARIO_LABEL_MAP[r.request.scenario]}).`); setChecked(null); return }
      try {
        const res = await issuePass(vc, {
          scenario: r.request.scenario,
          tokenURI: r.request.tokenURI,
          target: { contract: r.request.contract, passType: r.request.passType },
          onStage: (st) => setIssuing(st),
        })
        setChecked(null); setIssuedResult(res); await refreshChainPasses()
      } catch (e: any) { setIssueErr(e?.message || String(e)) }
      finally { setIssuing(null) }
    })()
  }

  const runIssue = (vc: any) => {
    void (async () => {
      setIssueErr('')
      try {
        const r = await issuePass(vc, { onStage: (st) => setIssuing(st) })
        setIssuedResult(r)
        await refreshChainPasses()
      } catch (e: any) {
        setIssueErr(e?.message || String(e))
      } finally {
        setIssuing(null)
      }
    })()
  }

  const expired = vcs.filter((v) => v?.validUntil && new Date(v.validUntil).getTime() < Date.now()).length
  const goList = (t: 'vcs' | 'sbts') => { setTab(t); setActive(t) }
  const navClick = (k: string) => { setActive(k); if (k === 'vcs' || k === 'sbts') setTab(k) }

  const addVc = () => {
    void (async () => {
      try {
        const raw = JSON.parse(paste)
        if (!raw || typeof raw !== 'object') throw new Error('객체가 아닙니다')
        const r = await vcHook.addVC(raw)
        if (!r.ok) { setErr(r.duplicate ? '이미 보관 중인 증명서입니다.' : '저장에 실패했습니다.'); return }
        setPaste(''); setErr(''); setAdding(false)
      } catch (e: any) { setErr('올바른 VC JSON 이 아닙니다: ' + (e?.message || e)) }
    })()
  }
  const addSbt = () => {
    const c = sbtContract.trim()
    if (!/^0x[0-9a-fA-F]{40}$/.test(c)) { setSbtErr('올바른 컨트랙트 주소(0x + 40자리 hex)가 아닙니다.'); return }
    const name = sbtName.trim() || `SBT ${short(c)}`
    setSbts((p) => [{ t: name, issuer: `${short(c)} · Sepolia`, status: '보유', issued: new Date().toISOString().slice(0, 10), contract: c }, ...p])
    setSbtContract(''); setSbtName(''); setSbtErr(''); setAddingSbt(false)
  }
  const copyRaw = async (obj: any) => { try { await navigator.clipboard.writeText(JSON.stringify(obj, null, 2)); setCopied(true); setTimeout(() => setCopied(false), 1500) } catch { /* */ } }
  const copyText = async (t: string) => { try { await navigator.clipboard.writeText(t) } catch { /* */ } }
  const accounts = wallet.accounts
  const acc = wallet.active ?? ({ id: '', name: '계정', address: '0x0000000000000000000000000000000000000000', did: 'did:ethr:—' } as any)
  const addAccount = () => { wallet.addAccount() }
  const startRename = (id: string, name: string) => { setEditId(id); setEditName(name) }
  const saveRename = () => { if (!editId) return; const n = editName.trim(); if (n) wallet.renameAccount(editId, n); setEditId(null) }
  const accentTile = { background: 'var(--accent-soft-bg)', color: 'var(--accent-soft-fg)' }
  // 계정마다 주소 기반의 고유(결정적) 그라디언트 색상
  const avatarBg = (seed?: string) => {
    if (!seed) return 'linear-gradient(135deg,#6366f1,#ec4899)'
    let h = 0; for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
    const a = h % 360, b = (a + 55) % 360
    return `linear-gradient(135deg, hsl(${a} 68% 58%), hsl(${b} 72% 52%))`
  }
  const avatar = (s: number, seed?: string) => ({ width: s, height: s, borderRadius: s * 0.28, background: avatarBg(seed), flex: 'none' as const })

  // [개발용] 브리지 없이 발급 승인 모달을 확인 — 모의 수신 요청을 셸에 직접 전달.
  const simulateIssuance = () => {
    const vc = {
      '@context': ['https://www.w3.org/2018/credentials/v1'],
      type: ['VerifiableCredential', 'ResidentRegistrationCard'],
      issuer: 'did:web:gov.kr (행정안전부)',
      issuanceDate: new Date().toISOString(),
      credentialSubject: { id: acc.did, name: '홍길동', birthDate: '1998-03-10', residence: '대전광역시 유성구', serial: Date.now() },
      proof: { type: 'BabyJubJubSMTSignature2024', created: new Date().toISOString() },
    }
    setIssuanceReq({ kind: 'vc-issuance', payload: { vc, origin: 'http://localhost:20251 (모의)', accountName: acc.name, address: acc.address }, respond: (ok: boolean) => { if (ok) vcHook.addVC(vc) } })
  }

  // 발급기관 → 데스크톱 수신: 승인 요청 리슨 + VC 변경 시 목록 갱신
  useEffect(() => {
    const onApproval = (e: any) => { if (e?.detail?.kind === 'vc-issuance') setIssuanceReq(e.detail) }
    const onUpdated = () => { vcHook.refresh() }
    window.addEventListener('wallet-rpc-approval', onApproval as EventListener)
    window.addEventListener('wallet-vc-updated', onUpdated as EventListener)
    return () => {
      window.removeEventListener('wallet-rpc-approval', onApproval as EventListener)
      window.removeEventListener('wallet-vc-updated', onUpdated as EventListener)
    }
  }, [vcHook.refresh])

  // 언락 전에는 온보딩/잠금해제 화면을 표시
  if (wallet.status !== 'unlocked') return <AccountGate wallet={wallet} />

  // 목록 우측 기능 레일 스타일 + VC 상태 필터
  const railCard: React.CSSProperties = { border: '1px solid var(--color-border-strong)', borderRadius: 8, background: 'var(--panel-bg)', overflow: 'hidden' }
  const railHead: React.CSSProperties = { padding: '8px 12px', borderBottom: '1px solid var(--color-border)', fontSize: 12, fontWeight: 700, color: 'var(--color-muted)' }
  const chipStyle = (on: boolean): React.CSSProperties => ({ fontFamily: 'inherit', fontSize: 12, fontWeight: 600, padding: '5px 10px', borderRadius: 999, cursor: 'pointer', border: `1px solid ${on ? 'var(--accent-soft-fg)' : 'var(--color-border)'}`, background: on ? 'var(--accent-soft-bg)' : 'var(--panel-bg)', color: on ? 'var(--accent-soft-fg)' : 'var(--color-muted)' })
  const isExpired = (v: any) => v?.validUntil && new Date(v.validUntil).getTime() < Date.now()
  const vcsShown = vcFilter === 'all' ? vcs : vcs.filter((v) => (vcFilter === 'expired' ? isExpired(v) : !isExpired(v)))

  // ── 대시보드 ──────────────────────────────────────────────
  const Dashboard = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* 프로필 */}
      <section style={{ display: 'flex', alignItems: 'center', gap: 16, border: '1px solid var(--color-border-strong)', borderRadius: 8, background: 'var(--panel-bg)', padding: '18px 20px', borderTop: '3px solid var(--accent-soft-fg)' }}>
        <span style={avatar(48, acc.address)} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 17, fontWeight: 800 }}>{acc.name}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3 }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5, color: 'var(--color-muted)' }}>did:ethr:{short(acc.address)}</span>
            <button title="주소 복사" onClick={() => copyText(acc.address)} style={{ border: 0, background: 'transparent', color: 'var(--color-muted)', cursor: 'pointer', display: 'grid', placeItems: 'center' }}><Icon d={ICONS.copy} size={14} /></button>
          </div>
        </div>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--color-muted)', padding: '5px 11px', borderRadius: 999, border: '1px solid var(--color-border)' }}>
          <span style={{ width: 7, height: 7, borderRadius: 999, background: '#10b981' }} /> Sepolia
        </span>
        <Button size="sm" variant="ghost" onClick={() => setAccOpen(true)}>계정 관리</Button>
      </section>

      {/* 요약 통계 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
        {[
          { label: '증명서 (VC)', n: vcs.length, on: () => goList('vcs'), d: ICONS.doc },
          { label: '인증토큰 (SBT)', n: sbtList.length, on: () => goList('sbts'), d: ICONS.token },
          { label: '만료 · 갱신 필요', n: expired, on: () => goList('vcs'), d: ICONS.warn, warn: expired > 0 },
        ].map((s) => (
          <button key={s.label} onClick={s.on} style={{ display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', border: '1px solid var(--color-border-strong)', borderRadius: 8, background: 'var(--panel-bg)', padding: '16px 18px' }}>
            <div style={{ width: 40, height: 40, borderRadius: 8, display: 'grid', placeItems: 'center', flex: 'none', ...(s.warn ? { background: 'var(--btn-warning-light)', color: 'var(--btn-warning-hover)' } : accentTile) }}><Icon d={s.d} /></div>
            <div>
              <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1 }}>{s.n}</div>
              <div style={{ fontSize: 12, color: 'var(--color-muted)', marginTop: 4 }}>{s.label}</div>
            </div>
          </button>
        ))}
      </div>

      {/* 빠른 작업 */}
      <div>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--color-muted)', margin: '2px 2px 8px' }}>빠른 작업</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          {[
            { label: '증명서 추가', d: ICONS.plus, on: () => { setErr(''); setAdding(true) } },
            { label: '증명서 제시 (VP)', d: ICONS.activity, on: () => setVp(true) },
            { label: '인증토큰 조회', d: ICONS.token, on: () => goList('sbts') },
          ].map((a) => (
            <button key={a.label} onClick={a.on} style={{ display: 'flex', alignItems: 'center', gap: 11, textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13.5, fontWeight: 700, border: '1px solid var(--color-border)', borderRadius: 8, background: 'var(--panel-bg)', color: 'var(--color-fg)', padding: '13px 16px' }}>
              <div style={{ width: 32, height: 32, borderRadius: 7, display: 'grid', placeItems: 'center', flex: 'none', ...accentTile }}><Icon d={a.d} size={17} /></div>
              {a.label}
            </button>
          ))}
        </div>
      </div>

      {/* 최근 활동 */}
      <section style={{ border: '1px solid var(--color-border-strong)', borderRadius: 8, background: 'var(--panel-bg)', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', padding: '11px 18px', borderBottom: '1px solid var(--color-border)' }}>
          <strong style={{ fontSize: 14 }}>최근 활동</strong>
          <div style={{ flex: 1 }} />
          <Button size="sm" variant="ghost" onClick={() => setActive('activity')}>전체 보기</Button>
        </div>
        {activity.slice(0, 4).map((a, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '11px 18px', borderBottom: i < 3 ? '1px solid var(--color-border)' : 'none' }}>
            <div style={{ width: 32, height: 32, borderRadius: 7, display: 'grid', placeItems: 'center', flex: 'none', ...accentTile }}><Icon d={a.d} size={16} /></div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 600 }}>{a.title}</div>
              <div style={{ fontSize: 12, color: 'var(--color-muted)' }}>{a.sub}</div>
            </div>
            <span style={{ fontSize: 12, color: 'var(--color-muted)', flex: 'none' }}>{a.time}</span>
          </div>
        ))}
      </section>
    </div>
  )

  // ── 증명서/인증토큰 목록 ──────────────────────────────────
  const panelTitle = tab === 'vcs' ? '증명서 (VC)' : '인증토큰 (SBT)'

  // 상세 렌더러 — 넓은 화면 우측 패널 / 좁은 화면 모달 공용
  const renderVcDetail = (vc: any) => { const st = computeStatus(vc); return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div>
        <div style={{ fontSize: 18, fontWeight: 800 }}>{vcTitle(vc)}</div>
        <div style={{ fontSize: 12.5, color: 'var(--color-muted)' }}>{vcIssuer(vc)} · {st.label}{vc.validUntil ? ` · 유효기간 ${String(vc.validUntil).slice(0, 10)}` : ' · 무기한'}</div>
      </div>
      <div>
        <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 8 }}>포함된 신원정보</div>
        <div style={{ border: '1px solid var(--color-border)', borderRadius: 6, overflow: 'hidden' }}>
          {claimRows(vc).map((r, i, arr) => (
            <div key={i} style={{ display: 'flex', gap: 12, padding: '8px 12px', fontSize: 13, borderBottom: i < arr.length - 1 ? '1px solid var(--color-border)' : 'none' }}>
              <span style={{ width: 110, flex: 'none', color: 'var(--color-muted)' }}>{r.label}</span>
              <span style={{ wordBreak: 'break-all', fontFamily: /주소|번호|DID/.test(r.label) ? 'var(--font-mono)' : 'inherit' }}>{r.value}</span>
            </div>
          ))}
        </div>
      </div>
      {historyOf(vc).length > 0 && (
        <div>
          <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 8 }}>재발급 이력</div>
          <div style={{ border: '1px solid var(--color-border)', borderRadius: 8, overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', fontSize: 12.5, background: 'var(--accent-soft-bg)' }}>
              <Badge>현재</Badge>
              <span>발급 {vcDates(vc).issued || '—'}</span>
            </div>
            {historyOf(vc).map((old: any, i: number) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', fontSize: 12.5, borderTop: '1px solid var(--color-border)', color: 'var(--color-muted)' }}>
                <Badge tone="muted">이전</Badge>
                <span>발급 {vcDates(old).issued || '—'}</span>
                <Button size="sm" variant="ghost" style={{ marginLeft: 'auto' }} onClick={() => copyRaw(old)}>원본 복사</Button>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--color-muted)', marginTop: 6 }}>
            같은 발급기관·종류의 증명서는 재발급받아도 한 항목으로 묶입니다. 증명에는 현재 발급본이 쓰입니다.
          </div>
        </div>
      )}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <span style={{ fontSize: 12.5, fontWeight: 700 }}>원본 VC 데이터</span>
          <Button size="sm" variant="ghost" onClick={() => copyRaw(vc)}>{copied ? '복사됨 ✓' : '복사'}</Button>
        </div>
        <textarea readOnly value={JSON.stringify(vc, null, 2)} onFocus={(e) => e.currentTarget.select()}
          style={{ width: '100%', height: 200, fontFamily: 'var(--font-mono)', fontSize: 11.5, padding: 12, borderRadius: 6, border: '1px solid var(--color-border)', background: '#0f172a', color: '#d7e3ff', resize: 'vertical', outline: 'none', whiteSpace: 'pre' }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, borderTop: '1px solid var(--color-border)', paddingTop: 12 }}>
        {(() => {
          // 이 VC 의 클레임으로 증명 가능한 시나리오가 있고, 데스크톱(메인 프로세스 증명)일 때만 노출.
          const avail = scenariosForVc(vc)
          if (!avail.length || !canIssue()) return <span />
          return (
            <Button size="sm" variant="primary" disabled={!!issuing} onClick={() => runIssue(vc)}>
              {issuing ?? '인증토큰 발급받기'}
            </Button>
          )
        })()}
        <Button size="sm" variant="ghost" onClick={async () => {
          // 재발급 이력이 있으면 계보 전체를 지운다(이전 발급본만 남아 되살아나는 것을 막는다).
          const lin = lineageOf(vc)
          if (lin && historyOf(vc).length > 0) await vcHook.removeLineage(lin)
          else await vcHook.removeVC(vcHook.vcId(vc))
          setDetailVc(null)
        }} style={{ color: 'var(--btn-danger)' }}>
          {historyOf(vc).length > 0 ? `이 증명서 삭제 (이력 ${historyOf(vc).length + 1}건)` : '이 증명서 삭제'}
        </Button>
      </div>
    </div>
  ) }
  const renderSbtDetail = (v: any) => (
    <div style={{ display: 'grid', gap: 8 }}>
      <div style={{ fontSize: 18, fontWeight: 800 }}>{v.t}</div>
      <div style={{ fontSize: 13, color: 'var(--color-muted)' }}>{v.issuer} · {v.status}</div>
      {v.contract && <div style={{ fontSize: 12.5, fontFamily: 'var(--font-mono)', color: 'var(--color-muted)', wordBreak: 'break-all' }}>컨트랙트: {v.contract}</div>}
      <p style={{ fontSize: 13, color: 'var(--color-muted)', margin: '4px 0 0' }}>Sepolia 체인에서 현 계정 주소로 조회된 <b>양도불가(SBT)</b> 인증토큰입니다. 메타버스 플랫폼에서 아바타 접근 자격으로 사용됩니다.</p>
    </div>
  )

  const sel = tab === 'vcs' ? detailVc : detailSbt
  const clearSel = () => (tab === 'vcs' ? setDetailVc(null) : setDetailSbt(null))
  const addHandler = () => { if (tab === 'vcs') { setErr(''); setAdding(true) } else { setSbtErr(''); setAddingSbt(true) } }
  const filterChips = (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {([['all', '전체', vcs.length], ['valid', '유효', vcs.length - expired], ['expired', '만료', expired]] as const).map(([k, l, n]) => (
        <button key={k} onClick={() => setVcFilter(k)} style={chipStyle(vcFilter === k)}>{l} {n}</button>
      ))}
    </div>
  )

  const List = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* 탭 */}
      <div style={{ display: 'flex', gap: 20, borderBottom: '1px solid var(--color-border)' }}>
        {([['vcs', `증명서 (VC) ${vcs.length}`], ['sbts', `인증토큰 (SBT) ${sbtList.length}`]] as const).map(([k, label]) => (
          <button key={k} onClick={() => goList(k)} style={{ border: 0, background: 'transparent', cursor: 'pointer', fontFamily: 'inherit', fontSize: 14, fontWeight: 700, padding: '8px 2px', marginBottom: -1, color: tab === k ? 'var(--color-fg)' : 'var(--color-muted)', borderBottom: tab === k ? '2px solid var(--accent-soft-fg)' : '2px solid transparent' }}>{label}</button>
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: isWide ? 'row' : 'column', gap: 16, alignItems: 'flex-start' }}>
        {/* 필터/기능 — 넓으면 좌측 세로, 좁으면 상단 가로(기능 전부 노출) */}
        <div style={isWide
          ? { flex: '0 0 188px', display: 'flex', flexDirection: 'column', gap: 12 }
          : { width: '100%', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
          <Button block={isWide} variant="primary" onClick={addHandler}>＋ {tab === 'vcs' ? '증명서 추가' : '인증토큰 추가'}</Button>
          {tab === 'sbts' && canIssue() && (
            <Button block={isWide} variant="line" onClick={() => { setReqErr(''); setReqOpen(true) }}>발급 요청 받기</Button>
          )}
          {tab === 'vcs' && <Button block={isWide} variant="line" onClick={() => setVp(true)}>제시 (VP)</Button>}
          {tab === 'vcs' && (isWide
            ? <div style={railCard}><div style={railHead}>상태 필터</div><div style={{ padding: 10 }}>{filterChips}</div></div>
            : filterChips)}
          {isWide && (
            <div style={railCard}>
              <div style={railHead}>{tab === 'vcs' ? '증명서 요약' : '인증토큰 요약'}</div>
              <div style={{ padding: 12, display: 'grid', gap: 7, fontSize: 12.5, color: 'var(--color-muted)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>보유</span><b style={{ color: 'var(--color-fg)' }}>{(tab === 'vcs' ? vcs.length : sbtList.length)}건</b></div>
                {tab === 'vcs' && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>만료·갱신</span><b style={{ color: expired ? 'var(--btn-warning-hover)' : 'var(--color-fg)' }}>{expired}건</b></div>}
              </div>
            </div>
          )}
        </div>

        {/* 목록 */}
        <section style={{ flex: isWide ? '1 1 300px' : '1 1 auto', width: isWide ? undefined : '100%', minWidth: 0, maxWidth: isWide ? 520 : 720, border: '1px solid var(--color-border-strong)', borderRadius: 8, background: 'var(--panel-bg)', overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 18px', borderBottom: '1px solid var(--color-border)' }}>
            <strong style={{ fontSize: 14.5 }}>{panelTitle}</strong>
            <span style={{ fontSize: 12, color: 'var(--color-muted)' }}>{(tab === 'vcs' ? vcsShown.length : sbtList.length)}건</span>
          </div>
          <div>
            {tab === 'vcs' ? vcsShown.map((vc, i) => {
              const st = computeStatus(vc); const { issued, until } = vcDates(vc); const on = detailVc === vc
              return (
                <div key={i} onClick={() => setDetailVc(vc)} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: i < vcsShown.length - 1 ? '1px solid var(--color-border)' : 'none', cursor: 'pointer', background: on ? 'var(--accent-soft-bg)' : 'transparent' }}>
                  <div style={{ width: 36, height: 36, borderRadius: 6, ...accentTile, display: 'grid', placeItems: 'center', flex: 'none' }}><Icon d={ICONS.doc} /></div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 13.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{vcTitle(vc)}</div>
                    <div style={{ fontSize: 12, color: 'var(--color-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {vcIssuer(vc)}
                      {historyOf(vc).length > 0 && <span style={{ marginLeft: 6, opacity: 0.85 }}>· 재발급 {historyOf(vc).length + 1}회</span>}
                    </div>
                  </div>
                  {!isWide && <div style={{ textAlign: 'right', fontSize: 11, color: 'var(--color-muted)', lineHeight: 1.5, flex: 'none' }}><div>발급 {issued || '—'}</div><div>{until ? `만료 ${until}` : '무기한'}</div></div>}
                  <Badge tone={st.tone}>{st.label}</Badge>
                </div>
              )
            }) : sbtList.map((v, i) => { const on = detailSbt === v; return (
              <div key={i} onClick={() => setDetailSbt(v)} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: i < sbtList.length - 1 ? '1px solid var(--color-border)' : 'none', cursor: 'pointer', background: on ? 'var(--accent-soft-bg)' : 'transparent' }}>
                <div style={{ width: 36, height: 36, borderRadius: 6, ...accentTile, display: 'grid', placeItems: 'center', flex: 'none' }}><Icon d={ICONS.token} /></div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 13.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.t}</div>
                  <div style={{ fontSize: 12, color: 'var(--color-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.issuer}</div>
                </div>
                {!isWide && <div style={{ textAlign: 'right', fontSize: 11, color: 'var(--color-muted)', lineHeight: 1.5, flex: 'none' }}><div>발급 {v.issued}</div><div>양도불가</div></div>}
                <Badge>{v.status}</Badge>
              </div>
            ) })}
            {(tab === 'vcs' ? vcsShown.length : sbtList.length) === 0 && <div style={{ padding: '30px 18px', textAlign: 'center', color: 'var(--color-muted)', fontSize: 13 }}>표시할 항목이 없습니다.</div>}
          </div>
        </section>

        {/* 상세 — 넓은 화면 우측 패널 (좁으면 모달로 표시) */}
        {isWide && (
          <section style={{ flex: '1 1 340px', minWidth: 300, display: 'flex', flexDirection: 'column', border: '1px solid var(--color-border-strong)', borderRadius: 8, background: 'var(--panel-bg)', overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 18px', borderBottom: '1px solid var(--color-border)' }}>
              <strong style={{ fontSize: 14.5 }}>{tab === 'vcs' ? '증명서 상세' : '인증토큰 상세'}</strong>
              <div style={{ flex: 1 }} />
              {sel && <button onClick={clearSel} title="선택 해제" style={{ border: 0, background: 'transparent', cursor: 'pointer', color: 'var(--color-muted)', fontSize: 20, lineHeight: 1 }}>×</button>}
            </div>
            <div style={{ padding: 18 }}>
              {sel ? (tab === 'vcs' ? renderVcDetail(detailVc) : renderSbtDetail(detailSbt))
                : <div style={{ color: 'var(--color-muted)', fontSize: 13, textAlign: 'center', padding: '48px 12px', lineHeight: 1.7 }}>목록에서 항목을 선택하면<br />여기에 상세가 표시됩니다.</div>}
            </div>
            {sel && tab === 'vcs' && <div style={{ padding: 14, borderTop: '1px solid var(--color-border)' }}><Button block variant="primary" onClick={() => setVp(true)}>이 증명서 제시 (VP)</Button></div>}
          </section>
        )}
      </div>
    </div>
  )

  // ── 활동 ──────────────────────────────────────────────────
  const Activity = (
    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
      <section style={{ flex: '1 1 440px', minWidth: 0, maxWidth: 720, border: '1px solid var(--color-border-strong)', borderRadius: 8, background: 'var(--panel-bg)', overflow: 'hidden' }}>
        <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--color-border)' }}><strong style={{ fontSize: 14.5 }}>활동 내역</strong></div>
        {activity.map((a, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '13px 18px', borderBottom: i < activity.length - 1 ? '1px solid var(--color-border)' : 'none' }}>
            <div style={{ width: 34, height: 34, borderRadius: 7, display: 'grid', placeItems: 'center', flex: 'none', ...accentTile }}><Icon d={a.d} size={16} /></div>
            <div style={{ flex: 1 }}><div style={{ fontSize: 13.5, fontWeight: 600 }}>{a.title}</div><div style={{ fontSize: 12, color: 'var(--color-muted)' }}>{a.sub}</div></div>
            <span style={{ fontSize: 12, color: 'var(--color-muted)' }}>{a.time}</span>
          </div>
        ))}
      </section>
      <aside style={{ flex: '1 1 250px', minWidth: 220, maxWidth: 300, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={railCard}>
          <div style={railHead}>요약</div>
          <div style={{ padding: 12, display: 'grid', gap: 7, fontSize: 12.5, color: 'var(--color-muted)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>총 활동</span><b style={{ color: 'var(--color-fg)' }}>{activity.length}건</b></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}><span>계정</span><b style={{ color: 'var(--color-fg)', fontFamily: 'var(--font-mono)' }}>{short(acc.address)}</b></div>
          </div>
        </div>
      </aside>
    </div>
  )

  // ── 설정 ──────────────────────────────────────────────────
  const Settings = (
    // 넓은 화면에서는 2열로 흐르는 masonry(CSS columns). 좁으면 1열.
    <div style={{ columnWidth: 440, columnGap: 16 }}>
      <Section title="일반" rows={[
        { label: '테마', ctrl: <ThemeToggle size={30} /> },
        { label: '자동 잠금', ctrl: (
          <select value={autoLock} onChange={(e) => setAutoLock(e.target.value)} style={selectStyle}>
            {['1분', '5분', '15분', '사용 안 함'].map((o) => <option key={o} value={o}>{o}</option>)}
          </select>) },
        { label: '언어', ctrl: (
          <select value={language} onChange={(e) => setLanguage(e.target.value)} style={selectStyle}>
            {['한국어', 'English'].map((o) => <option key={o} value={o}>{o}</option>)}
          </select>) },
      ]} />

      <Section title="보안" rows={[
        { label: '비밀번호 변경', ctrl: <Button size="sm" variant="ghost">변경</Button> },
        { label: '복구 구문(니모닉) 백업', ctrl: <Button size="sm" variant="ghost">백업</Button> },
        { label: '지금 잠금', ctrl: <Button size="sm" variant="ghost" onClick={() => wallet.lock()}>잠금</Button> },
      ]} />

      <Section title="네트워크" rows={[
        { label: '현재 네트워크', sub: 'Sepolia 테스트넷 · chainId 11155111', ctrl: <Button size="sm" variant="ghost">관리</Button> },
        { label: 'SBT 발급 컨트랙트', sub: 'YouthPassSBT · RegionalUnivPassSBT', ctrl: <Button size="sm" variant="ghost">보기</Button> },
      ]} />

      <Section title={`신뢰 발급기관 (화이트리스트 ${TRUST.length})`} rows={TRUST.map((n) => ({ label: n, ctrl: <Badge>신뢰됨</Badge> }))} />

      <Section title="연결된 서비스" rows={connected.map((c) => ({ label: c.name, sub: c.origin, ctrl: <Button size="sm" variant="ghost">연결 해제</Button> }))} />

      <Section title="개발자" rows={[
        { label: '데스크톱 브리지', sub: '확장 프로그램 연동 (Native Messaging)', ctrl: <Badge>연결됨</Badge> },
        { label: '발급 승인 테스트 (모의 수신)', ctrl: <Button size="sm" variant="ghost" onClick={simulateIssuance}>실행</Button> },
        { label: '개발 모드 자동 잠금 해제', ctrl: <Switch checked={devUnlock} onChange={() => setDevUnlock((v) => !v)} /> },
        { label: '데이터 초기화', ctrl: <Button size="sm" variant="ghost">초기화</Button> },
      ]} />

      <Section title="정보" rows={[
        { label: '버전', sub: 'DID&SBT Wallet 0.1.0' },
        { label: '연구과제', sub: 'ICT R&D RS-2023-00229400 · 충남대학교' },
        { label: '라이선스', ctrl: <Button size="sm" variant="ghost">보기</Button> },
      ]} />

      <Section title="계정" rows={[
        { label: '로그아웃', sub: '니모닉·모든 계정을 이 기기에서 제거하고 처음 화면으로 돌아갑니다', ctrl: <Button size="sm" variant="danger" onClick={() => setLogoutAsk(true)}>로그아웃</Button> },
      ]} />
    </div>
  )

  const content = active === 'home' ? Dashboard : (active === 'vcs' || active === 'sbts') ? List : active === 'activity' ? Activity : Settings
  const pageTitle = NAV.find((n) => n.key === active)?.label || '대시보드'

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '236px 1fr', width: '100%', height: '100%', background: 'var(--panel-soft)', color: 'var(--color-fg)', fontFamily: 'var(--font-sans)' }}>
      {/* 사이드바 */}
      <aside style={{ background: 'var(--panel-bg)', borderRight: '1px solid var(--color-border-strong)', display: 'flex', flexDirection: 'column', padding: '16px 12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 8px 16px' }}>
          <div style={{ width: 32, height: 32, borderRadius: 7, background: 'linear-gradient(135deg, var(--btn-primary), var(--btn-secondary))', color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: 15 }}>W</div>
          <div style={{ fontWeight: 800, fontSize: 14.5, letterSpacing: '-0.02em' }}>DID&amp;SBT Wallet</div>
        </div>
        <nav style={{ display: 'grid', gap: 1 }}>
          {NAV.map((n) => {
            const isOn = active === n.key
            return (
              <button key={n.key} onClick={() => navClick(n.key)} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '9px 12px', borderRadius: 6, border: 0, borderLeft: isOn ? '3px solid var(--accent-soft-fg)' : '3px solid transparent', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13.5, textAlign: 'left', background: isOn ? 'var(--accent-soft-bg)' : 'transparent', color: isOn ? 'var(--accent-soft-fg)' : 'var(--color-fg)', fontWeight: isOn ? 700 : 500 }}><Icon d={n.d} />{n.label}</button>
            )
          })}
        </nav>
        <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', border: '1px solid var(--color-border)', borderRadius: 6, fontSize: 12.5 }}>
          <span style={{ width: 8, height: 8, borderRadius: 999, background: '#10b981' }} /><span style={{ color: 'var(--color-muted)' }}>Sepolia 연결됨</span>
        </div>
      </aside>

      {/* 메인 */}
      <main style={{ display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
        <header style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 22px', borderBottom: '1px solid var(--color-border-strong)', background: 'var(--panel-bg)' }}>
          <strong style={{ fontSize: 15 }}>{pageTitle}</strong>
          <div style={{ flex: 1 }} />
          <button onClick={() => setAccOpen(true)} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '6px 12px 6px 6px', borderRadius: 6, border: '1px solid var(--color-border)', background: 'var(--panel-bg)', cursor: 'pointer', fontFamily: 'inherit' }}>
            <span style={avatar(24, acc.address)} />
            <span style={{ fontWeight: 700, fontSize: 13 }}>{acc.name}</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--color-muted)' }}>{short(acc.address)}</span>
            <span style={{ color: 'var(--color-muted)', fontSize: 11 }}>▾</span>
          </button>
          <ThemeToggle />
          <button title="잠금" onClick={() => wallet.lock()} style={{ border: '1px solid var(--color-border)', background: 'var(--panel-bg)', borderRadius: 6, width: 34, height: 34, cursor: 'pointer', color: 'var(--color-muted)' }}>🔒</button>
        </header>

        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', padding: 22, maxWidth: active === 'settings' ? 1300 : ((active === 'vcs' || active === 'sbts') && isWide) ? 1400 : 1120, width: '100%', margin: '0 auto', overflow: 'auto' }}>
          {content}
        </div>
      </main>

      {/* 증명서 추가 */}
      <Modal open={adding} title="증명서(VC) 추가" onClose={() => setAdding(false)}
        footer={<><Button variant="ghost" onClick={() => setAdding(false)}>취소</Button><Button variant="primary" onClick={addVc} disabled={!paste.trim()}>등록</Button></>}>
        <p style={{ margin: '0 0 10px', fontSize: 13, color: 'var(--color-muted)' }}>발급받은 VC 의 JSON 을 붙여넣어 지갑에 등록합니다.</p>
        <textarea value={paste} onChange={(e) => { setPaste(e.target.value); setErr('') }} placeholder='{ "type": ["VerifiableCredential", ...], "credentialSubject": {...}, "proof": {...} }'
          style={{ width: '100%', height: 200, fontFamily: 'var(--font-mono)', fontSize: 12, padding: 12, borderRadius: 6, border: '1px solid var(--color-border)', background: 'var(--panel-soft)', color: 'var(--color-fg)', resize: 'vertical', outline: 'none' }} />
        {err && <div style={{ marginTop: 8, fontSize: 12.5, color: 'var(--btn-danger)' }}>{err}</div>}
      </Modal>

      {/* VC 상세 (좁은 화면 전용 — 넓으면 우측 패널) */}
      <Modal open={!!detailVc && !isWide} title="증명서 상세" onClose={() => setDetailVc(null)} footer={<Button variant="ghost" onClick={() => setDetailVc(null)}>닫기</Button>}>
        {detailVc && renderVcDetail(detailVc)}
      </Modal>

      {/* 인증토큰 추가(컨트랙트 조회) */}
      {/* 플랫폼이 준 발급 요청 가져오기 */}
      <Modal open={reqOpen} title="발급 요청 받기" onClose={() => setReqOpen(false)}
        footer={<><Button variant="ghost" onClick={() => setReqOpen(false)}>취소</Button>
                 <Button variant="primary" disabled={reqBusy || !reqInput.trim()} onClick={loadRequest}>{reqBusy ? '확인 중…' : '가져오기'}</Button></>}>
        <div style={{ display: 'grid', gap: 10 }}>
          <div style={{ fontSize: 13, color: 'var(--color-muted)' }}>
            메타버스 플랫폼에서 발급 요청 주소를 복사하거나 QR 을 읽어 붙여넣으세요.
            지갑이 그 컨트랙트에 직접 물어 내용을 확인한 뒤 보여줍니다.
          </div>
          <Field label="요청 주소 또는 JSON">
            <textarea value={reqInput} onChange={(e) => setReqInput(e.target.value)}
              placeholder="http://localhost:20260/pass-request/…"
              style={{ width: '100%', height: 90, fontFamily: 'var(--font-mono)', fontSize: 12, padding: 10, borderRadius: 6, border: '1px solid var(--color-border)', background: 'var(--panel-bg)', color: 'var(--color-fg)', resize: 'vertical', outline: 'none' }} />
          </Field>
          {reqErr && <div style={{ fontSize: 12.5, color: 'var(--btn-danger)', whiteSpace: 'pre-wrap' }}>{reqErr}</div>}
        </div>
      </Modal>

      {/* 요청 승인 — 사이트의 주장이 아니라 체인에서 읽은 값을 보여준다 */}
      <Modal open={!!checked} title="인증토큰 발급 요청" onClose={() => setChecked(null)}
        footer={<><Button variant="ghost" onClick={() => setChecked(null)}>거절</Button>
                 <Button variant="primary" disabled={!!issuing} onClick={() => checked && runRequestedIssue(checked)}>{issuing ?? '승인 · 발급받기'}</Button></>}>
        {checked && (() => { const r = checked.request; const o = checked.onChain; return (
          <div style={{ display: 'grid', gap: 12, fontSize: 13 }}>
            <div>
              <b>{r.origin.name}</b> 이(가) 인증토큰 발급을 요청했습니다.
              <div style={{ fontSize: 12, color: 'var(--color-muted)', marginTop: 4 }}>{r.purpose}</div>
            </div>
            {checked.warnings.length > 0 && (
              <div style={{ border: '1px solid var(--btn-danger)', borderRadius: 6, padding: 10, fontSize: 12.5 }}>
                {checked.warnings.map((w, i) => <div key={i}>⚠ {w}</div>)}
              </div>
            )}
            <div style={{ border: '1px solid var(--color-border)', borderRadius: 8, overflow: 'hidden' }}>
              <div style={{ padding: '8px 12px', fontSize: 11.5, color: 'var(--color-muted)', borderBottom: '1px solid var(--color-border)' }}>
                체인에서 확인한 내용 {checked.known ? '· 알려진 컨트랙트' : '· 처음 보는 컨트랙트'}
              </div>
              {[
                ['발급 대상', `${o.tokenName} (${o.tokenSymbol})`],
                ['컨트랙트', r.contract],
                ['패스 종류', `${SCENARIO_LABEL_MAP[r.scenario]} · passType ${r.passType}`],
                ['유효기간', formatValidity(o.validitySeconds)],
                ['검증자', o.verifier],
              ].map(([k, v]) => (
                <div key={k} style={{ display: 'flex', gap: 10, padding: '8px 12px', fontSize: 12.5, borderTop: '1px solid var(--color-border)' }}>
                  <span style={{ width: 72, flex: 'none', color: 'var(--color-muted)' }}>{k}</span>
                  <span style={{ wordBreak: 'break-all', fontFamily: /컨트랙트|검증자/.test(k) ? 'var(--font-mono)' : 'inherit' }}>{v}</span>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--color-muted)' }}>
              승인하면 영지식 증명을 만들어 이 컨트랙트에 제출합니다. 증명서 원본은 전송되지 않습니다.
            </div>
          </div>
        ) })()}
      </Modal>

      {/* 발급 결과 — 실제 온체인 트랜잭션 결과다(목데이터 아님) */}
      <Modal open={!!issuedResult} title="인증토큰 발급 완료" onClose={() => setIssuedResult(null)}
        footer={<Button variant="primary" onClick={() => { setIssuedResult(null); goList('sbts') }}>인증토큰 보기</Button>}>
        {issuedResult && (
          <div style={{ display: 'grid', gap: 10, fontSize: 13 }}>
            <div>{SCENARIO_LABEL_MAP[issuedResult.scenario as keyof typeof SCENARIO_LABEL_MAP] ?? issuedResult.scenario} 패스가 발급되었습니다.</div>
            <div style={{ display: 'grid', gap: 6, fontSize: 12, color: 'var(--color-muted)' }}>
              <div>토큰 ID: <b style={{ color: 'var(--color-fg)' }}>{issuedResult.tokenId ?? '-'}</b></div>
              <div style={{ wordBreak: 'break-all' }}>트랜잭션: <span style={{ fontFamily: 'var(--font-mono)' }}>{issuedResult.txHash}</span></div>
              <div style={{ wordBreak: 'break-all' }}>바인딩 지갑: <span style={{ fontFamily: 'var(--font-mono)' }}>{issuedResult.boundWallet}</span></div>
            </div>
            <Button size="sm" variant="line" onClick={() => copyText(issuedResult.txHash)}>트랜잭션 해시 복사</Button>
          </div>
        )}
      </Modal>

      {/* 발급 실패 */}
      <Modal open={!!issueErr} title="인증토큰 발급 실패" onClose={() => setIssueErr('')}
        footer={<Button variant="ghost" onClick={() => setIssueErr('')}>닫기</Button>}>
        <div style={{ fontSize: 13, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{issueErr}</div>
      </Modal>

      <Modal open={addingSbt} title="인증토큰(SBT) 추가" onClose={() => setAddingSbt(false)}
        footer={<><Button variant="ghost" onClick={() => setAddingSbt(false)}>취소</Button><Button variant="primary" onClick={addSbt} disabled={!sbtContract.trim()}>조회 후 추가</Button></>}>
        <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--color-muted)' }}>
          인증토큰(SBT)은 자동 조회되지 않습니다. <b>발급 컨트랙트 주소</b>를 입력하면 <b>현 계정 주소</b>로 Sepolia 체인에서 보유 토큰을 조회해 추가합니다.
        </p>
        <div style={{ display: 'grid', gap: 12 }}>
          <Field label="발급 컨트랙트 주소" value={sbtContract} onChange={(e) => { setSbtContract(e.target.value); setSbtErr('') }} placeholder="0x…" />
          <Field label="표시 이름 (선택)" value={sbtName} onChange={(e) => setSbtName(e.target.value)} placeholder="예: 지역청년패스" />
        </div>
        {sbtErr && <div style={{ marginTop: 8, fontSize: 12.5, color: 'var(--btn-danger)' }}>{sbtErr}</div>}
      </Modal>

      {/* SBT 상세 (좁은 화면 전용 — 넓으면 우측 패널) */}
      <Modal open={!!detailSbt && !isWide} title="인증토큰(SBT) 상세" onClose={() => setDetailSbt(null)} footer={<Button variant="ghost" onClick={() => setDetailSbt(null)}>닫기</Button>}>
        {detailSbt && renderSbtDetail(detailSbt)}
      </Modal>

      {/* 계정 관리 */}
      <Modal open={accOpen} title="계정 관리" onClose={() => { setAccOpen(false); setEditId(null) }}
        footer={<><Button variant="ghost" onClick={() => { setAccOpen(false); setEditId(null) }}>닫기</Button><Button variant="primary" onClick={addAccount}>＋ 계정 추가</Button></>}>
        <div style={{ display: 'grid', gap: 7 }}>
          {accounts.map((a) => { const on = a.id === acc.id; return (
            <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '9px 11px', borderRadius: 6, border: `1px solid ${on ? 'var(--accent-soft-fg)' : 'var(--color-border)'}`, background: on ? 'var(--accent-soft-bg)' : 'var(--panel-bg)' }}>
              <span style={avatar(32, a.address)} />
              <div style={{ flex: 1, minWidth: 0 }}>
                {editId === a.id
                  ? <input autoFocus value={editName} onChange={(e) => setEditName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') saveRename() }}
                      style={{ width: '100%', fontFamily: 'inherit', fontSize: 14, fontWeight: 700, padding: '4px 6px', border: '1px solid var(--color-border)', borderRadius: 4, background: 'var(--panel-bg)', color: 'var(--color-fg)', outline: 'none' }} />
                  : <div style={{ fontWeight: 700, fontSize: 14 }}>{a.name}</div>}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--color-muted)', marginTop: 2 }}>
                  <span style={{ fontFamily: 'var(--font-mono)' }} title={a.did}>{short(a.address)}</span>
                  <button title="주소 복사" onClick={() => copyText(a.address)} style={{ border: 0, background: 'transparent', color: 'var(--color-muted)', cursor: 'pointer', display: 'grid', placeItems: 'center' }}><Icon d={ICONS.copy} size={13} /></button>
                </div>
              </div>
              {editId === a.id
                ? <Button size="sm" variant="primary" onClick={saveRename}>저장</Button>
                : <>
                    {on ? <Badge>활성</Badge> : <Button size="sm" variant="line" onClick={() => wallet.switchAccount(a.id)}>선택</Button>}
                    <Button size="sm" variant="ghost" onClick={() => startRename(a.id, a.name)}>이름</Button>
                  </>}
            </div>
          ) })}
        </div>
      </Modal>

      {/* 로그아웃(지갑 제거) */}
      <Modal open={logoutAsk} title="로그아웃" onClose={() => setLogoutAsk(false)}
        footer={<><Button variant="ghost" onClick={() => setLogoutAsk(false)}>취소</Button><Button variant="danger" onClick={async () => { await wallet.reset(); setLogoutAsk(false); setAccOpen(false); setEditId(null) }}>로그아웃</Button></>}>
        <div style={{ display: 'grid', gap: 10, fontSize: 13.5, lineHeight: 1.6 }}>
          <p style={{ margin: 0 }}>이 지갑의 <b>복구구문(니모닉)과 모든 계정</b>이 이 기기에서 제거됩니다.</p>
          <div style={{ padding: '10px 12px', borderRadius: 6, border: '1px solid var(--btn-danger)', background: 'var(--btn-danger-light)', color: 'var(--btn-danger-hover)', fontSize: 12.5 }}>
            밖에 백업(메모)해 둔 복구구문이 없으면 이 계정들은 <b>복구할 수 없습니다.</b>
          </div>
          <p style={{ margin: 0, color: 'var(--color-muted)' }}>로그아웃 후 <b>새 지갑을 만들거나</b>, 백업해 둔 <b>복구구문으로 다시 불러올 수</b> 있습니다.</p>
        </div>
      </Modal>

      {/* 발급 승인 (발급기관 웹 → 데스크톱 수신) */}
      <Modal open={!!issuanceReq} title="증명서 발급 승인" onClose={() => { issuanceReq?.respond(false); setIssuanceReq(null) }}
        footer={<><Button variant="ghost" onClick={() => { issuanceReq?.respond(false); setIssuanceReq(null) }}>거절</Button><Button variant="primary" onClick={() => { issuanceReq?.respond(true); setIssuanceReq(null) }}>승인 · 저장</Button></>}>
        {issuanceReq && (() => { const p = issuanceReq.payload || {}; const vc = p.vc; return (
          <div style={{ display: 'grid', gap: 14 }}>
            <div style={{ fontSize: 13, color: 'var(--color-muted)' }}><b style={{ color: 'var(--color-fg)' }}>{p.origin || '알 수 없는 사이트'}</b> 에서 아래 증명서를 발급합니다.</div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 800 }}>{vcTitle(vc)}</div>
              <div style={{ fontSize: 12.5, color: 'var(--color-muted)' }}>{vcIssuer(vc)}</div>
            </div>
            <div>
              <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 8 }}>포함된 신원정보</div>
              <div style={{ border: '1px solid var(--color-border)', borderRadius: 6, overflow: 'hidden' }}>
                {claimRows(vc).map((r, i, arr) => (
                  <div key={i} style={{ display: 'flex', gap: 12, padding: '8px 12px', fontSize: 13, borderBottom: i < arr.length - 1 ? '1px solid var(--color-border)' : 'none' }}>
                    <span style={{ width: 110, flex: 'none', color: 'var(--color-muted)' }}>{r.label}</span>
                    <span style={{ wordBreak: 'break-all', fontFamily: /주소|번호|DID/.test(r.label) ? 'var(--font-mono)' : 'inherit' }}>{r.value}</span>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--color-muted)' }}>저장 계정: <b style={{ color: 'var(--color-fg)' }}>{p.accountName || acc.name}</b> · <span style={{ fontFamily: 'var(--font-mono)' }}>{short(p.address || acc.address)}</span></div>
          </div>
        ) })()}
      </Modal>

      {/* 제시(VP) */}
      <Modal open={vp} title="증명서 제시 (VP)" onClose={() => setVp(false)}
        footer={<><Button variant="ghost" onClick={() => setVp(false)}>취소</Button><Button variant="primary" onClick={() => setVp(false)}>영지식 증명 제출</Button></>}>
        검증자에게 <b>대전 거주 + 만 19~34세</b> 조건만 영지식(ZK)으로 증명합니다. 생년월일·주소 원본은 공개되지 않습니다.
      </Modal>
    </div>
  )
}
