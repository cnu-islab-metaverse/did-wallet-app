// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import {IERC5192} from "erc5192/IERC5192.sol";
import "./IZKVerifier.sol";

// [작업] ZK 증명으로만 발급되는 범용 소울바운드 자격증명 SBT (ERC-721 + ERC-5192).
//        시나리오마다 컨트랙트를 새로 배포하지 않고, 회로 산출 Verifier 를 "패스 타입"으로
//        등록해 붙인다. 발급은 [증명 검증 + 제출자 바인딩(A2) + 시점 무결성] 3중 검사를 통과해야 한다.
//        메타버스(metaverse-world)의 중앙발급 MetaverseSBTs 와 달리 운영자가 임의 발급할 수 없다.
// [결과] 조건을 영지식으로 증명한 지갑만 패스를 보유. 유효기간이 지나면 isValid=false 로 사용 불가.
//
// 공개신호 규격(모든 시나리오 공통): pubSignals[0]=currentDate(YYYYMMDD), pubSignals[1]=walletAddress.
contract ZKCredentialSBT is ERC721URIStorage, Ownable, IERC5192 {
    struct PassTypeInfo {
        IZKVerifier verifier;    // 회로 산출 Groth16 검증자
        uint64 validitySeconds;  // 발급 시점부터의 유효기간. 0 = 무기한
        bool retired;            // true = 신규 발급 중단(기존 보유분은 그대로 유효)
    }

    mapping(uint256 => PassTypeInfo) public passTypes;                 // passType → 등록정보
    mapping(address => mapping(uint256 => uint256)) public tokenOf;    // 보유자 → passType → tokenId
    mapping(uint256 => uint256) public typeOf;                         // tokenId → passType
    mapping(uint256 => uint64) public expiresAt;                       // tokenId → 만료시각(0=무기한)
    uint256 public nextTokenId = 1;

    event PassTypeRegistered(uint256 indexed passType, address indexed verifier, uint64 validitySeconds);
    event PassTypeRetired(uint256 indexed passType);
    event PassMinted(address indexed holder, uint256 indexed passType, uint256 indexed tokenId, uint64 expiresAt);

    // 소유자를 명시적으로 받는다. CREATE2(`new X{salt:}`)로 배포하면 생성자의 msg.sender 가
    // 배포 팩토리가 되어 소유권이 엉뚱한 주소로 잡히고 registerPassType 을 영영 못 부르게 된다.
    constructor(address initialOwner) ERC721("ZK Credential", "ZKC") Ownable(initialOwner) {}

    // ── 패스 타입 등록 (모듈 부착) ───────────────────────────────────────
    // 추가 전용이다. 이미 등록된 타입의 검증자는 덮어쓸 수 없다 —
    // 발급 이후에 운영자가 "무엇을 증명해야 하는지"를 바꿔치기하는 경로를 원천 차단한다.
    function registerPassType(uint256 passType, address verifier_, uint64 validitySeconds) external onlyOwner {
        require(verifier_ != address(0), "Verifier is zero address");
        require(address(passTypes[passType].verifier) == address(0), "Pass type already registered");
        passTypes[passType] = PassTypeInfo(IZKVerifier(verifier_), validitySeconds, false);
        emit PassTypeRegistered(passType, verifier_, validitySeconds);
    }

    // ── 패스 타입 폐지 (모듈 분리) ───────────────────────────────────────
    // 신규 발급만 막는다. 이미 발급된 토큰의 검증 의미는 건드리지 않는다.
    function retirePassType(uint256 passType) external onlyOwner {
        require(address(passTypes[passType].verifier) != address(0), "Unknown pass type");
        require(!passTypes[passType].retired, "Already retired");
        passTypes[passType].retired = true;
        emit PassTypeRetired(passType);
    }

    // ── 발급 ────────────────────────────────────────────────────────────
    function mintPass(
        uint256 passType,
        uint[2] calldata pA,
        uint[2][2] calldata pB,
        uint[2] calldata pC,
        uint[2] calldata pubSignals,
        string calldata tokenURI_
    ) external {
        PassTypeInfo memory t = passTypes[passType];
        require(address(t.verifier) != address(0), "Unknown pass type");
        require(!t.retired, "Pass type retired");

        // 1) ZK 증명 검증 (해당 타입에 등록된 회로 검증자)
        require(t.verifier.verifyProof(pA, pB, pC, pubSignals), "Invalid proof");

        // 2) 제출자 바인딩(A2): 증명이 묶인 지갑주소 == 실제 호출자. 도난 VP 타계정 사용 차단.
        require(msg.sender == address(uint160(pubSignals[1])), "Sender != bound wallet");

        // 3) 시점 무결성: 증명의 currentDate 가 온체인 현재 날짜(KST)와 일치(자정/지연 대비 어제까지 허용).
        uint256 proofDate = pubSignals[0];
        require(
            proofDate == _dateKST(block.timestamp) || proofDate == _dateKST(block.timestamp - 1 days),
            "Stale currentDate"
        );

        uint64 exp = t.validitySeconds == 0 ? 0 : uint64(block.timestamp) + t.validitySeconds;

        // 4) 발급 또는 갱신 (보유자·타입 조합당 1토큰). 재증명하면 URI 와 유효기간이 갱신된다.
        uint256 existing = tokenOf[msg.sender][passType];
        if (existing != 0 && _ownerOf(existing) == msg.sender) {
            _setTokenURI(existing, tokenURI_);
            expiresAt[existing] = exp;
            emit PassMinted(msg.sender, passType, existing, exp);
        } else {
            uint256 tokenId = nextTokenId++;
            _safeMint(msg.sender, tokenId);
            _setTokenURI(tokenId, tokenURI_);
            tokenOf[msg.sender][passType] = tokenId;
            typeOf[tokenId] = passType;
            expiresAt[tokenId] = exp;
            emit Locked(tokenId); // ERC-5192
            emit PassMinted(msg.sender, passType, tokenId, exp);
        }
    }

    // ── 조회 (메타버스 접근 제어가 쓰는 진입점) ──────────────────────────
    // 유효기간이 지난 SBT 는 보유하고 있어도 false — 데모 계획서의 "기간 기반 만료 처리" 요구사항.
    function isValid(uint256 tokenId) public view returns (bool) {
        if (_ownerOf(tokenId) == address(0)) return false;
        uint64 e = expiresAt[tokenId];
        return e == 0 || block.timestamp <= e;
    }

    // 특정 지갑이 특정 패스를 "유효하게" 보유 중인지 한 번에 확인.
    function hasValidPass(address holder, uint256 passType) external view returns (bool) {
        uint256 tokenId = tokenOf[holder][passType];
        if (tokenId == 0 || _ownerOf(tokenId) != holder) return false;
        return isValid(tokenId);
    }

    // ── ERC-5192 (soulbound) ────────────────────────────────────────────
    function locked(uint256 tokenId) external view returns (bool) {
        _requireOwned(tokenId);
        return true; // 항상 잠금
    }

    // 전송 차단: mint(from=0)·burn(to=0) 만 허용, 그 외 이동은 revert.
    function _update(address to, uint256 tokenId, address auth) internal override returns (address) {
        address from = _ownerOf(tokenId);
        require(from == address(0) || to == address(0), "Soulbound: non-transferable");
        return super._update(to, tokenId, auth);
    }

    function supportsInterface(bytes4 interfaceId) public view override(ERC721URIStorage) returns (bool) {
        return interfaceId == type(IERC5192).interfaceId || super.supportsInterface(interfaceId);
    }

    // ── block.timestamp(UTC) → KST(YYYYMMDD) 정수. 반복문 없는 O(1) 정수연산. ──
    function _dateKST(uint256 timestamp) internal pure returns (uint256) {
        uint256 z = (timestamp + 9 hours) / 86400 + 719468; // +9h: KST 보정
        uint256 era = z / 146097;
        uint256 doe = z - era * 146097;
        uint256 yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
        uint256 y = yoe + era * 400;
        uint256 doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
        uint256 mp = (5 * doy + 2) / 153;
        uint256 d = doy - (153 * mp + 2) / 5 + 1;
        uint256 m = mp < 10 ? mp + 3 : mp - 9;
        if (m <= 2) y += 1;
        return y * 10000 + m * 100 + d;
    }
}
