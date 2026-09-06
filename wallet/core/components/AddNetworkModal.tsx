import React, { useState } from 'react';
import { networkService } from '../lib/networkService';
import { NetworkConfig } from '../types/network';

interface AddNetworkModalProps {
  onClose: () => void;
  onNetworkAdded: () => void;
  editTarget?: NetworkConfig | null;
}

export const AddNetworkModal: React.FC<AddNetworkModalProps> = ({ onClose, onNetworkAdded, editTarget }) => {
  const [formData, setFormData] = useState({
    name: editTarget?.name ?? '',
    rpcUrl: editTarget?.rpcUrl ?? '',
    chainId: editTarget ? String(editTarget.chainId) : '',
    symbol: editTarget?.symbol ?? '',
    explorerUrl: editTarget?.explorerUrl ?? '',
  });
  const [isValidating, setIsValidating] = useState(false);
  const [error, setError] = useState('');

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setError(''); // Clear error when user types
  };

  const validateForm = (): boolean => {
    if (!formData.name.trim()) {
      setError('네트워크 이름을 입력해주세요.');
      return false;
    }
    if (!formData.rpcUrl.trim()) {
      setError('RPC URL을 입력해주세요.');
      return false;
    }
    if (!formData.chainId.trim() || isNaN(Number(formData.chainId))) {
      setError('올바른 체인 ID를 입력해주세요.');
      return false;
    }
    if (!formData.symbol.trim()) {
      setError('통화 기호를 입력해주세요.');
      return false;
    }
    
    // URL validation
    try {
      new URL(formData.rpcUrl);
    } catch {
      setError('올바른 RPC URL을 입력해주세요.');
      return false;
    }

    if (formData.explorerUrl && formData.explorerUrl.trim()) {
      try {
        new URL(formData.explorerUrl);
      } catch {
        setError('올바른 탐색기 URL을 입력해주세요.');
        return false;
      }
    }

    return true;
  };

  const handleSubmit = async () => {
    if (!validateForm()) return;

    setIsValidating(true);
    setError('');

    try {
      const networkConfig: Omit<NetworkConfig, 'isCustom'> = {
        name: formData.name.trim(),
        rpcUrl: formData.rpcUrl.trim(),
        chainId: Number(formData.chainId),
        symbol: formData.symbol.trim().toUpperCase(),
        explorerUrl: formData.explorerUrl.trim() || undefined,
      };

      if (editTarget) {
        await networkService.updateNetwork({ ...networkConfig, isCustom: editTarget.isCustom });
      } else {
        await networkService.addCustomNetwork(networkConfig);
      }
      onNetworkAdded();
    } catch (err) {
      setError(err instanceof Error ? err.message : '네트워크 추가에 실패했습니다.');
    } finally {
      setIsValidating(false);
    }
  };

  return (
    <div className="modal-overlay visible" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{editTarget ? '네트워크 수정' : '네트워크 추가'}</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="modal-body">
          <div className="form-group">
            <label htmlFor="network-name">네트워크 이름</label>
            <input
              id="network-name"
              type="text"
              placeholder="네트워크 이름 입력"
              value={formData.name}
              onChange={(e) => handleInputChange('name', e.target.value)}
            />
          </div>

          <div className="form-group">
            <label htmlFor="rpc-url">기본 RPC URL</label>
            <input
              id="rpc-url"
              type="url"
              placeholder="https://..."
              value={formData.rpcUrl}
              onChange={(e) => handleInputChange('rpcUrl', e.target.value)}
            />
          </div>

          <div className="form-group">
            <label htmlFor="chain-id">체인 ID</label>
            <input
              id="chain-id"
              type="number"
              placeholder="1"
              value={formData.chainId}
              onChange={(e) => handleInputChange('chainId', e.target.value)}
            />
          </div>

          <div className="form-group">
            <label htmlFor="currency-symbol">통화 기호</label>
            <input
              id="currency-symbol"
              type="text"
              placeholder="ETH"
              value={formData.symbol}
              onChange={(e) => handleInputChange('symbol', e.target.value)}
            />
          </div>

          <div className="form-group">
            <label htmlFor="explorer-url">블록 탐색기 URL (선택사항)</label>
            <input
              id="explorer-url"
              type="url"
              placeholder="https://etherscan.io"
              value={formData.explorerUrl}
              onChange={(e) => handleInputChange('explorerUrl', e.target.value)}
            />
          </div>

          {error && (
            <div className="error-message">
              {error}
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button 
            className="btn btn-ghost" 
            onClick={onClose}
            disabled={isValidating}
          >
            취소
          </button>
          <button 
            className="btn btn-primary" 
            onClick={handleSubmit}
            disabled={isValidating}
          >
            {isValidating ? '검증 중...' : '저장'}
          </button>
        </div>
      </div>
    </div>
  );
};
