/** Green brand band behind the top of a page; white cards float over it. */
export default function BrandBand({ tall = false }: { tall?: boolean }) {
  return (
    <div aria-hidden="true" className={`absolute inset-x-0 top-0 overflow-hidden bg-gradient-to-bl from-primary to-primary-dark ${tall ? 'h-[468px]' : 'h-72'}`}>
      <svg className="absolute inset-0 size-full opacity-[0.06]">
        <defs>
          <pattern id="brand-dots" width="22" height="22" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1.4" fill="white" /></pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#brand-dots)" />
      </svg>
      <div className="absolute -start-32 -top-32 size-96 rounded-full bg-accent/20 blur-3xl" />
    </div>
  )
}
