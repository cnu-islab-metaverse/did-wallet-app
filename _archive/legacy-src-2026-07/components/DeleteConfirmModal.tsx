import React, { useState, useEffect } from 'react';

interface DeleteConfirmModalProps {
  isOpen: boolean;
  vcName: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export const DeleteConfirmModal: React.FC<DeleteConfirmModalProps> = ({
  isOpen,
  vcName,
  onConfirm,
  onCancel
}) => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (isOpen) {
      // 모달 애니메이션을 위한 지연
      const timer = setTimeout(() => setIsVisible(true), 100);
      return () => clearTimeout(timer);
    } else {
      setIsVisible(false);
    }
  }, [isOpen]);

  const handleConfirm = () => {
    setIsVisible(false);
    setTimeout(onConfirm, 300); // 애니메이션 완료 후 실행
  };

  const handleCancel = () => {
    setIsVisible(false);
    setTimeout(onCancel, 300); // 애니메이션 완료 후 실행
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay visible">
      <div className="modal-content">
        <div className="modal-header">
          <h3>🗑️ VC 삭제 확인</h3>
          <button className="modal-close" onClick={handleCancel}>×</button>
        </div>
        
        <div className="modal-body">
          <p>
            <strong>"{vcName}"</strong> VC를 삭제하시겠습니까?
          </p>
          <p className="warning-text">
            이 작업은 되돌릴 수 없습니다.
          </p>
        </div>
        
        <div className="modal-footer">
          <button 
            className="btn btn-ghost" 
            onClick={handleCancel}
          >
            취소
          </button>
          <button 
            className="btn btn-danger" 
            onClick={handleConfirm}
          >
            삭제
          </button>
        </div>
      </div>
    </div>
  );
};
