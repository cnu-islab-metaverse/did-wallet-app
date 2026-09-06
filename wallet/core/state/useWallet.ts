// [작업] 아바타(HD 계정) 관리 상태 훅 — hdWalletService 를 감싸 UI 에 상태/동작 제공.
//        각 계정은 주소 + did:ethr(라벨). 생성/가져오기/언락/잠금/추가/전환/이름변경.
//        개발 모드(import.meta.env.DEV)에서는 프리셋으로 자동 생성·언락(테스트 편의).
// [결과] useWallet() → { status, accounts(각 did 포함), active, createWallet/importWallet/unlock/lock/... }
import { useCallback, useEffect, useState } from 'react'
import { ethers } from 'ethers'
import { hdWalletService } from '../lib/hdWalletService'
import type { WalletAccount } from '../types/hdWallet'
import { DEV_WALLET, isDevModeEnabled } from '../config/dev.config'

export type WalletStatus = 'loading' | 'uninitialized' | 'locked' | 'unlocked'

export function useWallet() {
  const [status, setStatus] = useState<WalletStatus>('loading')
  const [accounts, setAccounts] = useState<WalletAccount[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)

  const sync = useCallback(() => {
    setAccounts([...hdWalletService.getAccounts()])
    setActiveId(hdWalletService.getActiveAccount()?.id ?? null)
    setStatus(!hdWalletService.isInitialized() ? 'uninitialized' : hdWalletService.isUnlocked() ? 'unlocked' : 'locked')
  }, [])

  useEffect(() => {
    let alive = true
    ;(async () => {
      await hdWalletService.loadState()
      // 개발 편의(dev 빌드 && enabled): start='fixed' 면 고정 니모닉으로 자동 생성/언락.
      // start='empty' 면 아무것도 하지 않고 온보딩/잠금해제 UI 로 진행. 배포 빌드에선 항상 무시.
      if (isDevModeEnabled() && DEV_WALLET.start === 'fixed') {
        const { mnemonic, password } = DEV_WALLET
        try {
          if (!hdWalletService.isInitialized()) {
            await hdWalletService.initializeFromMnemonic(mnemonic, password)
          } else if (!hdWalletService.isUnlocked()) {
            const ok = await hdWalletService.unlock(password)
            if (!ok) { // 옛(암호화 스텁)·비번 불일치 지갑 → 개발용으로 재생성
              await hdWalletService.clearState()
              await hdWalletService.initializeFromMnemonic(mnemonic, password)
            }
          }
        } catch { /* ignore */ }
      }
      if (alive) sync()
    })()
    return () => { alive = false }
  }, [sync])

  const generateMnemonic = useCallback(() => ethers.Wallet.createRandom().mnemonic!.phrase, [])
  const createWallet = useCallback(async (mnemonic: string, password: string) => {
    const ok = await hdWalletService.initializeFromMnemonic(mnemonic, password); sync(); return ok
  }, [sync])
  const importWallet = useCallback(async (mnemonic: string, password: string) => {
    const ok = await hdWalletService.initializeFromMnemonic(mnemonic.trim().toLowerCase(), password); sync(); return ok
  }, [sync])
  const unlock = useCallback(async (password: string) => { const ok = await hdWalletService.unlock(password); sync(); return ok }, [sync])
  const lock = useCallback(() => { hdWalletService.lock(); sync() }, [sync])
  const addAccount = useCallback(async (name?: string) => { const r = await hdWalletService.createAccount(name); sync(); return r }, [sync])
  const switchAccount = useCallback(async (id: string) => { await hdWalletService.setActiveAccount(id); sync() }, [sync])
  const renameAccount = useCallback(async (id: string, name: string) => { await hdWalletService.updateAccountName(id, name); sync() }, [sync])
  const reset = useCallback(async () => { await hdWalletService.clearState(); sync() }, [sync])

  const active = accounts.find((a) => a.id === activeId) ?? null
  return { status, accounts, active, generateMnemonic, createWallet, importWallet, unlock, lock, addAccount, switchAccount, renameAccount, reset }
}
