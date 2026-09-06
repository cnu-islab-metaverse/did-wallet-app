// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/YouthPassVerifier.sol";
import "../src/RegionalUnivVerifier.sol";
import "../src/ZKCredentialSBT.sol";

// 범용 발급자 ZKCredentialSBT 를 한 번 배포하고, 시나리오 회로 검증자를 "패스 타입"으로 등록한다.
// 이후 새 시나리오는 이 스크립트를 다시 돌릴 필요 없이 *Verifier 만 배포해
// registerPassType 을 호출하면 붙는다(RegisterPassType 스크립트 참고).
//
// 실행:
//   forge script script/DeployZKCredentialSBT.s.sol:DeployZKCredentialSBT \
//     --rpc-url <RPC> --private-key <KEY> --broadcast
contract DeployZKCredentialSBT is Script {
    // 패스 타입 ID — 테스트(ZKCredentialSBT.t.sol)·지갑·메타버스가 같은 값을 쓴다.
    uint256 internal constant TYPE_YOUTH = 1; // 지역청년패스 (대전 거주 + 만 19~34세)
    uint256 internal constant TYPE_RNU = 2; // 지방거점국립대 재학/졸업

    // 유효기간. 데모 계획서의 "기간 기반 SBT 만료 처리" 요구사항.
    uint64 internal constant YOUTH_VALIDITY = 365 days; // 나이 조건은 해마다 재증명
    uint64 internal constant RNU_VALIDITY = 0; // 0 = 무기한(학적은 VC 자체가 만료를 가짐)

    function run() external {
        vm.startBroadcast();
        address deployer = msg.sender;

        // CREATE2 를 쓰지 않는다. 결정적 주소가 필요 없고, 같은 bytecode 로 재실행하면
        // 이미 존재하는 주소라 revert 하는 실패 모드만 생긴다.
        YouthPassVerifier youthV = new YouthPassVerifier();
        RegionalUnivVerifier rnuV = new RegionalUnivVerifier();

        // 소유자를 명시적으로 넘겨 배포자에게 귀속시킨다(CREATE2 를 쓰면 생성자의 msg.sender 가
        // 배포 팩토리가 되어 소유권이 엉뚱한 곳으로 간다).
        ZKCredentialSBT sbt = new ZKCredentialSBT(deployer);

        sbt.registerPassType(TYPE_YOUTH, address(youthV), YOUTH_VALIDITY);
        sbt.registerPassType(TYPE_RNU, address(rnuV), RNU_VALIDITY);

        vm.stopBroadcast();

        console.log("ZKCredentialSBT     :", address(sbt));
        console.log("  owner             :", deployer);
        console.log("YouthPassVerifier   :", address(youthV), "-> passType", TYPE_YOUTH);
        console.log("RegionalUnivVerifier:", address(rnuV), "-> passType", TYPE_RNU);
        console.log("");
        console.log("Update verifier-web/src/config/deployment.config.js with the ZKCredentialSBT address.");
    }
}
