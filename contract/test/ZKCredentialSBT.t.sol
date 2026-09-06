// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import {IERC5192} from "erc5192/IERC5192.sol";
import "../src/YouthPassVerifier.sol";
import "../src/RegionalUnivVerifier.sol";
import "../src/ZKCredentialSBT.sol";

// 범용 ZKCredentialSBT 검증. 증명 calldata 는 실제 회로 산출물(circuits/vc.json 기반) 고정값이며,
// 공개신호 = [currentDate=20260727, walletAddress=HOLDER].
contract ZKCredentialSBTTest is Test {
    // 증명이 묶인 지갑(= vc.json 의 walletAddress). msg.sender 가 이 주소여야 발급됨.
    address constant HOLDER = 0x83f03255fC8bBd37Ca7326d6CC79baF056470c9d;
    // 2026-07-27 12:00 KST → 증명의 currentDate(20260727)와 일치하도록 block.timestamp 워프.
    uint256 constant TS_20260727_KST = 1785121200;

    // 패스 타입 ID (배포 스크립트와 동일하게 유지)
    uint256 constant TYPE_YOUTH = 1;
    uint256 constant TYPE_RNU = 2;

    uint64 constant ONE_YEAR = 365 days;

    ZKCredentialSBT sbt;
    address youthVerifier;
    address rnuVerifier;

    function setUp() public {
        youthVerifier = address(new YouthPassVerifier());
        rnuVerifier = address(new RegionalUnivVerifier());
        sbt = new ZKCredentialSBT(address(this));
        sbt.registerPassType(TYPE_YOUTH, youthVerifier, ONE_YEAR);
        sbt.registerPassType(TYPE_RNU, rnuVerifier, 0); // 0 = 무기한
        vm.warp(TS_20260727_KST);
    }

    // ── 증명 calldata (고정값) ──────────────────────────────────────────
    function _youthProof()
        internal
        pure
        returns (uint[2] memory a, uint[2][2] memory b, uint[2] memory c, uint[2] memory pub)
    {
        a = [
            0x29d17b8825b3085d6718332e610de669b3405a2080322338297c10af1b5688dd,
            0x299f8080f21599ae1f60dd6a68221c94bd7bcdfb67a6abf1229f88a3181da528
        ];
        b = [
            [
                0x2623e4231c4eb3239c97c840bc92ae7c96dc1894f2dc727d88de47ee3edeb295,
                0x21e6ad2df4382dbab7ed134798e7c9cefbaa4e42f99d253d3c5531d3c409c6dc
            ],
            [
                0x033f0d85ee8bfdec0a81973ef663ab3abf5b00b3cf6fe970010d182ce791f24a,
                0x0796c8bb84a9b62501b16f909dfde6a5b3e1d184774cf21bbcd831bb4ad323e1
            ]
        ];
        c = [
            0x27612fed022215e2d93b1a9cf41bf8981301a84ddc17878adbb919a1839651ab,
            0x09e13e5f5c0ee678f120e9049831c88af8c1dbb710e7ed908744e77cee086fa9
        ];
        pub = [uint256(0x1352777), uint256(uint160(HOLDER))];
    }

    function _rnuProof()
        internal
        pure
        returns (uint[2] memory a, uint[2][2] memory b, uint[2] memory c, uint[2] memory pub)
    {
        a = [
            0x037b37db8b05c0b90baa24dbfb42e7c7d54799b5177e162164555096f86b280d,
            0x23b894fa18b9223a3b2be9cbdd7cb1f7818607adac293b04963ce9253e6c321e
        ];
        b = [
            [
                0x1e7f1f1f0bd13b96f4c0f34dd9039ad8f97d462129b6fe5ebe47f0fdf154378b,
                0x061798ce2a1343f20507dea31942c637e688df778ec2e791cc5db5d564cbc448
            ],
            [
                0x2c7c8ecf1fbf7ca5364965633994f98463817b5a9bbfb6c9ab36bd42bbe40a2e,
                0x0e097a68fe4b7b181c3d5b61dd2bf3e92c41b43a8226c645dd4257f7b15eb86b
            ]
        ];
        c = [
            0x297f10aa107d12ba4ccfab1049c224cd570a7c9b9cb1aceeac79abefab70816f,
            0x2dd918c53a963a126b1609bdbf5c566c04eeaef156aa4507b548ea7139f1ce48
        ];
        pub = [uint256(0x1352777), uint256(uint160(HOLDER))];
    }

    function _mintYouth() internal {
        (uint[2] memory a, uint[2][2] memory b, uint[2] memory c, uint[2] memory pub) = _youthProof();
        vm.prank(HOLDER);
        sbt.mintPass(TYPE_YOUTH, a, b, c, pub, "ipfs://youth");
    }

    // ── 정상 발급 (기존 8건 이관) ───────────────────────────────────────
    function test_YouthPass_mint() public {
        _mintYouth();
        assertEq(sbt.ownerOf(1), HOLDER);
        assertEq(sbt.balanceOf(HOLDER), 1);
        assertTrue(sbt.locked(1)); // ERC-5192 soulbound
        assertEq(sbt.typeOf(1), TYPE_YOUTH);
        assertTrue(sbt.hasValidPass(HOLDER, TYPE_YOUTH));
    }

    function test_RegionalUniv_mint() public {
        (uint[2] memory a, uint[2][2] memory b, uint[2] memory c, uint[2] memory pub) = _rnuProof();
        vm.prank(HOLDER);
        sbt.mintPass(TYPE_RNU, a, b, c, pub, "ipfs://rnu");
        assertEq(sbt.ownerOf(1), HOLDER);
        assertTrue(sbt.locked(1));
        assertTrue(sbt.hasValidPass(HOLDER, TYPE_RNU));
    }

    function test_RevertWhen_SenderNotBoundWallet() public {
        (uint[2] memory a, uint[2][2] memory b, uint[2] memory c, uint[2] memory pub) = _youthProof();
        vm.prank(address(0xBEEF)); // 도난 VP 를 다른 계정에서 제출
        vm.expectRevert("Sender != bound wallet");
        sbt.mintPass(TYPE_YOUTH, a, b, c, pub, "ipfs://youth");
    }

    function test_RevertWhen_StaleDate() public {
        (uint[2] memory a, uint[2][2] memory b, uint[2] memory c, uint[2] memory pub) = _youthProof();
        vm.warp(TS_20260727_KST + 10 days);
        vm.prank(HOLDER);
        vm.expectRevert("Stale currentDate");
        sbt.mintPass(TYPE_YOUTH, a, b, c, pub, "ipfs://youth");
    }

    function test_DateTolerance_yesterdayProofAccepted() public {
        (uint[2] memory a, uint[2][2] memory b, uint[2] memory c, uint[2] memory pub) = _youthProof();
        vm.warp(TS_20260727_KST + 1 days); // 온체인은 하루 뒤 → 증명(어제)도 통과
        vm.prank(HOLDER);
        sbt.mintPass(TYPE_YOUTH, a, b, c, pub, "ipfs://youth");
        assertEq(sbt.ownerOf(1), HOLDER);
    }

    function test_RevertWhen_InvalidProof() public {
        (, uint[2][2] memory b, uint[2] memory c, uint[2] memory pub) = _youthProof();
        uint[2] memory badA = [uint256(1), uint256(2)];
        vm.prank(HOLDER);
        vm.expectRevert("Invalid proof");
        sbt.mintPass(TYPE_YOUTH, badA, b, c, pub, "ipfs://youth");
    }

    function test_RevertWhen_Transfer() public {
        _mintYouth();
        vm.prank(HOLDER);
        vm.expectRevert("Soulbound: non-transferable");
        sbt.transferFrom(HOLDER, address(0xBEEF), 1);
    }

    function test_SupportsInterfaces() public view {
        assertTrue(sbt.supportsInterface(0x80ac58cd)); // ERC-721
        assertTrue(sbt.supportsInterface(type(IERC5192).interfaceId)); // ERC-5192
    }

    // ── 타입 교차: 한 지갑이 서로 다른 패스를 각각 보유 ─────────────────
    function test_HolderCanHoldMultiplePassTypes() public {
        _mintYouth();
        (uint[2] memory a, uint[2][2] memory b, uint[2] memory c, uint[2] memory pub) = _rnuProof();
        vm.prank(HOLDER);
        sbt.mintPass(TYPE_RNU, a, b, c, pub, "ipfs://rnu");

        assertEq(sbt.balanceOf(HOLDER), 2);
        assertEq(sbt.tokenOf(HOLDER, TYPE_YOUTH), 1);
        assertEq(sbt.tokenOf(HOLDER, TYPE_RNU), 2);
        assertTrue(sbt.hasValidPass(HOLDER, TYPE_YOUTH));
        assertTrue(sbt.hasValidPass(HOLDER, TYPE_RNU));
    }

    // 같은 타입 재증명은 새 토큰이 아니라 갱신(주소·타입 조합당 1토큰).
    function test_ReMintRenewsInsteadOfIssuingNew() public {
        _mintYouth();
        uint64 firstExpiry = sbt.expiresAt(1);

        vm.warp(TS_20260727_KST + 1 days);
        (uint[2] memory a, uint[2][2] memory b, uint[2] memory c, uint[2] memory pub) = _youthProof();
        vm.prank(HOLDER);
        sbt.mintPass(TYPE_YOUTH, a, b, c, pub, "ipfs://youth-v2");

        assertEq(sbt.balanceOf(HOLDER), 1); // 토큰 수 그대로
        assertEq(sbt.tokenOf(HOLDER, TYPE_YOUTH), 1);
        assertGt(sbt.expiresAt(1), firstExpiry); // 유효기간 연장
    }

    // ── 기간 기반 만료 (데모 계획서 요구사항) ───────────────────────────
    function test_PassExpiresAfterValidityPeriod() public {
        _mintYouth();
        assertTrue(sbt.isValid(1));
        assertTrue(sbt.hasValidPass(HOLDER, TYPE_YOUTH));

        vm.warp(TS_20260727_KST + ONE_YEAR + 1);
        assertFalse(sbt.isValid(1)); // 유효기간 경과 → 사용 불가
        assertFalse(sbt.hasValidPass(HOLDER, TYPE_YOUTH));
        assertEq(sbt.ownerOf(1), HOLDER); // 보유 자체는 유지(폐기 아님)
    }

    // validitySeconds=0 으로 등록한 타입은 만료되지 않는다.
    function test_ZeroValidityNeverExpires() public {
        (uint[2] memory a, uint[2][2] memory b, uint[2] memory c, uint[2] memory pub) = _rnuProof();
        vm.prank(HOLDER);
        sbt.mintPass(TYPE_RNU, a, b, c, pub, "ipfs://rnu");

        vm.warp(TS_20260727_KST + 100 * 365 days);
        assertTrue(sbt.isValid(1));
        assertTrue(sbt.hasValidPass(HOLDER, TYPE_RNU));
    }

    // ── 레지스트리 (모듈 부착/분리) ─────────────────────────────────────
    function test_RevertWhen_UnknownPassType() public {
        (uint[2] memory a, uint[2][2] memory b, uint[2] memory c, uint[2] memory pub) = _youthProof();
        vm.prank(HOLDER);
        vm.expectRevert("Unknown pass type");
        sbt.mintPass(999, a, b, c, pub, "ipfs://x");
    }

    // 등록은 추가 전용 — 발급 이후 검증자 바꿔치기 차단.
    function test_RevertWhen_ReRegisteringPassType() public {
        vm.expectRevert("Pass type already registered");
        sbt.registerPassType(TYPE_YOUTH, rnuVerifier, ONE_YEAR);
    }

    function test_RevertWhen_RegisterByNonOwner() public {
        vm.prank(address(0xBEEF));
        vm.expectRevert();
        sbt.registerPassType(3, youthVerifier, 0);
    }

    // 폐지하면 신규 발급만 막히고, 기존 보유분은 그대로 유효하다.
    function test_RetireBlocksNewMintButKeepsExistingValid() public {
        _mintYouth();
        sbt.retirePassType(TYPE_YOUTH);
        assertTrue(sbt.hasValidPass(HOLDER, TYPE_YOUTH)); // 기존 보유분 유효

        (uint[2] memory a, uint[2][2] memory b, uint[2] memory c, uint[2] memory pub) = _youthProof();
        vm.prank(HOLDER);
        vm.expectRevert("Pass type retired");
        sbt.mintPass(TYPE_YOUTH, a, b, c, pub, "ipfs://youth");
    }

    // 미보유 지갑은 hasValidPass=false.
    function test_HasValidPassFalseForNonHolder() public view {
        assertFalse(sbt.hasValidPass(address(0xBEEF), TYPE_YOUTH));
    }
}
