import ChoiceGroup from '../../components/ui/ChoiceGroup'
import Field from '../../components/ui/Field'
import Input from '../../components/ui/Input'
import Select from '../../components/ui/Select'
import { CITIES } from '../../features/orgs/cities'
import type { Draft } from '../../features/orgs/application'
import type { ApplicationErrors } from '../../features/orgs/validate'

/** Org data form shared by registration and the rejected-application edit. */
export default function DetailsStep({ value, onChange, errors }: { value: Draft; onChange: (patch: Draft) => void; errors: ApplicationErrors }) {
  return (
    <div className="space-y-5">
      <Field label="اسم الجهة" hint="كما هو مكتوب في الترخيص" error={errors.name}>
        <Input value={value.name ?? ''} invalid={!!errors.name} onChange={e => onChange({ name: e.target.value })} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="المدينة" error={errors.city}>
          <Select value={value.city ?? ''} invalid={!!errors.city} onChange={e => onChange({ city: e.target.value })}>
            <option value="" disabled>اختر المدينة</option>
            {CITIES.map(c => <option key={c} value={c}>{c}</option>)}
          </Select>
        </Field>
        <Field label="الحي" error={errors.district}>
          <Input value={value.district ?? ''} invalid={!!errors.district} onChange={e => onChange({ district: e.target.value })} />
        </Field>
      </div>
      <Field label="رقم الترخيص" hint="أرقام وحروف إنجليزية وشرطة فقط" error={errors.licenseNo}>
        <Input dir="ltr" value={value.licenseNo ?? ''} invalid={!!errors.licenseNo} onChange={e => onChange({ licenseNo: e.target.value })} />
      </Field>
      {value.role === 'hospital' && (
        <ChoiceGroup
          label="نوع المستشفى"
          value={value.hospitalType}
          onChange={v => onChange({ hospitalType: v })}
          error={errors.hospitalType}
          options={[{ value: 'gov', label: 'حكومي' }, { value: 'private', label: 'خاص' }]}
        />
      )}
      {value.role === 'charity' && (
        <>
          <Field label="أوقات العمل" hint="مثال: الأحد إلى الخميس، 8 ص إلى 4 م" error={errors.workingHours}>
            <Input value={value.workingHours ?? ''} invalid={!!errors.workingHours} onChange={e => onChange({ workingHours: e.target.value })} />
          </Field>
          <ChoiceGroup
            label="عندكم توصيل؟"
            value={value.canDeliver === undefined ? undefined : value.canDeliver ? 'yes' : 'no'}
            onChange={v => onChange({ canDeliver: v === 'yes' })}
            error={errors.canDeliver}
            options={[
              { value: 'yes', label: 'نعم', hint: 'تفاصيل المركبات تنضاف لاحقًا' },
              { value: 'no', label: 'لا', hint: 'يتولاه مسؤول النقل' },
            ]}
          />
        </>
      )}
    </div>
  )
}
