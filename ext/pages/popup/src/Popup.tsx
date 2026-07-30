import '@src/Popup.css';
import { withErrorBoundary, withSuspense } from '@extension/shared';
import { ErrorDisplay, LoadingSpinner } from '@extension/ui';
// 씬클라이언트 팝업 — 확장은 지갑을 보관하지 않고 데스크톱 프로그램에 위임한다.
// (기존의 공유 App 전체 마운트는 데스크톱 전용. 확장은 ThinPopup 만.)
import ThinPopup from './ThinPopup';

const Popup = () => {
  return (
    <div>
      <ThinPopup />
    </div>
  );
};

export default withErrorBoundary(withSuspense(Popup, <LoadingSpinner />), ErrorDisplay);
