import { useState } from 'react'
import DatePicker from '../../components/ui/DatePicker'
import Field from '../../components/ui/Field'
import Select from '../../components/ui/Select'
import { formatTime } from './timeline'
import { combine, SLOTS, type DateTime } from './slots'
import { lastAllowedDay } from './validate'

/** Calendar day (today → a year ahead) + a half-hour time select. Western digits. */
export default function DateTimeFields({ dateLabel, value, onChange }: { dateLabel: string; value: DateTime; onChange: (v: DateTime) => void }) {
  const [today] = useState(() => new Date())
  return (
    <div className="grid grid-cols-[minmax(0,3fr)_minmax(0,2fr)] gap-3">
      <DatePicker label={dateLabel} value={value.date} onChange={date => onChange({ ...value, date })} min={today} max={lastAllowedDay(today)} />
      <Field label="الساعة">
        <Select value={value.time} onChange={e => onChange({ ...value, time: e.target.value })} className="tabular-nums">
          {SLOTS.map(s => <option key={s} value={s}>{formatTime(combine({ date: '2026-01-01', time: s })!)}</option>)}
        </Select>
      </Field>
    </div>
  )
}
