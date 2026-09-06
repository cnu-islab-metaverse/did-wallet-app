import React, { createContext, useContext, useState, useRef, useEffect } from 'react';

interface ToastContextType {
  showToast: (message: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};

interface ToastProviderProps {
  children: React.ReactNode;
}

export const ToastProvider: React.FC<ToastProviderProps> = ({ children }) => {
  const [toast, setToast] = useState<string | null>(null);
  const [toastVisible, setToastVisible] = useState(false);
  const toastTimerRef = useRef<number | null>(null);
  const TOAST_DURATION_MS = 5000; // 5 seconds

  // Toast management
  useEffect(() => {
    if (toast) {
      setToastVisible(true);
      
      // Clear any existing timer
      if (toastTimerRef.current) {
        window.clearTimeout(toastTimerRef.current);
      }
      
      // Set timer to fade out after duration
      toastTimerRef.current = window.setTimeout(() => {
        setToastVisible(false);
        
        // Remove toast after fade animation completes (300ms)
        setTimeout(() => {
          setToast(null);
        }, 300);
      }, TOAST_DURATION_MS);
    }
    
    return () => {
      if (toastTimerRef.current) {
        window.clearTimeout(toastTimerRef.current);
      }
    };
  }, [toast, TOAST_DURATION_MS]);

  const showToast = (message: string) => {
    setToast(message);
  };

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {toast && (
        <div className={`toast ${toastVisible ? 'toast--visible' : 'toast--hidden'}`} role="status">
          {toast}
        </div>
      )}
    </ToastContext.Provider>
  );
};