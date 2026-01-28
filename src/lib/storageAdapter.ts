import { isChromeStorageAvailable } from '../utils/platform';


// IndexedDB fallback (Chromium uses LevelDB under the hood)
const DB_NAME = 'did_wallet_db'
const STORE_NAME = 'kv'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME)
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function idbGet<T = any>(key: string): Promise<T | undefined> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const store = tx.objectStore(STORE_NAME)
    const req = store.get(key)
    req.onsuccess = () => resolve(req.result as T | undefined)
    req.onerror = () => reject(req.error)
  })
}

async function idbSet<T = any>(key: string, value: T): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    const req = store.put(value, key)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })
}

async function idbRemove(key: string): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    const req = store.delete(key)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })
}

export const storageAdapter = {
  async get<T = any>(key: string): Promise<T | undefined> {
    if (isChromeStorageAvailable()) {
      // @ts-ignore
      const result = await chrome.storage.local.get([key])
      return result?.[key] as T | undefined
    }
    return idbGet<T>(key)
  },
  async set<T = any>(key: string, value: T): Promise<void> {
    if (isChromeStorageAvailable()) {
      // @ts-ignore
      await chrome.storage.local.set({ [key]: value })
      return
    }
    await idbSet<T>(key, value)
  },
  async remove(key: string): Promise<void> {
    if (isChromeStorageAvailable()) {
      // @ts-ignore
      await chrome.storage.local.remove([key])
      return
    }
    await idbRemove(key)
  },

  async getAll(): Promise<Record<string, any>> {
    if (isChromeStorageAvailable()) {
      // @ts-ignore
      return new Promise((resolve) => {
        chrome.storage.local.get(null, (result) => {
          resolve(result)
        })
      })
    }
    // For IndexedDB, get all keys and then fetch each value individually
    const db = await openDb()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const store = tx.objectStore(STORE_NAME)
      
      // Get all keys first
      const keysReq = store.getAllKeys()
      keysReq.onsuccess = () => {
        const keys = keysReq.result
        if (keys.length === 0) {
          resolve({})
          return
        }
        
        // Fetch each value individually to ensure correct key-value mapping
        const result: Record<string, any> = {}
        let completed = 0
        
        if (keys.length === 0) {
          resolve(result)
          return
        }
        
        keys.forEach((key) => {
          const valueReq = store.get(key)
          valueReq.onsuccess = () => {
            result[String(key)] = valueReq.result
            completed++
            if (completed === keys.length) {
              resolve(result)
            }
          }
          valueReq.onerror = () => reject(valueReq.error)
        })
      }
      keysReq.onerror = () => reject(keysReq.error)
    })
  }
}

export {}


