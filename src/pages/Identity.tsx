import { useEffect, useState } from 'react'
import Alert from '../components/ui/Alert'
import { PriorityBadge, StatusBadge } from '../components/ui/Badge'
import Button from '../components/ui/Button'
import Card from '../components/ui/Card'
import LtrText from '../components/ui/LtrText'
import Table from '../components/ui/Table'
import Field from '../components/ui/Field'
import Input from '../components/ui/Input'

// Full class strings so Tailwind generates them; values come from theme.css.
const SWATCHES: [string, string][] = [
  ['primary', 'bg-primary'], ['primary-dark', 'bg-primary-dark'], ['primary-light', 'bg-primary-light'],
  ['accent', 'bg-accent'], ['accent-light', 'bg-accent-light'],
  ['ink', 'bg-ink'], ['muted', 'bg-muted'], ['line', 'bg-line'], ['surface', 'bg-surface'],
  ['hospital', 'bg-hospital'], ['charity', 'bg-charity'],
  ['urgent', 'bg-urgent'], ['medium', 'bg-medium'], ['normal', 'bg-normal'],
  ['status-0', 'bg-status-0'], ['status-1', 'bg-status-1'], ['status-2', 'bg-status-2'],
  ['status-3', 'bg-status-3'], ['status-4', 'bg-status-4'], ['status-5', 'bg-status-5'],
]

function Swatch({ name, cls }: { name: string; cls: string }) {
  const [value, setValue] = useState('')
  useEffect(() => {
    setValue(getComputedStyle(document.documentElement).getPropertyValue(`--color-${name}`).trim())
  }, [name])
  return (
    <div className="overflow-hidden rounded-control border border-line bg-white">
      <div className={`h-14 ${cls}`} />
      <div className="px-3 py-2 text-sm">
        <div className="font-bold">{name}</div>
        <div className="text-muted"><LtrText>{value}</LtrText></div>
      </div>
    </div>
  )
}

export default function Identity() {
  return (
    <main className="mx-auto max-w-5xl space-y-6 px-4 py-8">
      <header>
        <h1 className="text-3xl font-bold text-primary">الهوية البصرية لوصال</h1>
        <p className="text-muted">مقترح للمراجعة. أي تعديل على القيم يكون في ملف theme.css فقط.</p>
      </header>

      <Card title="الألوان">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
          {SWATCHES.map(([n, c]) => <Swatch key={n} name={n} cls={c} />)}
        </div>
      </Card>

      <Card title="الخطوط">
        <p className="text-3xl font-bold">عنوان رئيسي: وصال</p>
        <p className="text-lg font-bold">عنوان فرعي: الطلبات الواردة</p>
        <p>نص عادي: مستشفى الملك فهد يحتاج ٤٠ كرسي متحرك.</p>
        <p className="text-sm text-muted">نص صغير: آخر تحديث قبل دقيقتين</p>
      </Card>

      <div className="grid gap-6 sm:grid-cols-2">
        <Card title="الأزرار">
          <div className="flex flex-wrap gap-2">
            <Button>قبول</Button>
            <Button variant="secondary">حدّد الاجتماع</Button>
            <Button variant="danger">رفض</Button>
            <Button variant="outline">تخطي</Button>
          </div>
        </Card>
        <Card title="الأولوية">
          <div className="flex flex-wrap gap-2">
            <PriorityBadge priority="urgent" />
            <PriorityBadge priority="medium" />
            <PriorityBadge priority="normal" />
          </div>
        </Card>
      </div>

      <Card title="حالات الطلب">
        <div className="flex flex-wrap gap-2">
          {([0, 1, 2, 3, 4, 5] as const).map(s => <StatusBadge key={s} status={s} />)}
        </div>
      </Card>

      <Card title="التنبيهات">
        <div className="space-y-2">
          <Alert tone="info">تم إرسال الطلب لجمعية الشمال.</Alert>
          <Alert tone="success">تم التحقق من الوصول.</Alert>
          <Alert tone="warning">الطلب ينتظر رد الجمعية.</Alert>
          <Alert tone="danger">رمز الاستلام غير صحيح.</Alert>
        </div>
      </Card>

      <Card title="جدول">
        <Table
          columns={['الصنف', 'الكمية', 'الحالة']}
          rows={[
            ['كراسي متحركة', 40, 'تمت الموافقة'],
            ['أسرّة طبية', 10, 'بانتظار جهة مناسبة'],
          ]}
        />
      </Card>

      <Card title="الحقول">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="اسم الجهة" hint="كما في الترخيص"><Input defaultValue="مستشفى الملك فهد" /></Field>
          <Field label="رقم الترخيص" error="رقم الترخيص غير صحيح"><Input invalid dir="ltr" defaultValue="12" /></Field>
        </div>
      </Card>

      <Card title="نص من اليسار لليمين داخل العربي">
        <p>الإيميل: <LtrText>example@wesal.sa</LtrText> · رمز الاستلام: <LtrText>4821</LtrText></p>
      </Card>
    </main>
  )
}
