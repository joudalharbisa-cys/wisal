export type Priority = 'urgent' | 'medium' | 'normal'
export type RequestStatus = 0 | 1 | 2 | 3 | 4 | 5 | 6
export type DeliveryMode = 'delivery' | 'pickup'

export const PRIORITY_LABEL: Record<Priority, string> = {
  urgent: 'عاجلة',
  medium: 'متوسطة',
  normal: 'عادية',
}

/** The 7 request steps (phase 6). Status 0 depends on `open`; status 4 on the delivery mode. */
export function statusLabel(status: RequestStatus, o: { open?: boolean; mode?: DeliveryMode } = {}): string {
  switch (status) {
    case 0: return o.open === false ? 'بانتظار قرارك' : 'طلب مفتوح'
    case 1: return 'بانتظار موافقة الجمعية'
    case 2: return 'تمت الموافقة'
    case 3: return 'تجهيز الطلب'
    case 4: return o.mode === 'pickup' ? 'جاهز للاستلام' : 'قيد التوصيل'
    case 5: return 'وصل، بانتظار الرمز'
    case 6: return 'تم التحقق من الوصول'
  }
}

export const STATUS_SHORT: Record<RequestStatus, string> = {
  0: 'بانتظار',
  1: 'مطابقة',
  2: 'موافقة',
  3: 'تجهيز',
  4: 'توصيل',
  5: 'وصول',
  6: 'تحقق',
}
