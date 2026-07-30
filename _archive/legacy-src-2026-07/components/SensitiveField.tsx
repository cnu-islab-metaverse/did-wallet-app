import React from 'react'

type BaseProps = {
  id?: string
  placeholder?: string
  value: string
  onChange: (val: string) => void
  disabled?: boolean
  // 표시용 label은 외부에서 렌더링
}

type SensitiveInputProps = BaseProps & {
  type?: 'password' | 'text'
}

type SensitiveTextareaProps = BaseProps & {
  rows?: number
}

function useRandomName(prefix: string) {
  const ref = React.useRef<string>('')
  if (!ref.current) {
    ref.current = `${prefix}-${Math.random().toString(36).slice(2)}`
  }
  return ref.current
}

export const SensitiveInput = ({ id, placeholder, value, onChange, disabled, type = 'password' }: SensitiveInputProps): JSX.Element => {
  const randomName = useRandomName('sf-input')
  return (
    <input
      id={id}
      type={type}
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      // 자동완성/자동저장/맞춤법/대문자화 방지
      autoComplete={type === 'password' ? 'new-password' : 'off'}
      autoCorrect="off"
      autoCapitalize="none"
      spellCheck={false}
      name={randomName}
      // 일반 비밀번호 매니저 무시 힌트
      data-lpignore="true"
      data-1p-ignore="true"
      data-form-type="other"
      aria-autocomplete="none"
      // 모바일 키보드 힌트 최소화
      inputMode={type === 'password' ? 'text' : 'none'}
      // 브라우저 히스토리 저장 방지 유도
      form="no-browser-save"
    />
  )
}

export const SensitiveTextarea = ({ id, placeholder, value, onChange, disabled, rows = 4 }: SensitiveTextareaProps): JSX.Element => {
  const randomName = useRandomName('sf-textarea')
  return (
    <textarea
      id={id}
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      rows={rows}
      autoComplete="off"
      autoCorrect="off"
      autoCapitalize="none"
      spellCheck={false}
      name={randomName}
      data-lpignore="true"
      data-1p-ignore="true"
      data-form-type="other"
      aria-autocomplete="none"
      inputMode="none"
      form="no-browser-save"
    />
  )
}


