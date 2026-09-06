// ZKCredentialSBT 온체인 상태 조회.
// 사용법:
//   node scripts/query-sbt.js                      전체 요약 (등록된 패스 타입 + 발급 현황)
//   node scripts/query-sbt.js <보유자주소>          해당 지갑의 패스 보유·유효 여부
//   RPC_URL=... node scripts/query-sbt.js          RPC 재지정

const { ethers } = require('ethers');
const { getDeploymentConfig, PASS_TYPE } = require('../../verifier-web/src/config/deployment.config');

const cfg = getDeploymentConfig();
const CONTRACT_ADDRESS = cfg.contract.zkCredentialSBT;
const RPC_URL = process.env.RPC_URL || cfg.network.rpcUrl;

const ABI = [
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function owner() view returns (address)',
  'function nextTokenId() view returns (uint256)',
  'function passTypes(uint256) view returns (address verifier, uint64 validitySeconds, bool retired)',
  'function tokenOf(address, uint256) view returns (uint256)',
  'function typeOf(uint256) view returns (uint256)',
  'function expiresAt(uint256) view returns (uint64)',
  'function isValid(uint256) view returns (bool)',
  'function hasValidPass(address, uint256) view returns (bool)',
  'function ownerOf(uint256) view returns (address)',
  'function tokenURI(uint256) view returns (string)',
  'function locked(uint256) view returns (bool)',
];

// 토큰의 expiresAt 은 절대 시각, 패스 타입의 validitySeconds 는 기간 — 표시를 구분한다.
const fmtExpiry = (e) => (e === 0n ? '무기한' : new Date(Number(e) * 1000).toISOString().slice(0, 10));
const fmtDuration = (s) => (s === 0n ? '무기한' : `${Number(s) / 86400}일`);

async function main() {
  if (!CONTRACT_ADDRESS) {
    console.error('배포 주소가 비어 있습니다. deployment.config 를 확인하세요.');
    process.exit(1);
  }
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const c = new ethers.Contract(CONTRACT_ADDRESS, ABI, provider);

  console.log(`\n네트워크 : ${cfg.network.name} (${cfg.network.chainId})`);
  console.log(`컨트랙트 : ${CONTRACT_ADDRESS}`);
  console.log(`토큰     : ${await c.name()} (${await c.symbol()})`);
  console.log(`소유자   : ${await c.owner()}`);

  console.log('\n── 등록된 패스 타입 ──');
  for (const [label, id] of Object.entries(PASS_TYPE)) {
    const t = await c.passTypes(id);
    const state = t.verifier === ethers.ZeroAddress ? '미등록' : t.retired ? '폐지됨' : '활성';
    console.log(`  [${id}] ${label.padEnd(14)} ${state.padEnd(6)} verifier=${t.verifier} 유효기간=${fmtDuration(t.validitySeconds)}`);
  }

  const holder = process.argv[2];
  if (holder) {
    console.log(`\n── 보유 현황: ${holder} ──`);
    for (const [label, id] of Object.entries(PASS_TYPE)) {
      const tokenId = await c.tokenOf(holder, id);
      if (tokenId === 0n) {
        console.log(`  [${id}] ${label.padEnd(14)} 미보유`);
        continue;
      }
      const [valid, exp, uri, lock] = await Promise.all([
        c.isValid(tokenId),
        c.expiresAt(tokenId),
        c.tokenURI(tokenId),
        c.locked(tokenId),
      ]);
      console.log(
        `  [${id}] ${label.padEnd(14)} tokenId=${tokenId} ${valid ? '유효' : '만료'} ` +
          `만료일=${fmtExpiry(exp)} soulbound=${lock} uri=${uri}`,
      );
    }
  } else {
    const next = await c.nextTokenId();
    const issued = next - 1n;
    console.log(`\n── 발급 현황 ── 총 ${issued}건`);
    for (let id = 1n; id <= issued; id++) {
      const [ownerAddr, passType, valid, exp] = await Promise.all([
        c.ownerOf(id),
        c.typeOf(id),
        c.isValid(id),
        c.expiresAt(id),
      ]);
      console.log(`  tokenId=${id} passType=${passType} ${valid ? '유효' : '만료'} 만료일=${fmtExpiry(exp)} 보유자=${ownerAddr}`);
    }
    console.log('\n(보유자 주소를 인자로 주면 해당 지갑 기준으로 조회합니다)');
  }
  console.log('');
}

main().catch((e) => {
  console.error(e?.message || e);
  process.exit(1);
});
