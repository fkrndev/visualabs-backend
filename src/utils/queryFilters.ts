import { z } from 'zod';
import {
  SQL,
  and,
  or,
  eq,
  ne,
  gt,
  gte,
  lt,
  lte,
  like,
  notLike,
  isNull,
  isNotNull,
  asc,
  desc,
  type AnyColumn,
} from 'drizzle-orm';

export type FilterOperator =
  | 'equals'
  | 'not_equals'
  | 'contains'
  | 'not_contains'
  | 'starts_with'
  | 'ends_with'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'before'
  | 'after'
  | 'on_or_before'
  | 'on_or_after'
  | 'is_empty'
  | 'is_not_empty';

export type FilterCondition = {
  field: string;
  operator: FilterOperator;
  value?: string | number | null;
};

export type FilterGroup = {
  logic: 'and' | 'or';
  conditions: FilterCondition[];
};

export type SortRule = {
  field: string;
  direction: 'asc' | 'desc';
};

export type ColumnKind = 'text' | 'number' | 'date' | 'id';

export type ColumnMapEntry = {
  column: AnyColumn;
  kind?: ColumnKind;
};

export type ColumnMap = Record<string, AnyColumn | ColumnMapEntry>;

const filterConditionSchema = z.object({
  field: z.string().min(1),
  operator: z.enum([
    'equals',
    'not_equals',
    'contains',
    'not_contains',
    'starts_with',
    'ends_with',
    'gt',
    'gte',
    'lt',
    'lte',
    'before',
    'after',
    'on_or_before',
    'on_or_after',
    'is_empty',
    'is_not_empty',
  ]),
  value: z.union([z.string(), z.number(), z.null()]).optional(),
});

const filterGroupSchema = z.object({
  logic: z.enum(['and', 'or']).default('and'),
  conditions: z.array(filterConditionSchema).default([]),
});

const sortRuleSchema = z.object({
  field: z.string().min(1),
  direction: z.enum(['asc', 'desc']),
});

const jsonPreprocess = (schema: z.ZodTypeAny) =>
  z.preprocess((v) => {
    if (v == null || v === '') return undefined;
    if (typeof v !== 'string') return v;
    try {
      return JSON.parse(v);
    } catch {
      return undefined;
    }
  }, schema.optional());

export const filtersQuerySchema = jsonPreprocess(filterGroupSchema);
export const sortsQuerySchema = jsonPreprocess(z.array(sortRuleSchema));

function entry(map: ColumnMap, field: string): ColumnMapEntry | null {
  const v = map[field];
  if (!v) return null;
  if ('column' in (v as ColumnMapEntry) && (v as ColumnMapEntry).column) {
    return v as ColumnMapEntry;
  }
  return { column: v as AnyColumn, kind: 'text' };
}

function coerceNumber(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function coerceDate(v: unknown): Date | null {
  if (v == null || v === '') return null;
  const d = new Date(v as string);
  return Number.isNaN(d.getTime()) ? null : d;
}

function buildCondition(cond: FilterCondition, map: ColumnMap): SQL | null {
  const ent = entry(map, cond.field);
  if (!ent) return null;
  const col = ent.column;
  const kind: ColumnKind = ent.kind ?? 'text';
  const op = cond.operator;

  if (op === 'is_empty') return isNull(col);
  if (op === 'is_not_empty') return isNotNull(col);

  const raw = cond.value;

  if (kind === 'number' || kind === 'id') {
    const n = coerceNumber(raw);
    if (n === null) return null;
    switch (op) {
      case 'equals':
        return eq(col, n);
      case 'not_equals':
        return ne(col, n);
      case 'gt':
        return gt(col, n);
      case 'gte':
        return gte(col, n);
      case 'lt':
        return lt(col, n);
      case 'lte':
        return lte(col, n);
      default:
        return null;
    }
  }

  if (kind === 'date') {
    const d = coerceDate(raw);
    if (d === null) return null;
    switch (op) {
      case 'equals':
        return eq(col, d);
      case 'not_equals':
        return ne(col, d);
      case 'before':
      case 'lt':
        return lt(col, d);
      case 'after':
      case 'gt':
        return gt(col, d);
      case 'on_or_before':
      case 'lte':
        return lte(col, d);
      case 'on_or_after':
      case 'gte':
        return gte(col, d);
      default:
        return null;
    }
  }

  const s = raw == null ? '' : String(raw);
  const safe = s.replace(/[%_]/g, (m) => `\\${m}`);
  switch (op) {
    case 'equals':
      return eq(col, s);
    case 'not_equals':
      return ne(col, s);
    case 'contains':
      return like(col, `%${safe}%`);
    case 'not_contains':
      return notLike(col, `%${safe}%`);
    case 'starts_with':
      return like(col, `${safe}%`);
    case 'ends_with':
      return like(col, `%${safe}`);
    default:
      return null;
  }
}

export function buildWhere(
  filters: FilterGroup | undefined,
  map: ColumnMap,
): SQL | undefined {
  if (!filters || !filters.conditions?.length) return undefined;
  const parts = filters.conditions
    .map((c) => buildCondition(c, map))
    .filter((x): x is SQL => x !== null);
  if (parts.length === 0) return undefined;
  return filters.logic === 'or' ? or(...parts) : and(...parts);
}

export function buildOrderBy(
  sorts: SortRule[] | undefined,
  map: ColumnMap,
  fallback?: SQL[],
): SQL[] {
  if (!sorts || sorts.length === 0) return fallback ?? [];
  const out: SQL[] = [];
  for (const s of sorts) {
    const ent = entry(map, s.field);
    if (!ent) continue;
    out.push(s.direction === 'desc' ? desc(ent.column) : asc(ent.column));
  }
  return out.length ? out : fallback ?? [];
}
