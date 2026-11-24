import type { ReactNode } from 'react'

export default function Table({ columns, rows }: { columns: string[]; rows: ReactNode[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-max text-start text-sm">
        <thead>
          <tr className="border-b border-line">
            {columns.map(c => (
              <th key={c} scope="col" className="px-4 py-3 text-start text-xs font-medium text-muted">{c}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((r, i) => (
            <tr key={i} className="transition-colors hover:bg-surface">
              {r.map((cell, j) => (
                <td key={j} className="px-4 py-3.5 tabular-nums">{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
