import React, { useState } from 'react';
import { VerifiableCredential } from '../types/vc';
import { verifyVC, validateVCFormat, VCVerificationResult } from '../lib/vcVerification';

interface AddVCModalProps {
  onClose: () => void;
  onAddVC: (vc: VerifiableCredential) => void;
}

export const AddVCModal: React.FC<AddVCModalProps> = ({ onClose, onAddVC }) => {
  const [vcInput, setVcInput] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationResult, setVerificationResult] = useState<VCVerificationResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handlePasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setVcInput(text);
      setError(null);
    } catch (err) {
      setError('클립보드에서 텍스트를 읽을 수 없습니다');
    }
  };

  const handleVerifyAndAdd = async () => {
    if (!vcInput.trim()) {
      setError('VC를 입력해주세요');
      return;
    }

    setIsVerifying(true);
    setError(null);
    setVerificationResult(null);

    try {
      // 1. 형식 검증
      const formatValidation = validateVCFormat(vcInput.trim());
      if (!formatValidation.isValid) {
        setVerificationResult(null);
        setError(formatValidation.error || '유효하지 않은 VC 형식입니다');
        setIsVerifying(false);
        return;
      }

      // 2. 서명 검증
      const verification = await verifyVC(vcInput.trim());

      if (verification.isValid) {
        setVerificationResult(verification);
        // 검증 성공 시 VC 추가 (경고가 있어도 성공으로 처리)
        const vc = formatValidation.vc!;
        onAddVC(vc);
        onClose();
      } else {
        setVerificationResult(null); // 오류 박스만 출력하도록 중복 표시 방지
        setError(`VC 검증 실패: ${verification.errors.join(', ')}`);
      }
    } catch (err: any) {
      setVerificationResult(null);
      setError(`검증 중 오류 발생: ${err.message}`);
    } finally {
      setIsVerifying(false);
    }
  };

  const handleClose = () => {
    setVcInput('');
    setVerificationResult(null);
    setError(null);
    onClose();
  };

  return (
    <div className="modal-overlay visible" onClick={handleClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>📋 VC 추가</h3>
          <button className="modal-close" onClick={handleClose}>×</button>
        </div>
        
        <div className="modal-body">
          <div className="vc-input-section">
            <label htmlFor="vc-input">VC (JSON 또는 JWT 형식):</label>
            <div className="input-group">
              <textarea
                id="vc-input"
                value={vcInput}
                onChange={(e) => setVcInput(e.target.value)}
                placeholder="VC를 JSON 또는 JWT 형식으로 입력하거나 클립보드에서 붙여넣기하세요..."
                rows={8}
                className="vc-textarea"
              />
              <button 
                className="btn btn-secondary btn-small"
                onClick={handlePasteFromClipboard}
                disabled={isVerifying}
              >
                📋 클립보드에서 붙여넣기
              </button>
            </div>
          </div>

          {error && (
            <div className="error-message">
              <div className="error-icon">❌</div>
              <span>{error}</span>
            </div>
          )}

          {verificationResult && (verificationResult.isValid || verificationResult.warnings.length > 0) && (
            <div className={`verification-result ${verificationResult.isValid ? 'valid' : 'invalid'}`}>
              <div className="verification-header">
                <div className="verification-icon">
                  {verificationResult.isValid ? '✅' : '❌'}
                </div>
                <div className="verification-title">
                  {verificationResult.isValid ? '검증 성공' : '검증 실패'}
                </div>
              </div>
              
              {/* 에러는 상단 에러박스로만 보여주고, 여기서는 중복 표시하지 않음 */}
              
              {verificationResult.warnings.length > 0 && (
                <div className="verification-warnings">
                  <h4>경고:</h4>
                  <ul>
                    {verificationResult.warnings.map((warning: string, index: number) => (
                      <li key={index}>{warning}</li>
                    ))}
                  </ul>
                </div>
              )}
              
              {verificationResult.issuerPublicKey && (
                <div className="verification-info">
                  <h4>발급자 정보:</h4>
                  <p><strong>Public Key:</strong> {verificationResult.issuerPublicKey}</p>
                  {verificationResult.verificationMethod && (
                    <p><strong>Verification Method:</strong> {verificationResult.verificationMethod}</p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
        
        <div className="modal-footer">
          <button 
            className="btn btn-secondary" 
            onClick={handleClose}
            disabled={isVerifying}
          >
            취소
          </button>
          <button 
            className="btn btn-primary" 
            onClick={handleVerifyAndAdd}
            disabled={isVerifying || !vcInput.trim()}
          >
            {isVerifying ? '검증 중...' : (verificationResult?.isValid ? '추가' : '검증 후 추가')}
          </button>
        </div>
      </div>
    </div>
  );
};
