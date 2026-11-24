import type { ButtonHTMLAttributes } from 'react'

type Variant = 'primary' | 'secondary' | 'danger' | 'outline'

const VARIANT: Record<Variant, string> = {
  primary: 'bg-primary text-white hover:bg-primary-dark',
  secondary: 'bg-accent text-white hover:opacity-90',
  danger: 'bg-urgent text-white hover:opacity-90',
  outline: 'bg-white text-primary border border-primary hover:bg-primary-light',
}

export default function Button({
  variant = 'primary',
  type = 'button',
  className = '',
  ...rest
}: { variant?: Variant } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type={type}
      className={`${VARIANT[variant]} rounded-control px-5 py-2.5 font-medium transition disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${className}`}
      {...rest}
    />
  )
}
