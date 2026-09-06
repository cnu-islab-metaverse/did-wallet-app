import express, { Request, Response } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'path';
import { createResidencyVpRequest } from './vp/requestGenerator';
import QRCode from 'qrcode';
import { createPassRequest, isScenario, scenarioLabel } from './pass/passRequest';

const app = express();
const PORT = process.env.PORT || 20252;

app.use(cors());
app.use(express.json());
app.use(cookieParser());
// index:false — '/' 는 아래 라우트가 플랫폼 화면을 내주게 한다(static 이 먼저 index.html 을 잡지 않도록).
app.use(express.static(path.join(__dirname, 'static'), { index: false }));
// Serve circuit assets (wasm/zkey/vk)
app.use('/circuit', express.static(path.join(__dirname, '..', 'circuit')));
// Serve config files
app.use('/config', express.static(path.join(__dirname, 'config')));

// ── 패스 발급 요청 ───────────────────────────────────────────────────────
// 검증자가 '무엇을 증명해 어디에 제출하라' 를 지갑에 알린다. 지갑은 이 값을 그대로 믿지 않고
// contract·passType 을 온체인으로 다시 확인한다.
const passRequests = new Map<string, ReturnType<typeof createPassRequest>>();

function baseUrlOf(req: Request): string {
  const host = req.get('host');
  return `${req.protocol}://${Array.isArray(host) ? host[0] : host ?? 'localhost'}`;
}

// 요청 생성 → 지갑이 가져갈 URL 을 돌려준다.
app.post('/pass-request', (req: Request, res: Response) => {
  const scenario = (req.body?.scenario ?? req.query.scenario) as unknown;
  if (!isScenario(scenario)) return res.status(400).json({ ok: false, error: '알 수 없는 시나리오' });
  const pr = createPassRequest(scenario, baseUrlOf(req));
  passRequests.set(pr.id, pr);
  res.json({ ok: true, id: pr.id, url: `${baseUrlOf(req)}/pass-request/${pr.id}`, request: pr });
});

// 지갑이 이 URL 을 가져간다(붙여넣기 또는 QR).
app.get('/pass-request/:id', (req: Request, res: Response) => {
  const pr = passRequests.get(String(req.params.id));
  if (!pr) return res.status(404).json({ ok: false, error: '만료되었거나 없는 요청입니다' });
  res.json(pr);
});

// 시연용 QR — 같은 URL 을 담는다. 데스크톱 지갑은 붙여넣기를 쓰고,
// QR 은 화면 시연과 향후 모바일 지갑·확장 연동을 위한 것이다.
app.get('/pass-request/:id/qr.svg', async (req: Request, res: Response) => {
  const pr = passRequests.get(String(req.params.id));
  if (!pr) return res.status(404).send('not found');
  const svg = await QRCode.toString(`${baseUrlOf(req)}/pass-request/${pr.id}`, { type: 'svg', margin: 1, width: 240 });
  res.type('image/svg+xml').send(svg);
});

// Health
app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok' });
});

// Issue a VP request for a given region (query ?region=대전시 유성구)
app.get('/vp-request', (req: Request, res: Response) => {
  const region = (req.query.region as string) || '대전시 유성구';
  const request = createResidencyVpRequest(region);
  res.json(request);
});

// Prepare zk-proof inputs for the selected VC type and region
app.get('/zk-prepare', (req: Request, res: Response) => {
  const region = (req.query.region as string) || '대전시 유성구';
  const vcType = (req.query.vcType as string) || 'rrn';

  // Dummy prepare data: 300 characters of '0'
  const prepareData = '0'.repeat(300);
  res.json({ ok: true, data: prepareData, meta: { region, vcType, estimatedTimeSec: 30 } });
});

// Accept a VP submission and verify residency, then issue demo SBT
app.post('/submit-vp', (req: Request, res: Response) => {
  try {
    const { vp, region } = req.body || {};
    if (!vp || !vp.verifiableCredential || !Array.isArray(vp.verifiableCredential)) {
      return res.status(400).json({ ok: false, error: 'Invalid VP payload' });
    }

    const regionName = typeof region === 'string' ? region : '대전시 유성구';

    // Very simple residency check: find any VC with credentialSubject.residentialAddress including the region
    const matchedVC = vp.verifiableCredential.find((vc: any) => {
      try {
        const data = typeof vc === 'string' ? JSON.parse(vc) : vc;
        const address: string | undefined = data?.credentialSubject?.residentialAddress;
        return !!address && address.includes(regionName);
      } catch {
        return false;
      }
    });

    if (!matchedVC) {
      return res.status(403).json({ ok: false, error: 'Residency not proven for requested region' });
    }

    // 지역청년패스 SBT 발급 (non-transferable token metadata)
    // ERC-721 표준 메타데이터 형식 준수
    const now = new Date().toISOString();
    const timestamp = Date.now();
    
    // 지역별 청년패스 이미지 URL (실제 서비스에서는 IPFS 또는 CDN 사용 권장)
    // 현재는 대전지역 발급 과정만 구현되지만, 다른 지역도 확장 가능
    const regionImageMap: { [key: string]: string } = {
      '서울특별시': 'https://images.unsplash.com/photo-1573804633927-bfcbcd909acd?w=400',
      '부산광역시': 'https://images.unsplash.com/photo-1565793298595-6a879b1d9492?w=400',
      '대전광역시': 'https://www.daejeon.go.kr/images/drh/sub06/dj_siki.png', // 대전광역시 공식 로고
      '인천광역시': 'https://images.unsplash.com/photo-1547036967-23d11aacaee0?w=400',
      '광주광역시': 'https://images.unsplash.com/photo-1494522358652-f8aa74bfc3ca?w=400',
      '대구광역시': 'https://images.unsplash.com/photo-1531590878845-12627191e687?w=400',
      '울산광역시': 'https://images.unsplash.com/photo-1477959858617-67f85cf4f1df?w=400',
      '세종특별자치시': 'https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?w=400'
    };
    
    // 기본 이미지 또는 지역별 이미지 사용
    const defaultImage = 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=400';
    const imageUrl = regionImageMap[regionName] || defaultImage;
    
    const sbt = {
      // ERC-721 표준 메타데이터 필드
      name: `${regionName} 지역청년패스`,
      description: `${regionName} 거주 인증을 완료한 청년에게 발급되는 지역청년패스 SBT입니다. 이 토큰은 양도할 수 없으며, 지역청년 혜택 이용 시 거주 인증을 증명합니다.`,
      image: imageUrl,
      
      // 표준 attributes (배열 형식)
      attributes: [
        {
          trait_type: '패스 유형',
          value: '지역청년패스'
        },
        {
          trait_type: '지역',
          value: regionName
        },
        {
          trait_type: '발급일시',
          value: now
        },
        {
          trait_type: '토큰 유형',
          value: 'Soulbound Token'
        },
        {
          trait_type: '대상',
          value: '청년 (만 18세 ~ 34세)'
        }
      ],
      
      // SBT 특화 필드 (추가 정보)
      id: `sbt:youth-pass:${encodeURIComponent(regionName)}:${timestamp}`,
      type: ['SoulboundToken', 'RegionYouthPass', 'RegionResidencySBT'],
      issuedAt: now,
      
      // For demo only: include VC reference if present
      proof: {
        type: 'ReferenceCredential',
        credentialId: (typeof matchedVC === 'string' ? JSON.parse(matchedVC) : matchedVC).id || null
      },
      
      // 외부 링크 (선택사항)
      external_url: `https://verifier.example.kr/youth-pass/${encodeURIComponent(regionName)}`
    };

    return res.json({ ok: true, sbt });
  } catch (error: any) {
    return res.status(500).json({ ok: false, error: error?.message || 'Internal error' });
  }
});

// 메인 = 데모 메타버스 플랫폼 화면(발급 요청을 만들어 QR·주소로 지갑에 넘긴다).
app.get('/', (_req: Request, res: Response) => {
  res.sendFile(path.join(__dirname, 'static', 'platform', 'index.html'));
});

// 이전 데모(비-ZK 스텁 /submit-vp 경로)는 참고용으로 남겨둔다.
app.get('/legacy', (_req: Request, res: Response) => {
  res.sendFile(path.join(__dirname, 'static', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Verifier service running on http://localhost:${PORT}`);
});


