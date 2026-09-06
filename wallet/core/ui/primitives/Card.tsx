import React from 'react'

export interface CardProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  title?: React.ReactNode
}

// 패널/카드 통일. title 을 주면 좌측 강조바가 달린 제목이 붙는다.
export const Card: React.FC<CardProps> = ({ title, children, className = '', ...rest }) => (
  <div className={['ui-card', className].filter(Boolean).join(' ')} {...rest}>
    {title != null && <h2 className="ui-card__title">{title}</h2>}
    {children}
  </div>
)

export const EmptyState: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="ui-empty">{children}</div>
)
