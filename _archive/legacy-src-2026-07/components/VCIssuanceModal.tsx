import React from 'react';
import { VerifiableCredential } from '../types/vc';

interface VCIssuanceModalProps {
  vc: VerifiableCredential;
  student: any;
  origin: string;
  isDuplicate: boolean;
  duplicateId?: string;
  onApprove: () => void;
  onReject: () => void;
}

export const VCIssuanceModal: React.FC<VCIssuanceModalProps> = ({
  vc,
  student,
  origin,
  isDuplicate,
  onApprove,
  onReject
}) => {
  const handleApprove = () => {
    onApprove();
  };

  const handleReject = () => {
    onReject();
  };

  return (
    <div className="modal-overlay visible">
      <div className="modal-content">
        <div className="modal-header">
          <h3>{student ? '📋 VC 발급 요청' : '💾 VC 저장 요청'}</h3>
          <button className="modal-close" onClick={handleReject}>×</button>
        </div>
        
        <div className="modal-body">
          <div className="issuer-info">
            <strong>{origin}</strong>에서 {student ? 'VC 발급을' : 'VC 저장을'} 요청했습니다
          </div>
        
          <div className="vc-issuance-body">
          <div className="vc-preview">
            <div className="vc-field">
              <label>발급자:</label>
              <span>{vc.issuer?.name || vc.issuer?.id}</span>
            </div>
            
            <div className="vc-field">
              <label>발급받는 사람:</label>
              <span>{vc.credentialSubject?.name}</span>
            </div>
            
            <div className="vc-field">
              <label>VC 타입:</label>
              <span>{vc.type?.find((t: string) => t !== 'VerifiableCredential') || 'Unknown'}</span>
            </div>
            
            <div className="vc-field">
              <label>발급일:</label>
              <span>{new Date(vc.issuanceDate).toLocaleString()}</span>
            </div>
          </div>

          {isDuplicate && (
            <div className="duplicate-warning">
              <div className="warning-icon">⚠️</div>
              <div className="warning-content">
                <h4>중복 VC 감지</h4>
                <p>동일한 발급자, 발급받는 사람, VC 타입의 VC가 이미 저장되어 있습니다.</p>
                <p>승인하면 기존 VC가 {student ? '새로 발급된 VC로' : '새 VC로'} <strong>덮어쓰기</strong>됩니다.</p>
              </div>
            </div>
          )}
          </div>
        </div>
        
        <div className="modal-footer">
          <button 
            className="btn btn-ghost" 
            onClick={handleReject}
          >
            거절
          </button>
          <button 
            className="btn btn-success" 
            onClick={handleApprove}
          >
            {isDuplicate ? '덮어쓰기 승인' : (student ? '발급 승인' : '저장 승인')}
          </button>
        </div>
      </div>
    </div>
  );
};