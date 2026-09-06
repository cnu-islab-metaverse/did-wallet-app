import React from 'react'

export interface ListRowProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  title?: React.ReactNode
  sub?: React.ReactNode
  left?: React.ReactNode
  right?: React.ReactNode
}

// 목록 한 줄 통일(계정·VC·SBT·네트워크 등). left/main(title,sub)/right 슬롯.
export const ListRow: React.FC<ListRowProps> = ({ title, sub, left, right, className = '', ...rest }) => (
  <div className={['ui-listrow', className].filter(Boolean).join(' ')} {...rest}>
    {left}
    <div className="ui-listrow__main">
      {title != null && <div className="ui-listrow__title">{title}</div>}
      {sub != null && <div className="ui-listrow__sub">{sub}</div>}
    </div>
    {right}
  </div>
)

export const Spinner: React.FC<{ className?: string }> = ({ className = '' }) => (
  <span className={['ui-spinner', className].filter(Boolean).join(' ')} aria-label="로딩 중" />
)
