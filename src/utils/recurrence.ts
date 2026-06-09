/**
 * Recurrence engine untuk Todo berulang.
 *
 * Semua tanggal berupa string date-only `YYYY-MM-DD`. Aritmetika memakai
 * komponen UTC murni (tanpa jam) sehingga bebas dari geser timezone/DST —
 * yang dihitung adalah hari kalender, bukan instant waktu.
 */

export const REPEAT_TYPE = {
    DAILY: 0,
    WEEKLY: 1,
    MONTHLY: 2,
    YEARLY: 3,
} as const;

export const REPEAT_STATUS = {
    ACTIVE: 0,
    INACTIVE: 1,
} as const;

export interface RecurrenceRule {
    type: number; // REPEAT_TYPE
    interval: number; // >= 1
    byWeekday?: number | null; // 0=Min .. 6=Sab (weekly)
    byMonthDay?: number | null; // 1..31, atau -1 = hari terakhir bulan (monthly/yearly)
    byMonth?: number | null; // 1..12 (yearly)
    excludeWeekdays?: number[] | null; // daily: lewati hari ini (0=Min..6=Sab)
    startDate: string; // YYYY-MM-DD
    endDate?: string | null; // YYYY-MM-DD (null = selamanya)
    maxOccurrences?: number | null; // null = tak terbatas
}

// ─── Helper tanggal (UTC, date-only) ──────────────────────────────────

function parse(s: string): Date {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d));
}

export function formatDate(dt: Date): string {
    const y = dt.getUTCFullYear();
    const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
    const d = String(dt.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function addDays(dt: Date, n: number): Date {
    return new Date(dt.getTime() + n * 86400000);
}

/** Jumlah hari di bulan (month0: 0=Jan). */
function daysInMonth(year: number, month0: number): number {
    return new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
}

/**
 * Tanggal efektif dalam bulan tertentu sesuai byMonthDay:
 * -1 = hari terakhir; selain itu di-clamp ke jumlah hari bulan
 * (mis. 31 di Februari → 28/29).
 */
function resolveMonthDay(year: number, month0: number, byMonthDay: number): number {
    const last = daysInMonth(year, month0);
    if (byMonthDay === -1) return last;
    return Math.min(Math.max(byMonthDay, 1), last);
}

/** Bangun Date dari komponen tahun/bulan0 dengan byMonthDay yang di-resolve. */
function buildMonthly(year: number, month0: number, byMonthDay: number): Date {
    // normalisasi bulan ke rentang valid
    const y = year + Math.floor(month0 / 12);
    const m = ((month0 % 12) + 12) % 12;
    return new Date(Date.UTC(y, m, resolveMonthDay(y, m, byMonthDay)));
}

/** Apakah hari (weekday UTC) termasuk yang dikecualikan. */
function isExcludedDay(dt: Date, excl?: number[] | null): boolean {
    return !!excl && excl.length > 0 && excl.includes(dt.getUTCDay());
}

/** Maju hari demi hari sampai bukan hari yang dikecualikan (cap 7 hari, anti loop). */
function skipExcluded(dt: Date, excl?: number[] | null): Date {
    if (!excl || excl.length === 0) return dt;
    let d = dt;
    for (let i = 0; i < 7 && isExcludedDay(d, excl); i++) d = addDays(d, 1);
    return d;
}

// ─── API utama ────────────────────────────────────────────────────────

/**
 * Occurrence pertama pada atau setelah `rule.startDate` sesuai pola.
 * Mengembalikan null bila sudah melewati endDate.
 */
export function computeFirstRun(rule: RecurrenceRule): string | null {
    const start = parse(rule.startDate);
    let candidate: Date;

    switch (rule.type) {
        case REPEAT_TYPE.DAILY: {
            candidate = skipExcluded(start, rule.excludeWeekdays);
            break;
        }
        case REPEAT_TYPE.WEEKLY: {
            const target = rule.byWeekday ?? start.getUTCDay();
            const diff = (target - start.getUTCDay() + 7) % 7;
            candidate = addDays(start, diff);
            break;
        }
        case REPEAT_TYPE.MONTHLY: {
            const dom = rule.byMonthDay ?? start.getUTCDate();
            candidate = buildMonthly(start.getUTCFullYear(), start.getUTCMonth(), dom);
            if (candidate.getTime() < start.getTime()) {
                candidate = buildMonthly(start.getUTCFullYear(), start.getUTCMonth() + 1, dom);
            }
            break;
        }
        case REPEAT_TYPE.YEARLY: {
            const month0 = (rule.byMonth ?? start.getUTCMonth() + 1) - 1;
            const dom = rule.byMonthDay ?? start.getUTCDate();
            candidate = buildMonthly(start.getUTCFullYear(), month0, dom);
            if (candidate.getTime() < start.getTime()) {
                candidate = buildMonthly(start.getUTCFullYear() + 1, month0, dom);
            }
            break;
        }
        default:
            return null;
    }

    if (rule.endDate && candidate.getTime() > parse(rule.endDate).getTime()) {
        return null;
    }
    return formatDate(candidate);
}

/**
 * Occurrence berikutnya setelah `current` (string YYYY-MM-DD).
 * Mengembalikan null bila melewati endDate.
 */
export function computeNextRun(rule: RecurrenceRule, current: string): string | null {
    const cur = parse(current);
    const step = Math.max(rule.interval ?? 1, 1);
    let next: Date;

    switch (rule.type) {
        case REPEAT_TYPE.DAILY: {
            next = skipExcluded(addDays(cur, step), rule.excludeWeekdays);
            break;
        }
        case REPEAT_TYPE.WEEKLY: {
            next = addDays(cur, step * 7); // current sudah di byWeekday → jaga hari
            break;
        }
        case REPEAT_TYPE.MONTHLY: {
            const dom = rule.byMonthDay ?? cur.getUTCDate();
            next = buildMonthly(cur.getUTCFullYear(), cur.getUTCMonth() + step, dom);
            break;
        }
        case REPEAT_TYPE.YEARLY: {
            const month0 = (rule.byMonth ?? cur.getUTCMonth() + 1) - 1;
            const dom = rule.byMonthDay ?? cur.getUTCDate();
            next = buildMonthly(cur.getUTCFullYear() + step, month0, dom);
            break;
        }
        default:
            return null;
    }

    if (rule.endDate && next.getTime() > parse(rule.endDate).getTime()) {
        return null;
    }
    return formatDate(next);
}

/** Hari ini di Asia/Jakarta sebagai `YYYY-MM-DD` (server TZ = Asia/Jakarta). */
export function todayJakarta(now: Date = new Date()): string {
    // en-CA → format YYYY-MM-DD
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Jakarta',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(now);
}
