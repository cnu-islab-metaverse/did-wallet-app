import React from 'react';
import { VerifiableCredential } from '../types/vc';
import { getDemoVpRequest, buildVpFromRequestAndVc, type VerifiablePresentation } from '../lib/vpRequestHandler';
import { DataModal } from './DataModal';

interface VCDataModalProps {
  vc: VerifiableCredential | null;
  onClose: () => void;
}

export const VCDataModal: React.FC<VCDataModalProps> = ({ vc, onClose }) => {
  const [vp, setVp] = React.useState<VerifiablePresentation | null>(null);

  if (!vc) return null;

  return (
    <DataModal
      isOpen={!!vc}
      title={<span>VC 상세 정보</span>}
      onClose={onClose}
      footer={(
        <>
          <button
            className="btn btn-secondary"
            onClick={() => {
              try {
                const demoReq = getDemoVpRequest();
                const vpBuilt = buildVpFromRequestAndVc(demoReq, vc);
                setVp(vpBuilt);
                const event = new CustomEvent('showToast', { detail: 'VP가 생성되었습니다.' });
                window.dispatchEvent(event);
              } catch (e) {
                console.error('VP 생성 실패:', e);
                const event = new CustomEvent('showToast', { detail: 'VP 생성 실패 ❌' });
                window.dispatchEvent(event);
              }
            }}
          >VP 생성</button>
          <button className="btn btn-primary" onClick={onClose}>닫기</button>
        </>
      )}
    >
      <div className="data-info">
        <div className="data-field">
          <label>발급자:</label>
          <span>{(vc as any).issuer?.name || (vc as any).issuer?.id}</span>
        </div>
        <div className="data-field">
          <label>주체:</label>
          <span>{(vc as any).credentialSubject?.name || (vc as any).credentialSubject?.studentName || (vc as any).credentialSubject?.id}</span>
        </div>
        <div className="data-field">
          <label>발급일:</label>
          <span>{new Date((vc as any).issuanceDate).toLocaleString()}</span>
        </div>
        {(vc as any).expirationDate && (
          <div className="data-field">
            <label>만료일:</label>
            <span>{new Date((vc as any).expirationDate).toLocaleString()}</span>
          </div>
        )}
        {(vc as any).savedAt && (
          <div className="data-field">
            <label>저장일:</label>
            <span>{new Date((vc as any).savedAt).toLocaleString()}</span>
          </div>
        )}
        {(vc as any).origin && (
          <div className="data-field">
            <label>발급 사이트:</label>
            <span>{(vc as any).origin}</span>
          </div>
        )}
      </div>

      <div className="data-json">
        <label>VC JSON:</label>
        <div className="json-field">
          <pre>{JSON.stringify(vc, null, 2)}</pre>
        </div>
      </div>

      {vp && (
        <div className="data-json" style={{ marginTop: 12 }}>
          <label>생성된 VP JSON:</label>
          <div className="json-field">
            <pre>{JSON.stringify(vp, null, 2)}</pre>
          </div>
        </div>
      )}
    </DataModal>
  );
};

export default VCDataModal;


