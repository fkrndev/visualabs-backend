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
import { storeProducts, storeCategoryProducts, storeProductTypeProducts } from "../db/schema";

const filterConditionSchema = z.object({
  field: z.enum([
    "id",
    "name",
    "sku",
    "code",
    "barcode",
    "price",
    "categoryId",
    "typeVendor",
    "vendorId",
    "isHide",
    "isPreorder",
    "slug",
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
    "sku",
    "code",
    "barcode",
    "price",
    "categoryId",
    "typeVendor",
    "vendorId",
    "isHide",
    "isPreorder",
    "slug",
    "createdAt",
    "updatedAt",
  ]),
  direction: z.enum(["asc", "desc"]),
});

type GetStoreProductsParams = {
  cursor?: number;
  limit: number;
  q?: string;
  name?: string;
  sku?: string;
  code?: string;
  barcode?: string;
  categoryId?: number;
  productTypeId?: number;
  typeVariant?: number;
  typeVendor?: number;
  vendorId?: number;
  isHide?: number;
  isPreorder?: number;
  slug?: string;
  sortBy?:
    | "id"
    | "name"
    | "sku"
    | "price"
    | "isHide"
    | "slug"
    | "createdAt"
    | "updatedAt";
  sortOrder?: "asc" | "desc";
  filters?: string;
  sorts?: string;
};

export const getStoreProducts = async (params: GetStoreProductsParams) => {
  const {
    cursor,
    limit,
    q,
    name,
    sku,
    code,
    barcode,
    categoryId,
    productTypeId,
    typeVariant,
    typeVendor,
    vendorId,
    isHide,
    isPreorder,
    slug,
    sortBy: sortByParam,
    sortOrder: sortOrderParam,
    filters: filtersParam,
    sorts: sortsParam,
  } = params;

  const baseFilters = [] as any[];

  if (cursor) {
    baseFilters.push(gt(storeProducts.id, cursor));
  }

  if (q) {
    const value = `%${q}%`;
    baseFilters.push(
      or(
        like(storeProducts.name, value),
        like(storeProducts.sku, value),
        like(storeProducts.code, value),
        like(storeProducts.barcode, value),
      ),
    );
  }

  if (name) {
    baseFilters.push(like(storeProducts.name, `%${name}%`));
  }

  if (sku) {
    baseFilters.push(like(storeProducts.sku, `%${sku}%`));
  }

  if (code) {
    baseFilters.push(like(storeProducts.code, `%${code}%`));
  }

  if (barcode) {
    baseFilters.push(like(storeProducts.barcode, `%${barcode}%`));
  }

  if (categoryId !== undefined) {
    baseFilters.push(eq(storeProducts.categoryId, categoryId));
  }

  if (productTypeId !== undefined) {
    // Filter products that have the specified product type
    // Using a subquery to find product IDs that have the specified product type
    const productIdsWithType = db
      .select({ productId: storeProductTypeProducts.productId })
      .from(storeProductTypeProducts)
      .where(
        and(
          eq(storeProductTypeProducts.productTypeId, productTypeId),
          eq(storeProductTypeProducts.isHide, 0)
        )
      );
    
    baseFilters.push(
      sql`${storeProducts.id} IN (${productIdsWithType})`
    );
  }

  if (typeVariant !== undefined) {
    baseFilters.push(eq(storeProducts.typeVariant, typeVariant));
  }

  if (typeVendor !== undefined) {
    baseFilters.push(eq(storeProducts.typeVendor, typeVendor));
  }

  if (vendorId !== undefined) {
    baseFilters.push(eq(storeProducts.vendorId, vendorId));
  }

  if (isHide !== undefined) {
    baseFilters.push(eq(storeProducts.isHide, isHide));
  }

  if (isPreorder !== undefined) {
    baseFilters.push(eq(storeProducts.isPreorder, isPreorder));
  }

  if (slug) {
    baseFilters.push(like(storeProducts.slug, `%${slug}%`));
  }

  if (filtersParam) {
    try {
      const filterGroup = filterGroupSchema.parse(JSON.parse(filtersParam));
      if (filterGroup.conditions.length > 0) {
        const columnMap = {
          id: storeProducts.id,
          name: storeProducts.name,
          sku: storeProducts.sku,
          code: storeProducts.code,
          barcode: storeProducts.barcode,
          price: storeProducts.price,
          categoryId: storeProducts.categoryId,
          typeVendor: storeProducts.typeVendor,
          vendorId: storeProducts.vendorId,
          isHide: storeProducts.isHide,
          isPreorder: storeProducts.isPreorder,
          slug: storeProducts.slug,
          createdAt: storeProducts.createdAt,
          updatedAt: storeProducts.updatedAt,
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
    id: storeProducts.id,
    name: storeProducts.name,
    sku: storeProducts.sku,
    code: storeProducts.code,
    barcode: storeProducts.barcode,
    price: storeProducts.price,
    categoryId: storeProducts.categoryId,
    typeVendor: storeProducts.typeVendor,
    vendorId: storeProducts.vendorId,
    isHide: storeProducts.isHide,
    isPreorder: storeProducts.isPreorder,
    slug: storeProducts.slug,
    createdAt: storeProducts.createdAt,
    updatedAt: storeProducts.updatedAt,
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

  // Use select with leftJoin to include categoryName
  const query = db
    .select({
      id: storeProducts.id,
      sku: storeProducts.sku,
      code: storeProducts.code,
      barcode: storeProducts.barcode,
      name: storeProducts.name,
      typeVariant: storeProducts.typeVariant,
      typeVendor: storeProducts.typeVendor,
      vendorId: storeProducts.vendorId,
      price: storeProducts.price,
      priceMax: storeProducts.priceMax,
      priceMin: storeProducts.priceMin,
      sale: storeProducts.sale,
      purchasePrice: storeProducts.purchasePrice,
      storeFee: storeProducts.storeFee,
      categoryId: storeProducts.categoryId,
      categoryName: storeCategoryProducts.name,
      dataJson: storeProducts.dataJson,
      isHide: storeProducts.isHide,
      isPreorder: storeProducts.isPreorder,
      createdAt: storeProducts.createdAt,
      updatedAt: storeProducts.updatedAt,
    })
    .from(storeProducts)
    .leftJoin(
      storeCategoryProducts,
      eq(storeProducts.categoryId, storeCategoryProducts.id),
    )
    .where(whereExpr as any)
    .orderBy(...orders)
    .limit(limit + 1);

  const items = await query;

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
