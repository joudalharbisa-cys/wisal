import type { ButtonHTMLAttributes } from 'react'
import Spinner from './Spinner'

type Variant = 'primary' | 'secondary' | 'danger' | 'outline'

const VARIANT: Record<Variant, string> = {
  primary: 'bg-primary text-white shadow-sm hover:bg-primary-dark',
  secondary: 'bg-accent text-white shadow-sm hover:brightness-95',
  danger: 'bg-white text-urgent ring-1 ring-inset ring-urgent/30 hover:bg-urgent/5',
  outline: 'bg-white text-ink ring-1 ring-inset ring-line shadow-sm hover:bg-surface',
}

export default function Button({
  variant = 'primary',
  type = 'button',
  loading = false,
  disabled,
  className = '',
  children,
  ...rest
}: { variant?: Variant; loading?: boolean } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`${VARIANT[variant]} inline-flex items-center justify-center gap-2 rounded-control px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${className}`}
      {...rest}
    >
      {loading && <Spinner />}
      {children}
    </button>
  )
}
