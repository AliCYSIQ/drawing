import type { ButtonHTMLAttributes, ReactNode } from 'react'

type Tone = 'primary' | 'quiet' | 'ghost' | 'danger'

const tones: Record<Tone, string> = {
  primary: 'bg-blue text-bg hover:brightness-110 font-semibold',
  quiet: 'bg-raised text-ink hover:bg-line',
  ghost: 'text-muted hover:text-ink hover:bg-raised',
  danger: 'text-red hover:bg-raised'
}

export function Button({
  tone = 'quiet',
  className = '',
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: Tone }) {
  return (
    <button
      type="button"
      className={`inline-flex h-9 items-center justify-center gap-2 rounded-md px-3.5 text-[13px] transition-colors disabled:pointer-events-none disabled:opacity-40 ${tones[tone]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  )
}

export function IconButton({
  label,
  active,
  className = '',
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; active?: boolean }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={`inline-flex h-9 w-9 items-center justify-center rounded-md transition-colors ${
        active ? 'bg-blue-soft text-blue' : 'text-muted hover:bg-raised hover:text-ink'
      } ${className}`}
      {...rest}
    >
      {children}
    </button>
  )
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
  label: string
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-md bg-surface p-0.5 ring-1 ring-line">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={`h-8 rounded-[5px] px-3 text-[13px] transition-colors ${
            value === o.value ? 'bg-raised text-ink shadow-[inset_0_-2px_0_var(--blue)]' : 'text-muted hover:text-ink'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Toggle({
  checked,
  onChange,
  label,
  hint
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: ReactNode
  hint?: ReactNode
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition-colors ${checked ? 'bg-blue' : 'bg-line'}`}
      >
        <span
          className={`absolute left-0 top-0.5 h-4 w-4 rounded-full bg-bg transition-transform ${
            checked ? 'translate-x-[18px]' : 'translate-x-0.5'
          }`}
        />
      </button>
      <span>
        <span className="block text-ink">{label}</span>
        {hint && <span className="block text-[12.5px] text-muted">{hint}</span>}
      </span>
    </label>
  )
}

export function NumberField({
  value,
  onChange,
  min = 0,
  max = 9999,
  suffix,
  label,
  className = ''
}: {
  value: number
  onChange: (v: number) => void
  min?: number
  max?: number
  suffix?: string
  label: string
  className?: string
}) {
  return (
    <span className={`inline-flex h-9 items-center rounded-md bg-surface ring-1 ring-line focus-within:ring-blue ${className}`}>
      <input
        aria-label={label}
        type="number"
        min={min}
        max={max}
        value={Number.isFinite(value) ? value : ''}
        onChange={(e) => {
          const n = Math.round(Number(e.target.value))
          if (Number.isFinite(n)) onChange(Math.min(max, Math.max(min, n)))
        }}
        className="tnum h-full w-16 bg-transparent px-2.5 text-ink outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
      />
      {suffix && <span className="pr-2.5 text-muted">{suffix}</span>}
    </span>
  )
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <div className="grid grid-cols-[110px_1fr] items-start gap-4 py-3">
      <div className="pt-2 text-muted">{label}</div>
      <div className="min-w-0">
        {children}
        {hint && <div className="mt-1.5 text-[12.5px] text-muted">{hint}</div>}
      </div>
    </div>
  )
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      <svg width="120" height="64" viewBox="0 0 120 64" className="pencil text-line" aria-hidden="true">
        <path d="M8 48c18-30 30-38 44-30s20 30 34 26 18-22 26-30" stroke="currentColor" strokeWidth="2.5" fill="none" />
        <path d="M14 56c22-4 60-6 92-2" stroke="var(--blue)" strokeWidth="1.8" fill="none" opacity="0.7" />
      </svg>
      <div className="text-[15px] font-semibold text-ink">{title}</div>
      {children && <div className="max-w-sm text-muted">{children}</div>}
    </div>
  )
}

export function PageHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-3 pb-5">
      <h1 className="mr-auto text-[22px] font-semibold tracking-[-0.01em] text-ink">{title}</h1>
      {children}
    </div>
  )
}
