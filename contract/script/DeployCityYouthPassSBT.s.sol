// File: script/DeployCityYouthPassSBT.s.sol
// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.0;

import "forge-std/Script.sol";
import "forge-std/Test.sol";
import "../src/CityYouthPassSBT.sol";
import "../src/DaejeonYouthVerifier.sol";

/**
 * 배포 스크립트 및 기본적인 SBT, ERC-5192 관련 테스트 시나리오
 */
contract DeployCityYouthPassSBT is Script, Test {
    // 고정된 CREATE2 salt 값들 (네트워크/환경별로 다르게 설정 가능)
    // 새 버전 배포 시 salt 값 변경 필요 (예: v1 -> v2)
    bytes32 internal constant SALT_VERIFIER = keccak256(abi.encodePacked("daejeon-youth-verifier:v3"));
    bytes32 internal constant SALT_SBT = keccak256(abi.encodePacked("city-youth-pass-sbt:v3"));

    function run() external {
        // 설정된 지갑을 사용하여 배포 시작
        vm.startBroadcast();

        // DaejeonYouthVerifier 컨트랙트 배포 (CREATE2)
        DaejeonYouthVerifier verifier = new DaejeonYouthVerifier{salt: SALT_VERIFIER}();

        // CityYouthPassSBT 컨트랙트 배포 (CREATE2), verifier 주소 전달
        CityYouthPassSBT sbt = new CityYouthPassSBT{salt: SALT_SBT}(address(verifier));

        // 배포 완료 후 브로드캐스트 종료
        vm.stopBroadcast();

        console.log("CityYouthPassSBT deployed at:", address(sbt));
        console.log("DaejeonYouthVerifier deployed at:", address(verifier));

        // ERC-721 지원 여부
        bool isERC721 = sbt.supportsInterface(0x80ac58cd);
        console.log("Does CityYouthPassSBT support ERC-721:", isERC721);

        // ERC-5192 지원 여부 (interfaceId: 0xb45a3c0e)
        bool isERC5192 = sbt.supportsInterface(0xb45a3c0e);
        console.log("Does CityYouthPassSBT support ERC-5192:", isERC5192);

        // SBT 특성 확인: 전송 시도는 실패해야 함 (revert 예상)
        try sbt.safeTransferFrom(vm.addr(1), vm.addr(2), 1) {
            console.log("Unexpected: transfer succeeded");
        } catch {
            console.log("Expected: transfer reverted (SBT non-transferable)");
        }

        //--- 아래는 실제 mintSBT 테스트 시나리오 ---
        // 이더리움에서 zk-SNARK proof 파라미터를 모두 맞춰 테스트하려면 실제 proof 데이터가 필요함.
        // 여기에선 단위 테스트 구조상 실제 발행을 시뮬레이션하는 코드(Placeholders)를 추가.

        // 테스트 계정 준비
        address testUser = vm.addr(3);
        vm.startPrank(testUser);

        // mint용 mock proof/inputs (실제 배포 환경에서는 올바른 데이터를 입력하세요)
        uint256[2] memory _pA = [uint256(0), uint256(0)];
        uint256[2][2] memory _pB = [[uint256(0), uint256(0)], [uint256(0), uint256(0)]];
        uint256[2] memory _pC = [uint256(0), uint256(0)];
        uint256[5] memory _pubSignals = [uint256(0), uint256(0), uint256(0), uint256(0), uint256(0)];
        string memory tokenURI = "ipfs://dummy";

        // mint 시 revert되면 정상적으로 테스트 불가 (proof mock임)
        // try/catch로 감싸 시그니처 및 이벤트 테스트 예시 구현 가능
        try sbt.mintSBT(_pA, _pB, _pC, _pubSignals, tokenURI) {
            console.log("mintSBT succeeded (dummy proof accepted).");

            // 토큰 잠금 상태 확인 (ERC-5192)
            bool lockedStatus = sbt.locked(1);
            console.log("locked(1) =", lockedStatus);

            // 이벤트(Locked) 체크 (forge-std 기반 솔리디티에선 수동으로 확인)
            // 실제 이벤트 확인은 JS/TypeScript 등의 이벤트 파싱 테스트에서 확인 추천

        } catch {
            console.log("mintSBT failed as expected (mock proof).");
        }
        vm.stopPrank();
    }
}

