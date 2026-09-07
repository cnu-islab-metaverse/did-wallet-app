// [작업] 활성 계정의 증명서(VC) 목록 상태 훅. 주소가 바뀌면 해당 계정 VC 를 다시 로드.
// [결과] useVCs(address, seed?) → { vcs, groups, loading, addVC, removeVC, removeLineage, vcId, refresh }
//        groups 는 재발급본을 계보로 묶은 목록(대표 + 이력).
import { useCallback, useEffect, useState } from 'react'
import * as vcStore from '../lib/vcStore'

export function useVCs(address: string | undefined, seedIfEmpty?: any[]) {
  const [vcs, setVcs] = useState<any[]>([])
  const [groups, setGroups] = useState<vcStore.VCGroup[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    if (!address) { setVcs([]); setGroups([]); setLoading(false); return }
    setLoading(true)
    let list = await vcStore.getVCs(address)
    if (seedIfEmpty && seedIfEmpty.length) {
      await vcStore.seedVCs(address, seedIfEmpty)
      list = await vcStore.getVCs(address)
    }
    setVcs(list)
    setGroups(vcStore.groupVCs(list))
    setLoading(false)
  }, [address, seedIfEmpty])

  useEffect(() => { refresh() }, [refresh])

  const addVC = useCallback(async (vc: any) => {
    if (!address) return { ok: false as const }
    const r = await vcStore.addVC(address, vc)
    await refresh()
    return r
  }, [address, refresh])

  const removeVC = useCallback(async (id: string) => {
    if (!address) return
    await vcStore.removeVC(address, id)
    await refresh()
  }, [address, refresh])

  // 계보 전체(재발급 이력 포함) 삭제
  const removeLineage = useCallback(async (lineage: string) => {
    if (!address) return
    await vcStore.removeLineage(address, lineage)
    await refresh()
  }, [address, refresh])

  return { vcs, groups, loading, addVC, removeVC, removeLineage, vcId: vcStore.vcId, lineageOf: vcStore.vcLineage, refresh }
}
