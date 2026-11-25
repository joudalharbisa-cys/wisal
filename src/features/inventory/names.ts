import type { Condition, Item } from './types'

/** Same product, same key: strips diacritics/tatweel, unifies alef/ta marbuta/ya, drops «ال», collapses spaces. */
export function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .replace(/[ً-ْٰـ]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    // Keys are doc ids and part of stock ids: no "/" and no "__".
    .replace(/\//g, '-')
    .replace(/_+/g, '_')
    .split(/\s+/)
    .filter(Boolean)
    .map(w => (w.startsWith('ال') && w.length - 2 >= 2 ? w.slice(2) : w))
    .join(' ')
}

function levenshtein(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0]
    prev[0] = i
    for (let j = 1; j <= b.length; j++) {
      const up = prev[j]
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1))
      diag = up
    }
  }
  return prev[b.length]
}

/** Close enough that the user should be asked "did you mean…?". */
export function isNearDuplicate(a: string, b: string): boolean {
  const x = normalizeName(a)
  const y = normalizeName(b)
  if (!x || !y) return false
  if (x === y) return true
  const [short, long] = x.length <= y.length ? [x, y] : [y, x]
  if (short.length >= 3 && long.includes(short)) return true
  return x.length >= 4 && y.length >= 4 && levenshtein(x, y) <= 2
}

/** A different product with a close name, or null. An exact key match is not "near" — it's the same product. */
export function findNearDuplicate(name: string, items: Item[]): Item | null {
  const key = normalizeName(name)
  if (items.some(i => i.key === key)) return null
  return items.find(i => isNearDuplicate(name, i.name)) ?? null
}

const seed = (name: string): Item => ({ key: normalizeName(name), name })

/** The prototype's four products; offered before anyone has created them. */
export const SEED_ITEMS: Item[] = ['كراسي متحركة', 'أجهزة تنفس', 'أسرّة طبية', 'أجهزة قياس ضغط'].map(seed)

export function mergeItems(db: Item[]): Item[] {
  const byKey = new Map<string, Item>()
  for (const i of SEED_ITEMS) byKey.set(i.key, i)
  for (const i of db) byKey.set(i.key, i)
  return [...byKey.values()].sort((a, b) => a.name.localeCompare(b.name, 'ar'))
}

/** Keys become doc ids and part of stock ids, so no "/" and no "__". */
export function isValidItemKey(k: string): boolean {
  return k.length > 0 && !k.includes('/') && !k.includes('__')
}

export function stockId(warehouseId: string, itemKey: string, c: Condition): string {
  return `${warehouseId}__${itemKey}__${c}`
}
