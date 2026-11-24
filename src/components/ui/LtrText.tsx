import type { ReactNode } from 'react'

export default function LtrText({ children }: { children: ReactNode }) {
  return <bdi dir="ltr">{children}</bdi>
}
