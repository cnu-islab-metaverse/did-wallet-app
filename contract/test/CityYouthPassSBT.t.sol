// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "forge-std/Test.sol";
import "../src/CityYouthPassSBT.sol";
import "../src/DaejeonYouthVerifier.sol";

contract CityYouthPassSBTTest is Test {
    CityYouthPassSBT pass;
    DaejeonYouthVerifier verifier;
    address owner;
    address addr1;

    function setUp() public {
        verifier = new DaejeonYouthVerifier();
        pass = new CityYouthPassSBT(address(verifier));
        owner = address(this);
        addr1 = address(0x1234);
    }

    function testMintSBTWithValidProof() public {
        // Mock valid proof and public signals
        uint256[2] memory pA = [
            0x1065d71a3e4b5ee113455dbcbddce470aab72feb08cf5e5996d80ef76dcccc6e,
            0x276e378cd46b113031eb8c413492bc5c5a7ac7e20185927a7d4a6f7497fbace2
        ];
        uint256[2][2] memory pB = [
            [0x0822781e3f04f0a4337beedeafecbc47cbd91b203cb145401f8aa957d2987ad2, 0x2fd671f58c4f6e323ff78c0e60b3b767fc58c82997c5f9d73b14033172b1cf5f],
            [0x000fddb6ef3e251aa1f43589a6aabcd5420cb14b2a9e1ab2e56b7d0a4239a4e8, 0x1b76947e1669eedbe36c697e130c98818b163b17b4307331a16130bbecbfb464]
        ];
        uint256[2] memory pC = [
            0x11b552e02960d022aea2b9c53846edbbd423a9835f7e4fa3d0f541be91f09871,
            0x18414c4537a8f6957b48dfa6ab011d652fc0e1bffa6c795bee789f271a07677b
        ];
        uint256[5] memory pubSignals = [
            0x0000000000000000000000000000000000000000000000000000000000000002,
            0x0000000000000000000000000000000000000000000000000000000000000004,
            0x0000000000000000000000000000000000000000000000000000000000000001,
            0x1d5ac1f31407018b7d413a4f52c8f74463b30e6ac2238220ad8b254de4eaa3a2,
            0x1e1de8a908826c3f9ac2e0ceee929ecd0caf3b99b3ef24523aaab796a6f733c4
        ];

        // verifier.verifyProof가 항상 true를 반환하는지 확인
        bool isValid = verifier.verifyProof(pA, pB, pC, pubSignals); // 필요한 인자들을 추가하세요
        assertTrue(isValid);

        vm.prank(addr1);
        pass.mintSBT(pA, pB, pC, pubSignals, "https://maroon-genuine-guineafowl-789.mypinata.cloud/ipfs/Qmaf4s6NsJ3GUeQ6U6sgyvkTKdkp4YNMDrkQigeWE3F1cQ");

        // addressToTokenId로 발급 확인
        assertEq(pass.addressToTokenId(addr1), 1);
        assertEq(pass.nextTokenId(), 2);
    }

    function testMintSBTWithInvalidProof() public {
        // Mock invalid proof and public signals
        uint256[2] memory pA = [uint256(0), uint256(0)];
        uint256[2][2] memory pB = [[uint256(0), uint256(0)], [uint256(0), uint256(0)]];
        uint256[2] memory pC = [uint256(0), uint256(0)];
        uint256[5] memory pubSignals = [uint256(0), uint256(0), uint256(0), uint256(0), uint256(0)];

        vm.prank(addr1);
        vm.expectRevert("Invalid proof");
        pass.mintSBT(pA, pB, pC, pubSignals, "https://maroon-genuine-guineafowl-789.mypinata.cloud/ipfs/QmPTpbim6Uf6BZffEa7Ts97RodKHmkwjyGTEg6diif3V4U");
  }
}


