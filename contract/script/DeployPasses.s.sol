// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/YouthPassVerifier.sol";
import "../src/RegionalUnivVerifier.sol";
import "../src/YouthPassSBT.sol";
import "../src/RegionalUnivPassSBT.sol";

// 두 시나리오의 [검증 Verifier → 발급 SBT] 쌍을 배포한다(CREATE2). 새 버전은 salt 변경.
contract DeployPasses is Script {
    bytes32 internal constant SALT_YOUTH_V = keccak256("youth-pass-verifier:v1");
    bytes32 internal constant SALT_YOUTH_S = keccak256("youth-pass-sbt:v1");
    bytes32 internal constant SALT_RNU_V = keccak256("regional-univ-verifier:v1");
    bytes32 internal constant SALT_RNU_S = keccak256("regional-univ-sbt:v1");

    function run() external {
        vm.startBroadcast();

        YouthPassVerifier youthV = new YouthPassVerifier{salt: SALT_YOUTH_V}();
        YouthPassSBT youthSBT = new YouthPassSBT{salt: SALT_YOUTH_S}(address(youthV));

        RegionalUnivVerifier rnuV = new RegionalUnivVerifier{salt: SALT_RNU_V}();
        RegionalUnivPassSBT rnuSBT = new RegionalUnivPassSBT{salt: SALT_RNU_S}(address(rnuV));

        vm.stopBroadcast();

        console.log("YouthPassVerifier   :", address(youthV));
        console.log("YouthPassSBT        :", address(youthSBT));
        console.log("RegionalUnivVerifier:", address(rnuV));
        console.log("RegionalUnivPassSBT :", address(rnuSBT));
    }
}
