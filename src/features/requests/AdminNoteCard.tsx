import { Megaphone } from 'lucide-react'
import { formatDateTime } from './timeline'

/** «ملاحظة من إدارة وصال»: a note the admin left on the request, shown to the hospital and the charity. */
export default function AdminNoteCard({ note }: { note?: { text: string; at: Date } }) {
  if (!note) return null
  return (
    <section className="flex items-start gap-3 rounded-card border border-status-2/30 bg-white p-5 shadow-sm">
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-status-2/10 text-status-2" aria-hidden><Megaphone className="size-5" /></span>
      <div className="min-w-0 flex-1">
        <h2 className="font-bold">ملاحظة من إدارة وصال</h2>
        <p className="mt-1 whitespace-pre-line text-sm">{note.text}</p>
        <p className="mt-1 text-xs text-muted tabular-nums">{formatDateTime(note.at)}</p>
      </div>
    </section>
  )
}
