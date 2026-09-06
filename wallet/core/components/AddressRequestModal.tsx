import React from 'react';
import { getAddress } from '../lib/wallet';

interface AddressRequestModalProps {
  origin: string;
  onApprove: (address: string) => void;
  onReject: () => void;
}

export const AddressRequestModal: React.FC<AddressRequestModalProps> = ({
  origin,
  onApprove,
  onReject
}) => {
  const currentAddress = getAddress();

  const handleApprove = () => {
    if (currentAddress) {
      onApprove(currentAddress);
    } else {
      onReject();
    }
  };

  return (
    <div className="modal-overlay visible">
      <div className="auth-modal modal-content">
        <h3>지갑 연결 요청</h3>
        <div className="connect-request">
          <div className="connect-request__origin">
            <strong>{origin}</strong>에서 지갑 연결을 요청했습니다.
          </div>
          <div className="connect-request__address">
            <label>연결할 주소:</label>
            <div className="address-display">
              {currentAddress ? (
                <div className="address-item">
                  <div className="address-avatar">🦊</div>
                  <div className="address-info">
                    <div className="address-name">Account 1</div>
                    <div className="address-value">
                      {currentAddress.slice(0, 6)}...{currentAddress.slice(-4)}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="error-text">지갑이 잠겨있습니다</div>
              )}
            </div>
          </div>
          <div className="connect-request__warning">
            이 사이트는 다음을 할 수 있습니다:
            <ul>
              <li>지갑 주소 확인</li>
              <li>잔액 및 활동 내역 보기</li>
              <li>트랜잭션 요청 (별도 승인 필요)</li>
            </ul>
          </div>
        </div>
        <div className="auth-actions">
          <button className="btn btn-ghost" onClick={onReject}>거절</button>
          <button 
            className="btn btn-primary" 
            onClick={handleApprove}
            disabled={!currentAddress}
          >
            연결
          </button>
        </div>
      </div>
    </div>
  );
};
