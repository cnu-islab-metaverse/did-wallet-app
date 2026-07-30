// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.20;

// snarkjs Groth16 verifier 공통 인터페이스. 공개신호 = [currentDate(YYYYMMDD), walletAddress].
interface IZKVerifier {
    function verifyProof(
        uint[2] calldata _pA,
        uint[2][2] calldata _pB,
        uint[2] calldata _pC,
        uint[2] calldata _pubSignals
    ) external view returns (bool);
}
