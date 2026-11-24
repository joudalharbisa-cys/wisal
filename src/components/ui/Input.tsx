import type { InputHTMLAttributes } from 'react'

export const inputClass =
  'h-10 w-full rounded-control border bg-white px-3 text-sm shadow-[0_1px_2px_rgba(16,24,40,0.04)] focus:outline-none focus:ring-4 disabled:bg-surface'

export default function Input({ invalid, className = '', ...rest }: InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  return (
    <input
      aria-invalid={invalid || undefined}
      className={`${inputClass} ${invalid ? 'border-urgent focus:ring-urgent/15' : 'border-line focus:border-primary focus:ring-primary-light'} ${className}`}
      {...rest}
    />
  )
}
