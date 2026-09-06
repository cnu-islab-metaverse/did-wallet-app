import React from 'react';

interface DataModalProps {
  isOpen: boolean;
  title?: React.ReactNode;
  onClose: () => void;
  children?: React.ReactNode;
  footer?: React.ReactNode;
}

export const DataModal: React.FC<DataModalProps> = ({ isOpen, title, onClose, children, footer }) => {
  if (!isOpen) return null;
  return (
    <div className="data-modal-overlay visible" onClick={onClose}>
      <div className="data-modal" onClick={(e) => e.stopPropagation()}>
        <div className="data-modal__header">
          {title && <h3>{title}</h3>}
          <button className="data-modal__close" onClick={onClose}>×</button>
        </div>
        <div className="data-modal__body">
          {children}
        </div>
        {footer && (
          <div className="data-modal__footer">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};

export default DataModal;


