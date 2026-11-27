import type { RequestEvent } from '../requests/events'
import type { Step } from '../requests/timeline'

const reason = (d?: string) => (d ? `السبب: ${d}` : undefined)

/** The admin's full log: one dated line per entry, in order. */
export function eventSteps(events: RequestEvent[]): Step[] {
  return events.map((e, i): Step => {
    const at = e.at
    switch (e.type) {
      case 'sent': return { label: e.charityName ? `أُرسل ل${e.charityName}` : 'أُرسل للجمعية', at }
      case 'resent': return { label: e.charityName ? `أُرسل ل${e.charityName}` : 'أُرسل لجمعية ثانية', at }
      case 'published': return { label: 'انتشر كطلب مفتوح', at }
      case 'rejected': return { label: `رفضت ${e.byName} الطلب`, at, warn: true, note: reason(e.detail) }
      case 'returned': return { label: e.byRole === 'admin' ? `أرجعت إدارة وصال الطلب من ${e.charityName || 'الجمعية'}` : `رجع الطلب للمستشفى (${e.byName})`, at, warn: true, note: reason(e.detail) }
      case 'taken': return { label: `أخذته ${e.byName}`, at }
      case 'accepted': return { label: `وافقت ${e.byName}`, at }
      case 'preparing': return { label: 'بدأ التجهيز', at }
      case 'dispatched': return { label: 'طلع للتوصيل', at, note: e.detail }
      case 'ready': return { label: 'جاهز للاستلام', at }
      case 'arrived': return { label: 'وصل', at }
      case 'pickupSet': return { label: `${e.byName} حدد المندوب`, at, note: e.detail }
      case 'meetingSet': return { label: `اقترحت ${e.byName} اجتماع`, at, note: e.detail }
      case 'meetingRemoved': return { label: 'انحذف الاجتماع', at, note: `حذفته ${e.byName}` }
      case 'codeAttempt':
        return events[i + 1]?.type === 'verified'
          ? { label: `كتبت ${e.byName} الرمز الصحيح`, at }
          : { label: `محاولة رمز غلط (${e.count ?? '?'} من 5)`, at, warn: true }
      case 'verified': return { label: 'تم التحقق', at }
      case 'unlocked': return { label: 'انفتح إدخال الرمز من جديد', at, note: e.byRole === 'admin' ? 'صفّرته إدارة وصال' : `فتحه ${e.byName}` }
      case 'note': return { label: e.byRole === 'admin' ? 'ملاحظة من إدارة وصال' : `ملاحظة من ${e.byName}`, at, note: e.detail ?? 'انحذفت الملاحظة' }
    }
  })
}
