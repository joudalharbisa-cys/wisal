function cryptoRandom(): number {
  const a = new Uint32Array(1)
  crypto.getRandomValues(a)
  return a[0] / 2 ** 32
}

/** 4-digit receipt code, zero-padded ('0000'–'9999'). */
export function makeReceiptCode(rand: () => number = cryptoRandom): string {
  return String(Math.min(9999, Math.floor(rand() * 10000))).padStart(4, '0')
}
