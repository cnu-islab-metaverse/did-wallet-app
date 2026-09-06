import React from 'react'

export interface FieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: React.ReactNode
  hint?: React.ReactNode
  error?: React.ReactNode
}

// 라벨+입력+힌트/에러 규격 통일. 모든 폼 입력의 단일 진입점.
export const Field: React.FC<FieldProps> = ({ label, hint, error, id, className = '', ...rest }) => {
  const fieldId = id || rest.name || undefined
  return (
    <div className={['ui-field', error ? 'ui-field--error' : '', className].filter(Boolean).join(' ')}>
      {label != null && <label className="ui-field__label" htmlFor={fieldId}>{label}</label>}
      <input id={fieldId} className="ui-field__control" {...rest} />
      {(error ?? hint) != null && <span className="ui-field__msg">{error ?? hint}</span>}
    </div>
  )
}
