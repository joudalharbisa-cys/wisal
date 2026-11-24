// Wesal mark: two strokes meeting at a gold point — need and support connecting.
export default function LogoMark({ className = 'size-9' }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden="true">
      <rect width="40" height="40" rx="10" className="fill-primary" />
      <path d="M11 13c0 8 4 14 9 14" fill="none" stroke="white" strokeWidth="3.2" strokeLinecap="round" />
      <path d="M29 13c0 8-4 14-9 14" fill="none" className="stroke-accent-light" strokeWidth="3.2" strokeLinecap="round" />
      <circle cx="20" cy="27" r="2.6" className="fill-accent" />
    </svg>
  )
}
