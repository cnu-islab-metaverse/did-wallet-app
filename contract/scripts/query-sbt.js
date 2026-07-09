// Anvil 컨트랙트 상태 조회 스크립트
// 사용법: node scripts/query-sbt.js [주소]

const { ethers } = require('ethers');

const CONTRACT_ADDRESS = '0x0d2aa97CbBC38DBE72529169A931C5f6A10d62BE';
const RPC_URL = 'http://localhost:8545';

// ERC721 ABI (필요한 함수만)
const ERC721_ABI = [
  'function balanceOf(address owner) external view returns (uint256)',
  'function ownerOf(uint256 tokenId) external view returns (address)',
  'function tokenURI(uint256 tokenId) external view returns (string)',
  'function totalSupply() external view returns (uint256)',
  'function name() external view returns (string)',
  'function symbol() external view returns (string)',
];

// CityYouthPassSBT ABI
const SBT_ABI = [
  ...ERC721_ABI,
  'function hasMinted(address) external view returns (bool)',
  'function nextTokenId() external view returns (uint256)',
  'function locked(uint256 tokenId) external view returns (bool)',
];

async function queryContract(address = null) {
  try {
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const contract = new ethers.Contract(CONTRACT_ADDRESS, SBT_ABI, provider);

    console.log('\n=== CityYouthPassSBT 컨트랙트 상태 ===\n');
    
    // 컨트랙트 기본 정보
    const name = await contract.name();
    const symbol = await contract.symbol();
    const nextTokenId = await contract.nextTokenId();
    
    console.log(`컨트랙트 주소: ${CONTRACT_ADDRESS}`);
    console.log(`이름: ${name}`);
    console.log(`심볼: ${symbol}`);
    console.log(`다음 토큰 ID: ${nextTokenId.toString()}`);
    console.log(`총 발급된 토큰 수: ${nextTokenId - 1n}\n`);

    // 특정 주소 조회
    if (address) {
      console.log(`=== 주소 조회: ${address} ===\n`);
      
      const balance = await contract.balanceOf(address);
      const hasMinted = await contract.hasMinted(address);
      
      console.log(`잔액 (보유 토큰 수): ${balance.toString()}`);
      console.log(`발급 여부: ${hasMinted ? '발급됨' : '미발급'}\n`);

      if (balance > 0n) {
        console.log('보유 토큰:');
        // balanceOf가 0보다 크면 토큰이 있는 것이므로, 모든 토큰을 확인
        // ERC721의 balanceOf는 특정 주소가 가진 토큰 수만 반환하므로,
        // 실제로 어떤 토큰을 가지고 있는지는 이벤트 로그를 확인해야 함
        // 여기서는 간단히 nextTokenId까지 확인
        for (let i = 1; i < Number(nextTokenId); i++) {
          try {
            const owner = await contract.ownerOf(i);
            if (owner.toLowerCase() === address.toLowerCase()) {
              const tokenURI = await contract.tokenURI(i);
              const isLocked = await contract.locked(i);
              console.log(`  Token ID: ${i}`);
              console.log(`    소유자: ${owner}`);
              console.log(`    URI: ${tokenURI}`);
              console.log(`    잠금 상태: ${isLocked ? '잠김 (Soulbound)' : '잠금 해제'}\n`);
            }
          } catch (e) {
            // 토큰이 없으면 무시
          }
        }
      }
    } else {
      // 모든 발급된 토큰 조회
      if (nextTokenId > 1n) {
        console.log('=== 모든 발급된 토큰 ===\n');
        for (let i = 1; i < Number(nextTokenId); i++) {
          try {
            const owner = await contract.ownerOf(i);
            const tokenURI = await contract.tokenURI(i);
            const isLocked = await contract.locked(i);
            console.log(`Token ID: ${i}`);
            console.log(`  소유자: ${owner}`);
            console.log(`  URI: ${tokenURI}`);
            console.log(`  잠금 상태: ${isLocked ? '잠김 (Soulbound)' : '잠금 해제'}\n`);
          } catch (e) {
            console.log(`Token ID: ${i} - 조회 실패`);
          }
        }
      } else {
        console.log('발급된 토큰이 없습니다.\n');
      }

      // Anvil 기본 계정들의 발급 상태 확인
      console.log('=== Anvil 기본 계정 발급 상태 ===\n');
      const anvilAccounts = [
        '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
        '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
        '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
      ];

      for (const addr of anvilAccounts) {
        try {
          const hasMinted = await contract.hasMinted(addr);
          const balance = await contract.balanceOf(addr);
          console.log(`${addr}`);
          console.log(`  발급 여부: ${hasMinted ? '✓ 발급됨' : '✗ 미발급'}`);
          console.log(`  보유 토큰 수: ${balance.toString()}\n`);
        } catch (e) {
          console.log(`${addr} - 조회 실패: ${e.message}\n`);
        }
      }
    }

    // 최근 트랜잭션 확인 (간단한 버전)
    console.log('=== 최근 블록 확인 ===\n');
    const blockNumber = await provider.getBlockNumber();
    console.log(`현재 블록 번호: ${blockNumber}`);
    
    if (blockNumber > 0) {
      const latestBlock = await provider.getBlock(blockNumber, true);
      console.log(`최근 블록의 트랜잭션 수: ${latestBlock?.transactions?.length || 0}`);
    }

  } catch (error) {
    console.error('오류:', error.message);
    if (error.data) {
      console.error('상세 정보:', error.data);
    }
  }
}

// 명령줄 인자로 주소를 받거나 전체 조회
const address = process.argv[2] || null;
if (address && !ethers.isAddress(address)) {
  console.error('올바른 이더리움 주소를 입력해주세요.');
  process.exit(1);
}

queryContract(address);

