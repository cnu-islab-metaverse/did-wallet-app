// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {IERC5192} from "erc5192/IERC5192.sol";
import "../src/YouthPassVerifier.sol";
import "../src/RegionalUnivVerifier.sol";
import "../src/YouthPassSBT.sol";
import "../src/RegionalUnivPassSBT.sol";

// 실제 회로 산출 증명(circuits/vc.json 기반)으로 온체인 발급 흐름을 검증한다.
// 증명 calldata 는 `snarkjs groth16 exportsolidityverifier` 흐름으로 생성한 고정값.
// 공개신호 = [currentDate=20260727, walletAddress=HOLDER].
contract PassesTest is Test {
    // 증명이 묶인 지갑(= vc.json 의 walletAddress). msg.sender 가 이 주소여야 발급됨.
    address constant HOLDER = 0x83f03255fC8bBd37Ca7326d6CC79baF056470c9d;
    // 2026-07-27 12:00 KST → 증명의 currentDate(20260727)와 일치하도록 block.timestamp 워프.
    uint256 constant TS_20260727_KST = 1785121200;

    YouthPassSBT youthSBT;
    RegionalUnivPassSBT rnuSBT;

    function setUp() public {
        youthSBT = new YouthPassSBT(address(new YouthPassVerifier()));
        rnuSBT = new RegionalUnivPassSBT(address(new RegionalUnivVerifier()));
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

    // ── 정상 발급 ───────────────────────────────────────────────────────
    function test_YouthPass_mint() public {
        (uint[2] memory a, uint[2][2] memory b, uint[2] memory c, uint[2] memory pub) = _youthProof();
        vm.prank(HOLDER);
        youthSBT.mintPass(a, b, c, pub, "ipfs://youth");
        assertEq(youthSBT.ownerOf(1), HOLDER);
        assertEq(youthSBT.balanceOf(HOLDER), 1);
        assertTrue(youthSBT.locked(1)); // ERC-5192 soulbound
    }

    function test_RegionalUniv_mint() public {
        (uint[2] memory a, uint[2][2] memory b, uint[2] memory c, uint[2] memory pub) = _rnuProof();
        vm.prank(HOLDER);
        rnuSBT.mintPass(a, b, c, pub, "ipfs://rnu");
        assertEq(rnuSBT.ownerOf(1), HOLDER);
        assertTrue(rnuSBT.locked(1));
    }

    // ── A2 바인딩: 증명이 묶인 주소가 아닌 계정은 발급 불가 ──────────────
    function test_RevertWhen_SenderNotBoundWallet() public {
        (uint[2] memory a, uint[2][2] memory b, uint[2] memory c, uint[2] memory pub) = _youthProof();
        vm.prank(address(0xBEEF)); // 도난 VP 를 다른 계정에서 제출
        vm.expectRevert("Sender != bound wallet");
        youthSBT.mintPass(a, b, c, pub, "ipfs://youth");
    }

    // ── 시점 무결성: currentDate 가 온체인 날짜와 다르면 거부 ────────────
    function test_RevertWhen_StaleDate() public {
        (uint[2] memory a, uint[2][2] memory b, uint[2] memory c, uint[2] memory pub) = _youthProof();
        vm.warp(TS_20260727_KST + 10 days); // 증명 날짜와 어긋남
        vm.prank(HOLDER);
        vm.expectRevert("Stale currentDate");
        youthSBT.mintPass(a, b, c, pub, "ipfs://youth");
    }

    // ── 시점 허용오차: 자정/지연 대비 어제 날짜 증명도 허용 ──────────────
    function test_DateTolerance_yesterdayProofAccepted() public {
        (uint[2] memory a, uint[2][2] memory b, uint[2] memory c, uint[2] memory pub) = _youthProof();
        vm.warp(TS_20260727_KST + 1 days); // 온체인은 하루 뒤 → 증명(어제)도 통과
        vm.prank(HOLDER);
        youthSBT.mintPass(a, b, c, pub, "ipfs://youth");
        assertEq(youthSBT.ownerOf(1), HOLDER);
    }

    // ── 잘못된 증명은 거부 ──────────────────────────────────────────────
    function test_RevertWhen_InvalidProof() public {
        (, uint[2][2] memory b, uint[2] memory c, uint[2] memory pub) = _youthProof();
        uint[2] memory badA = [uint256(1), uint256(2)];
        vm.prank(HOLDER);
        vm.expectRevert("Invalid proof");
        youthSBT.mintPass(badA, b, c, pub, "ipfs://youth");
    }

    // ── 소울바운드: 전송 불가 ───────────────────────────────────────────
    function test_RevertWhen_Transfer() public {
        (uint[2] memory a, uint[2][2] memory b, uint[2] memory c, uint[2] memory pub) = _youthProof();
        vm.prank(HOLDER);
        youthSBT.mintPass(a, b, c, pub, "ipfs://youth");
        vm.prank(HOLDER);
        vm.expectRevert("Soulbound: non-transferable");
        youthSBT.transferFrom(HOLDER, address(0xBEEF), 1);
    }

    // ── 표준 인터페이스 지원 ────────────────────────────────────────────
    function test_SupportsInterfaces() public view {
        assertTrue(youthSBT.supportsInterface(0x80ac58cd)); // ERC-721
        assertTrue(youthSBT.supportsInterface(type(IERC5192).interfaceId)); // ERC-5192
    }
}
