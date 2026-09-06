import React, { useEffect } from 'react'

export interface ModalProps {
  open: boolean
  title?: React.ReactNode
  onClose: () => void
  footer?: React.ReactNode
  children: React.ReactNode
  closeOnBackdrop?: boolean
}

// 단일 모달 셸 — 모든 팝업이 이걸 재사용해 헤더·본문·푸터(액션 위치) 규격을 통일.
// ESC/백드롭 닫기 지원. (기존 12종 애드혹 모달을 이 하나로 대체)
export const Modal: React.FC<ModalProps> = ({ open, title, onClose, footer, children, closeOnBackdrop = true }) => {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null
  return (
    <div className="ui-modal__backdrop" onClick={closeOnBackdrop ? onClose : undefined}>
      <div className="ui-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        {title != null && (
          <div className="ui-modal__header">
            <h3 className="ui-modal__title">{title}</h3>
            <button className="ui-modal__close" aria-label="닫기" onClick={onClose}>×</button>
          </div>
        )}
        <div className="ui-modal__body">{children}</div>
        {footer != null && <div className="ui-modal__footer">{footer}</div>}
      </div>
    </div>
  )
}
