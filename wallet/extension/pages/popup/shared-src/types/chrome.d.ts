export {};

declare global {
  const chrome: {
    storage?: {
      local: {
        get: (keys: string | string[] | null) => Promise<Record<string, any>>;
        set: (items: Record<string, any>) => Promise<void>;
        remove: (keys: string | string[]) => Promise<void>;
        clear: () => Promise<void>;
      };
    };
    runtime?: {
      sendMessage: (message: any) => Promise<any>;
      onMessage: {
        addListener: (callback: (message: any, sender: any, sendResponse: any) => void) => void;
        removeListener: (callback: (message: any, sender: any, sendResponse: any) => void) => void;
      };
      id: string;
      lastError?: { message: string };
    };
    action?: {
      openPopup: () => Promise<void>;
    };
    tabs?: {
      query: (queryInfo: any) => Promise<any[]>;
      sendMessage: (tabId: number, message: any) => Promise<any>;
    };
  };
}
