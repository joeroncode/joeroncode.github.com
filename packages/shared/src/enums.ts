export const Role = {
  OWNER: "OWNER",
  ADMIN: "ADMIN",
  MANAGER: "MANAGER",
  STAFF: "STAFF",
} as const;
export type Role = (typeof Role)[keyof typeof Role];

export const OrderStatus = {
  PENDING: "PENDING",
  IN_PREP: "IN_PREP",
  READY_FOR_VERIFICATION: "READY_FOR_VERIFICATION",
  VERIFIED: "VERIFIED",
  FLAGGED: "FLAGGED",
  HANDED_OFF: "HANDED_OFF",
  CANCELLED: "CANCELLED",
} as const;
export type OrderStatus = (typeof OrderStatus)[keyof typeof OrderStatus];

export const OrderChannel = {
  DINE_IN: "DINE_IN",
  TAKEOUT: "TAKEOUT",
  DELIVERY: "DELIVERY",
  DRIVE_THRU: "DRIVE_THRU",
} as const;
export type OrderChannel = (typeof OrderChannel)[keyof typeof OrderChannel];

export const VerificationVerdict = {
  MATCH: "MATCH",
  MISMATCH: "MISMATCH",
  PARTIAL_MATCH: "PARTIAL_MATCH",
  NEEDS_REVIEW: "NEEDS_REVIEW",
} as const;
export type VerificationVerdict = (typeof VerificationVerdict)[keyof typeof VerificationVerdict];

export const POSProvider = {
  SQUARE: "SQUARE",
  TOAST: "TOAST",
  CLOVER: "CLOVER",
  MOCK: "MOCK",
} as const;
export type POSProvider = (typeof POSProvider)[keyof typeof POSProvider];
