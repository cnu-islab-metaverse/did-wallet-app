// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import {IERC5192} from "erc5192/IERC5192.sol";
import "./IZKVerifier.sol";

// [작업] ZK 검증 기반 소울바운드 패스의 공통 베이스 (ERC-721 + ERC-5192 표준).
//        각 시나리오 SBT(YouthPassSBT·RegionalUnivPassSBT)가 상속해 뒤단 Verifier 만 갈아끼운다.
//        발급(mint)은 ZK 증명 검증 + 제출자 바인딩(A2) + 시점 무결성을 모두 통과해야 한다.
// [결과] 조건 증명에 성공한 지갑에게만 양도불가(soulbound) 패스가 발급/갱신된다.
abstract contract SoulboundPass is ERC721URIStorage, Ownable, IERC5192 {
    IZKVerifier public immutable verifier;
    uint256 public nextTokenId = 1;
    mapping(address => uint256) public addressToTokenId;

    event PassMinted(address indexed recipient, uint256 indexed tokenId);

    constructor(string memory name_, string memory symbol_, address verifier_)
        ERC721(name_, symbol_)
        Ownable(msg.sender)
    {
        verifier = IZKVerifier(verifier_);
    }

    // ── 발급 로직 (자식이 mintPass 로 노출) ─────────────────────────────
    // 공개신호 규격: pubSignals[0]=currentDate(YYYYMMDD), pubSignals[1]=walletAddress.
    function _mintWithProof(
        uint[2] calldata pA,
        uint[2][2] calldata pB,
        uint[2] calldata pC,
        uint[2] calldata pubSignals,
        string memory tokenURI_
    ) internal {
        // 1) ZK 증명 검증 (뒤단 Verifier)
        require(verifier.verifyProof(pA, pB, pC, pubSignals), "Invalid proof");

        // 2) 제출자 바인딩(A2): 증명이 묶인 지갑주소 == 실제 호출자. 도난 VP 타계정 사용 차단.
        require(msg.sender == address(uint160(pubSignals[1])), "Sender != bound wallet");

        // 3) 시점 무결성: 증명의 currentDate 가 온체인 현재 날짜(KST)와 일치(자정/지연 대비 어제까지 허용).
        uint256 proofDate = pubSignals[0];
        require(
            proofDate == _dateKST(block.timestamp) || proofDate == _dateKST(block.timestamp - 1 days),
            "Stale currentDate"
        );

        // 4) 발급 또는 갱신 (주소당 1토큰)
        uint256 existing = addressToTokenId[msg.sender];
        if (existing != 0 && _ownerOf(existing) == msg.sender) {
            _setTokenURI(existing, tokenURI_);
            emit PassMinted(msg.sender, existing);
        } else {
            uint256 tokenId = nextTokenId++;
            _safeMint(msg.sender, tokenId);
            _setTokenURI(tokenId, tokenURI_);
            addressToTokenId[msg.sender] = tokenId;
            emit Locked(tokenId); // ERC-5192
            emit PassMinted(msg.sender, tokenId);
        }
    }

    // ── ERC-5192 (soulbound) ────────────────────────────────────────────
    function locked(uint256 tokenId) external view returns (bool) {
        _requireOwned(tokenId);
        return true; // 항상 잠금
    }

    // 전송 차단: mint(from=0)·burn(to=0) 만 허용, 그 외 이동은 revert.
    function _update(address to, uint256 tokenId, address auth)
        internal
        override
        returns (address)
    {
        address from = _ownerOf(tokenId);
        require(from == address(0) || to == address(0), "Soulbound: non-transferable");
        return super._update(to, tokenId, auth);
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721URIStorage)
        returns (bool)
    {
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
