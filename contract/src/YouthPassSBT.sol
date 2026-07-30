// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.20;

import "./SoulboundPass.sol";

// [작업] 지역청년패스 SBT — 대전 거주 + 만 19~34세 를 ZK 로 증명하면 발급되는 소울바운드 패스.
//        뒤단 검증은 YouthPassVerifier(회로 youth_pass 산출물).
// [결과] 조건 증명에 성공한 지갑만 패스 보유 → 메타버스가 이 SBT 로 아바타 접근을 제어.
contract YouthPassSBT is SoulboundPass {
    constructor(address verifier_)
        SoulboundPass("Daejeon Youth Pass", "DYPASS", verifier_)
    {}

    // 사용자(지갑)가 온체인 자격증(SBT) 발급을 요청하는 진입점.
    function mintPass(
        uint[2] calldata pA,
        uint[2][2] calldata pB,
        uint[2] calldata pC,
        uint[2] calldata pubSignals,
        string calldata tokenURI_
    ) external {
        _mintWithProof(pA, pB, pC, pubSignals, tokenURI_);
    }
}
