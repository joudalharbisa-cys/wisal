export type Priority = 'urgent' | 'medium' | 'normal'
export type RequestStatus = 0 | 1 | 2 | 3 | 4 | 5

export const PRIORITY_LABEL: Record<Priority, string> = {
  urgent: 'عاجلة',
  medium: 'متوسطة',
  normal: 'عادية',
}

export const STATUS_LABEL: Record<RequestStatus, string> = {
  0: 'بانتظار جهة مناسبة',
  1: 'بانتظار موافقة الجمعية',
  2: 'تمت الموافقة',
  3: 'قيد التسليم',
  4: 'تم التسليم، بانتظار التحقق',
  5: 'تم التحقق من الوصول',
}

export const STATUS_SHORT: Record<RequestStatus, string> = {
  0: 'بانتظار',
  1: 'مطابقة',
  2: 'موافقة',
  3: 'تسليم',
  4: 'وصول',
  5: 'تحقق',
}
