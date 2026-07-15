export type NotificationCategory = 'operations' | 'reports' | 'business' | 'subscription' | 'security' | 'system';

export type NotificationSeverity = 'info' | 'success' | 'warning' | 'error';

export type NotificationActionType =
  | 'none'
  | 'operation_details'
  | 'reports'
  | 'business_invitation'
  | 'business_manage'
  | 'business_team'
  | 'business_operations'
  | 'business_public_profile'
  | 'pro_payment'
  | 'subscription'
  | 'profile';

export interface NotificationItem {
  id: string;
  notification_type: string;
  category: NotificationCategory;
  severity: NotificationSeverity;
  title: string;
  body: string;
  action_type: NotificationActionType;
  action_payload: Record<string, unknown>;
  business_id: string | null;
  operation_id: string | null;
  read_at: string | null;
  created_at: string;
}

export interface NotificationCursor {
  created_at: string;
  id: string;
}

export interface NotificationListResponse {
  items: NotificationItem[];
  has_more: boolean;
  next_cursor: NotificationCursor | null;
}

// Type Guards and Parsing Helpers
export function isNotificationCategory(val: unknown): val is NotificationCategory {
  return typeof val === 'string' && ['operations', 'reports', 'business', 'subscription', 'security', 'system'].includes(val);
}

export function isNotificationSeverity(val: unknown): val is NotificationSeverity {
  return typeof val === 'string' && ['info', 'success', 'warning', 'error'].includes(val);
}

export function isNotificationActionType(val: unknown): val is NotificationActionType {
  return typeof val === 'string' && [
    'none',
    'operation_details',
    'reports',
    'business_invitation',
    'business_manage',
    'business_team',
    'business_operations',
    'business_public_profile',
    'pro_payment',
    'subscription',
    'profile'
  ].includes(val);
}

export function validateNotificationItem(data: unknown): NotificationItem {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('تعذر تحميل الإشعارات.');
  }

  const obj = data as Record<string, unknown>;

  // id: string non-empty, length <= 200
  if (typeof obj.id !== 'string' || !obj.id.trim() || obj.id.length > 200) {
    throw new Error('تعذر تحميل الإشعارات.');
  }
  
  // notification_type: string non-empty, length <= 100
  if (typeof obj.notification_type !== 'string' || !obj.notification_type.trim() || obj.notification_type.length > 100) {
    throw new Error('تعذر تحميل الإشعارات.');
  }
  
  if (!isNotificationCategory(obj.category)) {
    throw new Error('تعذر تحميل الإشعارات.');
  }
  
  if (!isNotificationSeverity(obj.severity)) {
    throw new Error('تعذر تحميل الإشعارات.');
  }
  
  // title: string non-empty, length <= 160
  if (typeof obj.title !== 'string' || !obj.title.trim() || obj.title.length > 160) {
    throw new Error('تعذر تحميل الإشعارات.');
  }
  
  // body: string non-empty, length <= 1000
  if (typeof obj.body !== 'string' || !obj.body.trim() || obj.body.length > 1000) {
    throw new Error('تعذر تحميل الإشعارات.');
  }
  
  if (!isNotificationActionType(obj.action_type)) {
    throw new Error('تعذر تحميل الإشعارات.');
  }

  // action_payload: non-null, non-array object. Reject null, string, number, array
  if (!obj.action_payload || typeof obj.action_payload !== 'object' || Array.isArray(obj.action_payload)) {
    throw new Error('تعذر تحميل الإشعارات.');
  }

  // business_id: string non-empty or null. Reject undefined, numbers, objects, empty strings.
  let businessId: string | null = null;
  if ('business_id' in obj) {
    const val = obj.business_id;
    if (val === null) {
      businessId = null;
    } else if (typeof val === 'string' && val.trim() !== '') {
      businessId = val;
    } else {
      throw new Error('تعذر تحميل الإشعارات.');
    }
  } else {
    throw new Error('تعذر تحميل الإشعارات.');
  }

  // operation_id: string non-empty or null. Reject undefined, numbers, objects, empty strings.
  let operationId: string | null = null;
  if ('operation_id' in obj) {
    const val = obj.operation_id;
    if (val === null) {
      operationId = null;
    } else if (typeof val === 'string' && val.trim() !== '') {
      operationId = val;
    } else {
      throw new Error('تعذر تحميل الإشعارات.');
    }
  } else {
    throw new Error('تعذر تحميل الإشعارات.');
  }

  // read_at: non-empty string or null. If string, Date.parse must succeed.
  let readAt: string | null = null;
  if ('read_at' in obj) {
    const val = obj.read_at;
    if (val === null) {
      readAt = null;
    } else if (typeof val === 'string' && val.trim() !== '') {
      const parsed = Date.parse(val);
      if (isNaN(parsed)) {
        throw new Error('تعذر تحميل الإشعارات.');
      }
      readAt = val;
    } else {
      throw new Error('تعذر تحميل الإشعارات.');
    }
  } else {
    throw new Error('تعذر تحميل الإشعارات.');
  }

  // created_at: string non-empty, Date.parse must succeed.
  if (typeof obj.created_at !== 'string' || !obj.created_at.trim()) {
    throw new Error('تعذر تحميل الإشعارات.');
  }
  const createdParsed = Date.parse(obj.created_at);
  if (isNaN(createdParsed)) {
    throw new Error('تعذر تحميل الإشعارات.');
  }

  return {
    id: obj.id,
    notification_type: obj.notification_type,
    category: obj.category,
    severity: obj.severity,
    title: obj.title,
    body: obj.body,
    action_type: obj.action_type,
    action_payload: obj.action_payload as Record<string, unknown>,
    business_id: businessId,
    operation_id: operationId,
    read_at: readAt,
    created_at: obj.created_at
  };
}

export function validateNotificationListResponse(data: unknown): NotificationListResponse {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('تعذر تحميل الإشعارات.');
  }

  const obj = data as Record<string, unknown>;

  if (!Array.isArray(obj.items)) {
    throw new Error('تعذر تحميل الإشعارات.');
  }
  if (typeof obj.has_more !== 'boolean') {
    throw new Error('تعذر تحميل الإشعارات.');
  }

  // next_cursor: null or valid cursor. Reject undefined, string, etc.
  if (!('next_cursor' in obj)) {
    throw new Error('تعذر تحميل الإشعارات.');
  }

  const cursorVal = obj.next_cursor;
  let nextCursor: NotificationCursor | null = null;
  if (cursorVal === null) {
    nextCursor = null;
  } else if (cursorVal && typeof cursorVal === 'object' && !Array.isArray(cursorVal)) {
    const cursorObj = cursorVal as Record<string, unknown>;
    if (typeof cursorObj.created_at !== 'string' || !cursorObj.created_at.trim() ||
        typeof cursorObj.id !== 'string' || !cursorObj.id.trim()) {
      throw new Error('تعذر تحميل الإشعارات.');
    }
    const cursorParsed = Date.parse(cursorObj.created_at);
    if (isNaN(cursorParsed)) {
      throw new Error('تعذر تحميل الإشعارات.');
    }
    nextCursor = {
      created_at: cursorObj.created_at,
      id: cursorObj.id
    };
  } else {
    throw new Error('تعذر تحميل الإشعارات.');
  }

  // Contract alignment:
  // If has_more === true, next_cursor must be non-null.
  if (obj.has_more && nextCursor === null) {
    throw new Error('تعذر تحميل الإشعارات.');
  }
  // If has_more === false, next_cursor must be null.
  if (!obj.has_more && nextCursor !== null) {
    throw new Error('تعذر تحميل الإشعارات.');
  }

  const items = obj.items.map(item => validateNotificationItem(item));

  return {
    items,
    has_more: obj.has_more,
    next_cursor: nextCursor
  };
}
