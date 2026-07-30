export {}

declare global {
  interface Window {
    ipcRenderer: {
      on: (...args: any[]) => void
      off: (...args: any[]) => void
      send: (...args: any[]) => void
      invoke: (...args: any[]) => Promise<any>
      reloadApp: () => Promise<void>
      windowMinimize: () => Promise<void>
      windowToggleMaximize: () => Promise<void>
      windowIsMaximized: () => Promise<boolean>
      windowClose: () => Promise<void>
    }
  }
}

// Electron IPC types for shared use
export interface ElectronAPI {
  ipcRenderer?: {
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

declare global {
  interface Window extends ElectronAPI {}
}

export {};
