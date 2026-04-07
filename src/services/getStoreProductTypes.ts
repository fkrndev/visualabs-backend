import { z } from "zod";
import {
  SQL,
  and,
  asc,
  desc,
  eq,
  like,
  or,
  gt,
  ne,
  isNull,
  isNotNull,
  not,
  sql,
} from "drizzle-orm";

import { db } from "../db/client";
import { storeProductTypes } from "../db/schema";

const filterConditionSchema = z.object({
  field: z.enum([
    "id",
    "name",
    "slug",
    "desc",
    "businessId",
    "createdAt",
    "updatedAt",
  ]),
  operator: z.enum([
    "equals",
    "not_equals",
    "contains",
    "not_contains",
    "starts_with",
    "ends_with",
    "is_empty",
    "is_not_empty",
  ]),
  value: z.string().optional(),
});

const filterGroupSchema = z.object({
  logic: z.enum(["and", "or"]).default("and"),
  conditions: z.array(filterConditionSchema).default([]),
});

const sortRuleSchema = z.object({
  field: z.enum([
    "id",
    "name",
    "slug",
    "desc",
    "businessId",
    "createdAt",
    "updatedAt",
  ]),
  direction: z.enum(["asc", "desc"]),
});

type GetStoreProductTypesParams = {
  businessId: number;
  cursor?: number;
  limit: number;
  q?: string;
  name?: string;
  slug?: string;
  sortBy?:
    | "id"
    | "name"
    | "slug"
    | "desc"
    | "businessId"
    | "createdAt"
    | "updatedAt";
  sortOrder?: "asc" | "desc";
  filters?: string;
  sorts?: string;
};

export const getStoreProductTypes = async (params: GetStoreProductTypesParams) => {
  const {
    businessId,
    cursor,
    limit,
    q,
    name,
    slug,
    sortBy: sortByParam,
    sortOrder: sortOrderParam,
    filters: filtersParam,
    sorts: sortsParam,
  } = params;

  const baseFilters = [eq(storeProductTypes.businessId, businessId)] as any[];

  if (cursor) {
    baseFilters.push(gt(storeProductTypes.id, cursor));
  }

  if (q) {
    const value = `%${q}%`;
    baseFilters.push(
      or(
        like(storeProductTypes.name, value),
        like(storeProductTypes.slug, value),
        like(storeProductTypes.desc, value),
      ),
    );
  }

  if (name) {
    baseFilters.push(like(storeProductTypes.name, `%${name}%`));
  }

  if (slug) {
    baseFilters.push(like(storeProductTypes.slug, `%${slug}%`));
  }

  if (filtersParam) {
    try {
      const filterGroup = filterGroupSchema.parse(JSON.parse(filtersParam));
      if (filterGroup.conditions.length > 0) {
        const columnMap = {
          id: storeProductTypes.id,
          name: storeProductTypes.name,
          slug: storeProductTypes.slug,
          desc: storeProductTypes.desc,
          businessId: storeProductTypes.businessId,
          createdAt: storeProductTypes.createdAt,
          updatedAt: storeProductTypes.updatedAt,
        };

        const filterConditions = filterGroup.conditions.map((condition) => {
          const column = columnMap[condition.field];
          const value = condition.value || "";

          switch (condition.operator) {
            case "equals":
              return eq(column, value);
            case "not_equals":
              return ne(column, value);
            case "contains":
              return like(column, `%${value}%`);
            case "not_contains":
              return not(like(column, `%${value}%`));
            case "starts_with":
              return like(column, `${value}%`);
            case "ends_with":
              return like(column, `%${value}`);
            case "is_empty":
              return or(isNull(column), eq(column, ""));
            case "is_not_empty":
              return and(isNotNull(column), ne(column, ""));
            default:
              return eq(column, value);
          }
        });

        const combinedFilters =
          filterGroup.logic === "or"
            ? or(...filterConditions)
            : and(...filterConditions);

        baseFilters.push(combinedFilters);
      }
    } catch (e) {
      console.error("Invalid filter format:", e);
    }
  }

  const whereExpr =
    baseFilters.length === 1
      ? baseFilters[0]
      : (and(...(baseFilters as any)) as unknown as SQL);

  const sortMap = {
    id: storeProductTypes.id,
    name: storeProductTypes.name,
    slug: storeProductTypes.slug,
    desc: storeProductTypes.desc,
    businessId: storeProductTypes.businessId,
    createdAt: storeProductTypes.createdAt,
    updatedAt: storeProductTypes.updatedAt,
  } as const;

  let orders: SQL[] = [];

  if (sortsParam) {
    try {
      const sortRules = z.array(sortRuleSchema).parse(JSON.parse(sortsParam));
      orders = sortRules.map((rule) => {
        const column = sortMap[rule.field];
        return rule.direction === "desc" ? desc(column) : asc(column);
      });
      if (!sortRules.some((r) => r.field === "id")) {
        orders.push(asc(sortMap.id));
      }
    } catch (e) {
      console.error("Invalid sort format:", e);
    }
  }

  if (orders.length === 0) {
    const isValidSortKey = (key: string): key is keyof typeof sortMap =>
      key in sortMap;
    const sortKey =
      sortByParam && isValidSortKey(sortByParam) ? sortByParam : "id";
    const sortColumn = sortMap[sortKey];
    const sortOrder = sortOrderParam === "desc" ? "desc" : "asc";

    orders = [sortOrder === "desc" ? desc(sortColumn) : asc(sortColumn)];
    if (sortKey !== "id") {
      orders.push(asc(sortMap.id));
    }
  }

  const items = await db
    .select()
    .from(storeProductTypes)
    .where(whereExpr as any)
    .orderBy(...orders)
    .limit(limit + 1);

  const hasNext = items.length > limit;
  const data = hasNext ? items.slice(0, limit) : items;
  const nextCursor =
    hasNext && data.length > 0 ? data[data.length - 1].id : null;

  return {
    data,
    pagination: {
      limit,
      nextCursor,
      hasNext,
      sortBy: sortByParam || "id",
      sortOrder: sortOrderParam || "asc",
    },
  };
};
