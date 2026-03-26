import { useState } from 'react'

interface Props {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  className?: string
}

export default function PasswordInput({ value, onChange, placeholder, className = '' }: Props): React.JSX.Element {
  const [visible, setVisible] = useState(false)

  return (
    <div className={`relative ${className}`}>
      <input
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-4 py-3 pr-12 rounded-xl bg-white/5 border border-glass-border text-sm text-text placeholder:text-text-muted/40 focus:outline-none focus:border-primary/60 transition-colors"
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted/50 hover:text-text-muted transition-colors"
      >
        {visible ? '🙈' : '👁️'}
      </button>
    </div>
  )
}
