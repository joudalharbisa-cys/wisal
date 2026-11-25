import type { SelectHTMLAttributes } from 'react'
import { inputClass } from './Input'

export default function Select({ invalid, className = '', children, ...rest }: SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }) {
  return (
    <select
      aria-invalid={invalid || undefined}
      className={`${inputClass} ${invalid ? 'border-urgent focus:ring-urgent/15' : 'border-line focus:border-primary focus:ring-primary-light'} ${className}`}
      {...rest}
    >
      {children}
    </select>
  )
}
