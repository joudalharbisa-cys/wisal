/** Arabic-Indic (and Persian) digits → Western digits. */
export const toWesternDigits = (s: string) =>
  s.replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 0x0660)).replace(/[۰-۹]/g, d => String(d.charCodeAt(0) - 0x06f0))

/** What a numeric field keeps while the user types: Western digits only, at most `max` of them. */
export const onlyDigits = (s: string, max: number) => toWesternDigits(s).replace(/\D/g, '').slice(0, max)
