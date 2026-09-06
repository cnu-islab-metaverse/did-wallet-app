// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import {stdJson} from "forge-std/StdJson.sol";
import {IERC5192} from "erc5192/IERC5192.sol";
import "../src/YouthPassVerifier.sol";
import "../src/RegionalUnivVerifier.sol";
import "../src/ZKCredentialSBT.sol";

// 범용 ZKCredentialSBT 검증.
//
// 증명 calldata·홀더 주소·워프 시각을 test/fixtures/proofs.json 에서 읽는다. 그 파일은
// circuits/release.mjs 가 Verifier.sol 과 **함께** 만들므로 회로와 테스트가 어긋날 수 없다.
// (예전에는 고정 calldata 를 손으로 박아두고 vc.json 만 바뀌어 서로 다른 홀더를 가리켰다.)
//
// 픽스처는 자기 검증된다: warpTs 와 증명의 currentDate 가 어긋나면 첫 mintPass 가
// "Stale currentDate" 로 실패한다.
contract ZKCredentialSBTTest is Test {
    using stdJson for string;

    uint256 constant TYPE_YOUTH = 1;
    uint256 constant TYPE_RNU = 2;
    uint64 constant ONE_YEAR = 365 days;

    struct Proof {
        uint[2] pA;
        uint[2][2] pB;
        uint[2] pC;
        uint[2] pub;
    }

    ZKCredentialSBT sbt;
    address youthVerifier;
    address rnuVerifier;

    address holder;
    uint256 warpTs;
    Proof youth;
    Proof rnu;
    Proof forged; // 수정 전 회로에서 자격증명 없이 만든 증명

    string json;

    function setUp() public {
        json = vm.readFile(string.concat(vm.projectRoot(), "/test/fixtures/proofs.json"));

        holder = json.readAddress(".scenarios.youth_pass.holder");
        warpTs = json.readUint(".scenarios.youth_pass.warpTs");
        youth = _readProof(".scenarios.youth_pass");
        rnu = _readProof(".scenarios.regional_national_univ");
        forged = _readProof(".forgedYouthPass");

        // 두 시나리오가 같은 날 생성됐는지 — 아니면 한쪽이 시점 검사에 걸린다.
        assertEq(warpTs, json.readUint(".scenarios.regional_national_univ.warpTs"), "fixture: warpTs mismatch");

        youthVerifier = address(new YouthPassVerifier());
        rnuVerifier = address(new RegionalUnivVerifier());
        sbt = new ZKCredentialSBT(address(this));
        sbt.registerPassType(TYPE_YOUTH, youthVerifier, ONE_YEAR);
        sbt.registerPassType(TYPE_RNU, rnuVerifier, 0); // 0 = 무기한

        vm.warp(warpTs);
    }

    // pB 는 평탄화해 저장돼 있다(stdJson 이 uint[2][2] 를 만들지 못한다). 여기서 재조립하며,
    // 그 과정에서 G2 좌표 순서가 눈에 보인다.
    function _readProof(string memory key) internal view returns (Proof memory p) {
        uint256[] memory a = json.readUintArray(string.concat(key, ".pA"));
        uint256[] memory b = json.readUintArray(string.concat(key, ".pBFlat"));
        uint256[] memory c = json.readUintArray(string.concat(key, ".pC"));
        uint256[] memory s = json.readUintArray(string.concat(key, ".pubSignals"));
        p.pA = [a[0], a[1]];
        p.pB = [[b[0], b[1]], [b[2], b[3]]];
        p.pC = [c[0], c[1]];
        p.pub = [s[0], s[1]];
    }

    function _mint(uint256 passType, Proof memory p, string memory uri) internal {
        vm.prank(holder);
        sbt.mintPass(passType, p.pA, p.pB, p.pC, p.pub, uri);
    }

    function _mintYouth() internal {
        _mint(TYPE_YOUTH, youth, "ipfs://youth");
    }

    // ── 픽스처 무결성 ───────────────────────────────────────────────────
    // 증명이 실제로 이 홀더에 묶여 있는지(A2). 픽스처가 뒤섞이면 여기서 잡힌다.
    function test_FixtureBindsToHolder() public view {
        assertEq(address(uint160(youth.pub[1])), holder);
        assertEq(address(uint160(rnu.pub[1])), holder);
        assertTrue(youth.pub[0] > 20000000, "currentDate looks unset");
    }

    // ── 정상 발급 ───────────────────────────────────────────────────────
    function test_YouthPass_mint() public {
        _mintYouth();
        assertEq(sbt.ownerOf(1), holder);
        assertEq(sbt.balanceOf(holder), 1);
        assertTrue(sbt.locked(1)); // ERC-5192 soulbound
        assertEq(sbt.typeOf(1), TYPE_YOUTH);
        assertTrue(sbt.hasValidPass(holder, TYPE_YOUTH));
    }

    function test_RegionalUniv_mint() public {
        _mint(TYPE_RNU, rnu, "ipfs://rnu");
        assertEq(sbt.ownerOf(1), holder);
        assertTrue(sbt.locked(1));
        assertTrue(sbt.hasValidPass(holder, TYPE_RNU));
    }

    // ── 자격증명 없이 만든 증명은 거부한다 ────────────────────────────
    // enabled_* 를 꺼서 만든 증명(옛 회로 산출물). 지금 검증자는 통과시키면 안 된다.
    function test_RevertWhen_ProofHasNoCredential() public {
        address attacker = address(uint160(forged.pub[1]));
        vm.prank(attacker);
        vm.expectRevert("Invalid proof");
        sbt.mintPass(TYPE_YOUTH, forged.pA, forged.pB, forged.pC, forged.pub, "forged");
    }

    // 망가진 점(point)도 당연히 거부된다 — 위와 달리 이건 형식 오류에 가깝다.
    function test_RevertWhen_MalformedProof() public {
        uint[2] memory badA = [uint256(1), uint256(2)];
        vm.prank(holder);
        vm.expectRevert("Invalid proof");
        sbt.mintPass(TYPE_YOUTH, badA, youth.pB, youth.pC, youth.pub, "bad");
    }

    // ── A2 바인딩 ───────────────────────────────────────────────────────
    function test_RevertWhen_SenderNotBoundWallet() public {
        vm.prank(address(0xBEEF)); // 도난 VP 를 다른 계정에서 제출
        vm.expectRevert("Sender != bound wallet");
        sbt.mintPass(TYPE_YOUTH, youth.pA, youth.pB, youth.pC, youth.pub, "ipfs://youth");
    }

    // ── 시점 무결성 ─────────────────────────────────────────────────────
    function test_RevertWhen_StaleDate() public {
        vm.warp(warpTs + 10 days);
        vm.prank(holder);
        vm.expectRevert("Stale currentDate");
        sbt.mintPass(TYPE_YOUTH, youth.pA, youth.pB, youth.pC, youth.pub, "ipfs://youth");
    }

    function test_DateTolerance_yesterdayProofAccepted() public {
        vm.warp(warpTs + 1 days); // 온체인은 하루 뒤 → 증명(어제)도 통과
        _mintYouth();
        assertEq(sbt.ownerOf(1), holder);
    }

    // ── 소울바운드 · 표준 ───────────────────────────────────────────────
    function test_RevertWhen_Transfer() public {
        _mintYouth();
        vm.prank(holder);
        vm.expectRevert("Soulbound: non-transferable");
        sbt.transferFrom(holder, address(0xBEEF), 1);
    }

    function test_SupportsInterfaces() public view {
        assertTrue(sbt.supportsInterface(0x80ac58cd)); // ERC-721
        assertTrue(sbt.supportsInterface(type(IERC5192).interfaceId)); // ERC-5192
    }

    // ── 타입 교차 · 갱신 ────────────────────────────────────────────────
    function test_HolderCanHoldMultiplePassTypes() public {
        _mintYouth();
        _mint(TYPE_RNU, rnu, "ipfs://rnu");

        assertEq(sbt.balanceOf(holder), 2);
        assertEq(sbt.tokenOf(holder, TYPE_YOUTH), 1);
        assertEq(sbt.tokenOf(holder, TYPE_RNU), 2);
        assertTrue(sbt.hasValidPass(holder, TYPE_YOUTH));
        assertTrue(sbt.hasValidPass(holder, TYPE_RNU));
    }

    // 같은 타입 재증명은 새 토큰이 아니라 갱신(보유자·타입 조합당 1토큰).
    function test_ReMintRenewsInsteadOfIssuingNew() public {
        _mintYouth();
        uint64 firstExpiry = sbt.expiresAt(1);

        vm.warp(warpTs + 1 days);
        _mint(TYPE_YOUTH, youth, "ipfs://youth-v2");

        assertEq(sbt.balanceOf(holder), 1); // 토큰 수 그대로
        assertEq(sbt.tokenOf(holder, TYPE_YOUTH), 1);
        assertGt(sbt.expiresAt(1), firstExpiry); // 유효기간 연장
    }

    // ── 기간 기반 만료 (데모 계획서 요구사항) ───────────────────────────
    function test_PassExpiresAfterValidityPeriod() public {
        _mintYouth();
        assertTrue(sbt.isValid(1));

        vm.warp(warpTs + ONE_YEAR + 1);
        assertFalse(sbt.isValid(1)); // 유효기간 경과 → 사용 불가
        assertFalse(sbt.hasValidPass(holder, TYPE_YOUTH));
        assertEq(sbt.ownerOf(1), holder); // 보유 자체는 유지(폐기 아님)
    }

    function test_ZeroValidityNeverExpires() public {
        _mint(TYPE_RNU, rnu, "ipfs://rnu");
        vm.warp(warpTs + 100 * 365 days);
        assertTrue(sbt.isValid(1));
        assertTrue(sbt.hasValidPass(holder, TYPE_RNU));
    }

    // ── 레지스트리 (모듈 부착/분리) ─────────────────────────────────────
    function test_RevertWhen_UnknownPassType() public {
        vm.prank(holder);
        vm.expectRevert("Unknown pass type");
        sbt.mintPass(999, youth.pA, youth.pB, youth.pC, youth.pub, "ipfs://x");
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
        assertTrue(sbt.hasValidPass(holder, TYPE_YOUTH)); // 기존 보유분 유효

        vm.prank(holder);
        vm.expectRevert("Pass type retired");
        sbt.mintPass(TYPE_YOUTH, youth.pA, youth.pB, youth.pC, youth.pub, "ipfs://youth");
    }

    function test_HasValidPassFalseForNonHolder() public view {
        assertFalse(sbt.hasValidPass(address(0xBEEF), TYPE_YOUTH));
    }
}
