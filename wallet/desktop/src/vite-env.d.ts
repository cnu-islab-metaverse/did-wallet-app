/// <reference types="vite/client" />

interface Window {
  ipcRenderer: {
    on: (channel: string, listener: (...args: any[]) => void) => void;
    off: (channel: string, ...omit: any[]) => void;
    send: (channel: string, ...omit: any[]) => void;
    invoke: (channel: string, ...omit: any[]) => Promise<any>;
    reloadApp: () => Promise<void>;
    windowMinimize: () => Promise<void>;
    windowToggleMaximize: () => Promise<void>;
    windowIsMaximized: () => Promise<boolean>;
    windowClose: () => Promise<void>;
  };
}