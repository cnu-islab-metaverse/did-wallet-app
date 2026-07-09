// SPDX-License-Identifier: GPL-3.0
pragma solidity >=0.7.0 <0.9.0;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./DaejeonYouthVerifier.sol";

contract CityYouthPassSBT is ERC721URIStorage, Ownable {
    DaejeonYouthVerifier public verifier;
    uint256 public nextTokenId = 1;

    // 지갑 주소 -> 토큰 ID 매핑 (갱신을 위해 필요)
    mapping(address => uint256) public addressToTokenId;

    // ERC5192 이벤트 (인터페이스 상속 없이 직접 구현)
    event Locked(uint256 tokenId);
    
    event PassMinted(address indexed recipient, uint256 tokenId);

    // 수정된 생성자, Ownable의 생성자에 msg.sender 전달
    constructor(address _verifierAddress) ERC721("City Youth Pass SBT", "CYPSBT") Ownable(msg.sender) {
        verifier = DaejeonYouthVerifier(_verifierAddress);
    }

    function supportsInterface(bytes4 interfaceId) public view override(ERC721URIStorage) returns (bool) {
        // ERC5192 interface ID: keccak256("locked(uint256)")의 상위 4바이트 = 0xb45a3c0e
        return interfaceId == 0xb45a3c0e || super.supportsInterface(interfaceId);
    }

    // SBT 발급 또는 갱신 함수 (zk-SNARK 프루프 검증을 통과해야 발급 가능)
    // 이미 발급된 경우 기존 토큰의 URI만 갱신
    function mintSBT(
        uint256[2] calldata _pA,
        uint256[2][2] calldata _pB,
        uint256[2] calldata _pC,
        uint256[5] calldata _pubSignals,
        string memory tokenURI
    ) public {
        // zk-SNARK proof 검증
        require(verifier.verifyProof(_pA, _pB, _pC, _pubSignals), "Invalid proof");

        uint256 existingTokenId = addressToTokenId[msg.sender];
        
        if (existingTokenId != 0 && _ownerOf(existingTokenId) == msg.sender) {
            // 기존 토큰이 있으면 URI만 갱신
            _setTokenURI(existingTokenId, tokenURI);
            emit PassMinted(msg.sender, existingTokenId); // 갱신 이벤트
        } else {
            // 새 토큰 발급
            uint256 tokenId = nextTokenId;
            _safeMint(msg.sender, tokenId);
            _setTokenURI(tokenId, tokenURI);
            
            addressToTokenId[msg.sender] = tokenId;
            nextTokenId++;

            emit Locked(tokenId);
            emit PassMinted(msg.sender, tokenId);
        }
    }

    function transferFrom(address from, address to, uint256 tokenId) public override(ERC721, IERC721) {
        revert("Soulbound: Transfers are not allowed");
    }

    function safeTransferFrom(address from, address to, uint256 tokenId, bytes memory data) public override(ERC721, IERC721) {
        revert("Soulbound: Transfers are not allowed");
    }

    /**
     * @dev ERC5192: 토큰 잠금 상태 확인 (인터페이스 상속 없이 직접 구현)
     * @param tokenId 토큰 ID
     * @return 항상 true (Soulbound Token이므로 항상 잠금 상태)
     */
    function locked(uint256 tokenId) external view returns (bool) {
        require(_ownerOf(tokenId) != address(0), "Token does not exist");
        return true;  // 항상 Soulbound
    }

}



