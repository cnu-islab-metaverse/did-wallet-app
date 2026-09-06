// 전역 토스트 관리자
class ToastManager {
  private listeners: Set<(message: string) => void> = new Set();

  // 토스트 리스너 등록
  addListener(listener: (message: string) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  // 토스트 표시
  show(message: string) {
    this.listeners.forEach(listener => listener(message));
  }
}

export const toastManager = new ToastManager();

// 편의 함수
export const showToast = (message: string) => {
  toastManager.show(message);
};