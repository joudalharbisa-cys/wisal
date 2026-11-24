import Alert from './ui/Alert'
import LtrText from './ui/LtrText'

export default function ConfigError({ missing }: { missing: string[] }) {
  return (
    <main className="mx-auto max-w-xl px-4 py-12">
      <Alert tone="danger">
        <p className="font-bold">إعدادات Firebase ناقصة:</p>
        <ul className="mt-2 list-disc ps-5">
          {missing.map(k => (
            <li key={k}><LtrText>{k}</LtrText></li>
          ))}
        </ul>
        <p className="mt-2 text-sm">أضفها في ملف <LtrText>.env.local</LtrText> ثم أعد تشغيل الموقع.</p>
      </Alert>
    </main>
  )
}
