import type { ReactNode } from 'react'

export default function Table({ columns, rows }: { columns: string[]; rows: ReactNode[][] }) {
  return (
    <div className="overflow-x-auto rounded-card border border-line">
      <table className="w-full min-w-max text-start">
        <thead className="bg-primary-light text-primary-dark">
          <tr>
            {columns.map(c => (
              <th key={c} scope="col" className="px-4 py-2 text-start font-bold">{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="odd:bg-white even:bg-surface">
              {r.map((cell, j) => (
                <td key={j} className="border-t border-line px-4 py-2">{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
