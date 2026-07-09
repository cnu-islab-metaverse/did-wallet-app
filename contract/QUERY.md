# Anvil 컨트랙트 상태 조회 가이드

## 방법 1: Node.js 스크립트 사용 (권장)

### 1. 필요한 패키지 설치
```bash
cd contract
npm init -y
npm install ethers
```

### 2. 스크립트 실행
```bash
# 전체 상태 조회 (모든 토큰 및 계정 상태)
node scripts/query-sbt.js

# 특정 주소 조회
node scripts/query-sbt.js 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
```

## 방법 2: Foundry Cast 사용 (가장 간단)

### 컨트랙트 기본 정보 조회
```bash
# 컨트랙트 이름
cast call 0x0d2aa97CbBC38DBE72529169A931C5f6A10d62BE "name()(string)" --rpc-url http://localhost:8545

# 다음 토큰 ID (총 발급 수는 이 값 - 1)
cast call 0x0d2aa97CbBC38DBE72529169A931C5f6A10d62BE "nextTokenId()(uint256)" --rpc-url http://localhost:8545

# 특정 주소가 발급받았는지 확인
cast call 0x0d2aa97CbBC38DBE72529169A931C5f6A10d62BE "hasMinted(address)(bool)" 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 --rpc-url http://localhost:8545

# 특정 주소가 가진 토큰 수
cast call 0x0d2aa97CbBC38DBE72529169A931C5f6A10d62BE "balanceOf(address)(uint256)" 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 --rpc-url http://localhost:8545

# 특정 토큰 ID의 소유자
cast call 0x0d2aa97CbBC38DBE72529169A931C5f6A10d62BE "ownerOf(uint256)(address)" 1 --rpc-url http://localhost:8545

# 특정 토큰의 URI
cast call 0x0d2aa97CbBC38DBE72529169A931C5f6A10d62BE "tokenURI(uint256)(string)" 1 --rpc-url http://localhost:8545
```

### 모든 발급된 토큰 조회 (간단한 방법)
```bash
# 1. nextTokenId 확인 (예: 2이면 토큰 ID 1이 발급됨)
cast call 0x0d2aa97CbBC38DBE72529169A931C5f6A10d62BE "nextTokenId()(uint256)" --rpc-url http://localhost:8545

# 2. 각 토큰 ID의 소유자 확인
cast call 0x0d2aa97CbBC38DBE72529169A931C5f6A10d62BE "ownerOf(uint256)(address)" 1 --rpc-url http://localhost:8545
```

## 방법 3: Anvil 로그에서 트랜잭션 확인

Anvil을 실행한 터미널에서 확인:
- 트랜잭션 해시
- 블록 번호
- Gas 사용량
- 이벤트 로그 (PassMinted 이벤트)

## 방법 4: 지갑 앱에서 확인

지갑 앱의 NFT 탭에서 발급된 SBT를 확인할 수 있습니다.
트랜잭션 해시를 클릭하면 상세 정보를 볼 수 있습니다.

## 컨트랙트 주소

- **CityYouthPassSBT**: `0x0d2aa97CbBC38DBE72529169A931C5f6A10d62BE`
- **DaejeonYouthVerifier**: `0x205868EB1c45633d3263e9C7178594c4879C5be9`

## RPC URL

- **Anvil 로컬**: `http://localhost:8545`
- **Chain ID**: `31337`
