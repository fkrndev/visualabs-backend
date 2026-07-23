// Single source of truth for HR enum codes (numeric tinyint values in DB).
// Diadopsi dari hr-backend. Role user TIDAK ada di sini — v-auto pakai
// src/utils/auth/permissions.ts (ROLE_HRD=5, ROLE_AKUNTAN=6).
// Mirror ke frontend: v-auto-frontend/src/lib/constants/hrEnums.ts

export const BranchStatus = {
  ACTIVE: 0,
  INACTIVE: 1,
} as const;

export const PositionLevel = {
  STAFF: 0,
  SUPERVISOR: 1,
  MANAGER: 2,
  DIRECTOR: 3,
  C_LEVEL: 4,
} as const;

export const Gender = {
  MALE: 0,
  FEMALE: 1,
} as const;

export const Religion = {
  ISLAM: 0,
  KRISTEN: 1,
  KATOLIK: 2,
  HINDU: 3,
  BUDDHA: 4,
  KONGHUCU: 5,
} as const;

export const MaritalStatus = {
  SINGLE: 0,
  MARRIED: 1,
  DIVORCED: 2,
  WIDOWED: 3,
} as const;

export const BloodType = {
  A: 0,
  B: 1,
  AB: 2,
  O: 3,
} as const;

export const EmploymentType = {
  PERMANENT: 0,
  CONTRACT: 1,
  PROBATION: 2,
  INTERNSHIP: 3,
  FREELANCE: 4,
} as const;

export const EmploymentStatus = {
  ACTIVE: 0,
  RESIGNED: 1,
  TERMINATED: 2,
  ON_LEAVE: 3,
} as const;

export const FamilyRelationship = {
  SPOUSE: 0,
  CHILD: 1,
  FATHER: 2,
  MOTHER: 3,
  SIBLING: 4,
} as const;

export const DocumentType = {
  KTP: 0,
  NPWP: 1,
  IJAZAH: 2,
  KK: 3,
  CONTRACT: 4,
  CV: 5,
  OTHER: 6,
} as const;

export const EducationLevel = {
  SD: 0,
  SMP: 1,
  SMA: 2,
  D3: 3,
  S1: 4,
  S2: 5,
  S3: 6,
} as const;

export const WorkScheduleType = {
  FIXED: 0,
  SHIFT: 1,
  FLEXIBLE: 2,
} as const;

export const AttendanceCheckType = {
  OFFICE: 0,
  WFH: 1,
  CLIENT_VISIT: 2,
  OUTSIDE: 3,
} as const;

export const AttendanceStatus = {
  PRESENT: 0,
  LATE: 1,
  ABSENT: 2,
  LEAVE: 3,
  SICK: 4,
  HOLIDAY: 5,
  OFF: 6,
} as const;

export const AttendanceRequestType = {
  FORGOT_CHECK_IN: 0,
  FORGOT_CHECK_OUT: 1,
  CORRECTION: 2,
  MANUAL_ENTRY: 3,
} as const;

export const ApprovalStatus = {
  PENDING: 0,
  APPROVED: 1,
  REJECTED: 2,
  CANCELLED: 3,
} as const;

export const LeaveGender = {
  ALL: 0,
  MALE: 1,
  FEMALE: 2,
} as const;

export const HolidayType = {
  NATIONAL: 0,
  COMPANY: 1,
  RELIGIOUS: 2,
} as const;

export const OvertimeStatus = {
  PENDING: 0,
  APPROVED: 1,
  REJECTED: 2,
  PAID: 3,
} as const;

export const CashAdvanceRepayment = {
  SINGLE: 0,
  INSTALLMENT: 1,
} as const;

export const CashAdvanceStatus = {
  PENDING: 0,
  APPROVED: 1,
  REJECTED: 2,
  DISBURSED: 3,
  REPAYING: 4,
  PAID_OFF: 5,
} as const;

export const ReimbursementCategory = {
  MEDICAL: 0,
  TRANSPORT: 1,
  MEAL: 2,
  BUSINESS_TRIP: 3,
  OTHER: 4,
} as const;

export const ReimbursementStatus = {
  PENDING: 0,
  APPROVED: 1,
  REJECTED: 2,
  PAID: 3,
} as const;

export const ApprovalModule = {
  ATTENDANCE: 0,
  LEAVE: 1,
  OVERTIME: 2,
  REIMBURSEMENT: 3,
  CASH_ADVANCE: 4,
  PETTY_CASH: 5,
} as const;

export const ApproverType = {
  DIRECT_MANAGER: 0,
  DEPARTMENT_HEAD: 1,
  SPECIFIC_USER: 2,
  ROLE: 3,
} as const;

export const AnnouncementCategory = {
  GENERAL: 0,
  EVENT: 1,
  POLICY: 2,
  URGENT: 3,
} as const;

export const AnnouncementTarget = {
  ALL: 0,
  BRANCH: 1,
  DEPARTMENT: 2,
  SPECIFIC: 3,
} as const;

export const AnnouncementStatus = {
  DRAFT: 0,
  PUBLISHED: 1,
  ARCHIVED: 2,
} as const;

export const ActivityAction = {
  CREATE: 0,
  UPDATE: 1,
  DELETE: 2,
  LOGIN: 3,
  LOGOUT: 4,
  APPROVE: 5,
  REJECT: 6,
  EXPORT: 7,
} as const;

export const NotificationType = {
  INFO: 0,
  SUCCESS: 1,
  WARNING: 2,
  ERROR: 3,
  APPROVAL: 4,
} as const;
