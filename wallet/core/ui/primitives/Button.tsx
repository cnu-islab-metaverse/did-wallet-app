import React from 'react'

type Variant = 'primary' | 'secondary' | 'success' | 'danger' | 'ghost' | 'line'
type Size = 'sm' | 'md'

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  block?: boolean
  loading?: boolean
}

// 모든 버튼의 단일 진입점. variant/size 로 통일된 룩을 강제 → 위치·간격 어긋남 제거.
export const Button: React.FC<ButtonProps> = ({
  variant = 'primary', size = 'md', block, loading, disabled, children, className = '', ...rest
}) => {
  const cls = [
    'ui-btn', `ui-btn--${variant}`, `ui-btn--${size}`, block ? 'ui-btn--block' : '', className,
  ].filter(Boolean).join(' ')
  return (
    <button className={cls} disabled={disabled || loading} {...rest}>
      {loading && <span className="ui-spinner" aria-hidden />}
      {children}
    </button>
  )
}
