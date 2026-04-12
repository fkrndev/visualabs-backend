import {
  date,
  decimal,
  index,
  int,
  json,
  longtext,
  mysqlTable,
  serial,
  text,
  timestamp,
  tinyint,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";
import { relations } from "drizzle-orm";

export type JsonRecord = Record<string, unknown> | null;

export const refreshTokens = mysqlTable(
  "refresh_tokens",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    token: varchar("token", { length: 255 }).notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    revokedAt: timestamp("revoked_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [
    uniqueIndex("refresh_tokens_token_unique").on(table.token),
    index("refresh_tokens_user_idx").on(table.userId),
  ],
);

export const customerRefreshTokens = mysqlTable(
  "customer_refresh_tokens",
  {
    id: int("id").autoincrement().primaryKey(),
    customerId: int("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    token: varchar("token", { length: 255 }).notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    revokedAt: timestamp("revoked_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [
    uniqueIndex("crt_token_unique").on(table.token),
    index("crt_customer_idx").on(table.customerId),
  ],
);

export const customers = mysqlTable(
  "customers",
  {
    id: int("id").autoincrement().primaryKey(),
    email: varchar("email", { length: 191 }),
    username: varchar("username", { length: 100 }),
    phone: varchar("phone", { length: 32 }),
    fbid: varchar("fbid", { length: 191 }),
    googleId: varchar("googleid", { length: 191 }),
    password: varchar("password", { length: 255 }),
    dataJson: json("data_json").$type<JsonRecord>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [
    uniqueIndex("customers_email_unique").on(table.email),
    uniqueIndex("customers_username_unique").on(table.username),
    uniqueIndex("customers_phone_unique").on(table.phone),
    uniqueIndex("customers_fbid_unique").on(table.fbid),
    uniqueIndex("customers_googleid_unique").on(table.googleId),
  ],
);

export const customerProfiles = mysqlTable(
  "customer_profiles",
  {
    id: int("id").autoincrement().primaryKey(),
    customerId: int("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 150 }),
    email: varchar("email", { length: 191 }),
    phone: varchar("phone", { length: 32 }),
    dataJson: json("data_json").$type<JsonRecord>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [
    index("customer_profiles_customer_idx").on(table.customerId),
    uniqueIndex("customer_profiles_customer_unique").on(table.customerId),
  ],
);

export const storeCategoryProducts = mysqlTable(
  "store_category_products",
  {
    id: int("id").autoincrement().primaryKey(),
    name: varchar("name", { length: 191 }).notNull(),
    key: varchar("key", { length: 191 }).notNull(),
    dataJson: json("data_json").$type<JsonRecord>(),
    isShow: int("is_show").notNull().default(1),
    position: int("position").notNull().default(0),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [
    index("store_category_products_visible_idx").on(
      table.isShow,
      table.position,
    ),
    uniqueIndex("store_category_products_name_unique").on(table.name),
    uniqueIndex("store_category_products_key_unique").on(table.key),
  ],
);

export const users = mysqlTable(
  "users",
  {
    id: int("id").autoincrement().primaryKey(),
    email: varchar("email", { length: 191 }),
    username: varchar("username", { length: 100 }),
    phone: varchar("phone", { length: 32 }),
    fbid: varchar("fbid", { length: 191 }),
    googleId: varchar("googleid", { length: 191 }),
    password: varchar("password", { length: 255 }),
    role: int("role").default(1).notNull(),
    dataJson: json("data_json").$type<JsonRecord>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [
    uniqueIndex("users_email_unique").on(table.email),
    uniqueIndex("users_username_unique").on(table.username),
    uniqueIndex("users_phone_unique").on(table.phone),
    uniqueIndex("users_fbid_unique").on(table.fbid),
    uniqueIndex("users_googleid_unique").on(table.googleId),
  ],
);

export const profiles = mysqlTable(
  "profiles",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 150 }),
    email: varchar("email", { length: 191 }),
    phone: varchar("phone", { length: 32 }),
    dataJson: json("data_json").$type<JsonRecord>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [
    index("profiles_user_idx").on(table.userId),
    uniqueIndex("profiles_user_unique").on(table.userId),
  ],
);

export const settings = mysqlTable(
  "settings",
  {
    id: int("id").autoincrement().primaryKey(),
    key: varchar("key", { length: 191 }).notNull(),
    dataJson: json("data_json").$type<JsonRecord>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [
    uniqueIndex("settings_key_unique").on(table.key),
  ],
);

export const settingMultiples = mysqlTable(
  "setting_multiple",
  {
    id: int("id").autoincrement().primaryKey(),
    name: varchar("name", { length: 191 }).notNull(),
    key: varchar("key", { length: 191 }).notNull(),
    dataJson: json("data_json").$type<JsonRecord>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [
    uniqueIndex("setting_multiple_name_key_unique").on(
      table.name,
      table.key,
    ),
  ],
);

export const chromeProfiles = mysqlTable(
  "chrome_profiles",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    customerId: int("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 191 }).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [
    index("chrome_profiles_user_idx").on(table.userId),
    index("chrome_profiles_customer_idx").on(table.customerId),
  ],
);

export const chromeHistories = mysqlTable(
  "chrome_histories",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    customerId: int("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    profileId: int("profile_id")
      .notNull()
      .references(() => chromeProfiles.id, { onDelete: "cascade" }),
    url: varchar("url", { length: 2048 }).notNull(),
    count: int("count").notNull().default(0),
    dataJson: json("data_json").$type<JsonRecord>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [
    index("chrome_histories_user_idx").on(table.userId),
    index("chrome_histories_customer_idx").on(table.customerId),
    index("chrome_histories_profile_idx").on(table.profileId),
  ],
);

export const chromeHtmls = mysqlTable(
  "chrome_htmls",
  {
    id: int("id").autoincrement().primaryKey(),
    historyId: int("history_id")
      .notNull()
      .references(() => chromeHistories.id, { onDelete: "cascade" }),
    html: longtext("html"),
    dataJson: json("data_json").$type<JsonRecord>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("chrome_htmls_history_idx").on(table.historyId),
  ],
);

export const chromeActions = mysqlTable(
  "chrome_actions",
  {
    id: int("id").autoincrement().primaryKey(),
    historyId: int("history_id")
      .notNull()
      .references(() => chromeHistories.id, { onDelete: "cascade" }),
    type: int("type").notNull(),
    dataJson: json("data_json").$type<JsonRecord>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("chrome_actions_history_idx").on(table.historyId),
  ],
);

export const chromeWhatsapps = mysqlTable(
  "chrome_whatsapps",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    phone: varchar("phone", { length: 32 }).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [
    index("chrome_whatsapps_user_idx").on(table.userId),
  ],
);

export const chromeWhatsappContacts = mysqlTable(
  "chrome_whatsapp_contacts",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    whatsappId: int("whatsapp_id")
      .notNull()
      .references(() => chromeWhatsapps.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 191 }),
    phone: varchar("phone", { length: 32 }),
    waid: varchar("waid", { length: 191 }),
    lid: varchar("lid", { length: 191 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [
    index("chrome_wa_contacts_user_idx").on(table.userId),
    index("chrome_wa_contacts_whatsapp_idx").on(table.whatsappId),
  ],
);

export const userRelations = relations(users, ({ one, many }) => ({
  profile: one(profiles, {
    fields: [users.id],
    references: [profiles.userId],
  }),
  refreshTokens: many(refreshTokens),
}));

export const profileRelations = relations(profiles, ({ one }) => ({
  user: one(users, {
    fields: [profiles.userId],
    references: [users.id],
  }),
}));

export const customerRelations = relations(customers, ({ many }) => ({
  profiles: many(customerProfiles),
}));

export const customerProfileRelations = relations(
  customerProfiles,
  ({ one }) => ({
    customer: one(customers, {
      fields: [customerProfiles.customerId],
      references: [customers.id],
    }),
  }),
);

export const refreshTokenRelations = relations(refreshTokens, ({ one }) => ({
  user: one(users, {
    fields: [refreshTokens.userId],
    references: [users.id],
  }),
}));

export const customerRefreshTokenRelations = relations(customerRefreshTokens, ({ one }) => ({
  customer: one(customers, {
    fields: [customerRefreshTokens.customerId],
    references: [customers.id],
  }),
}));

export const chromeProfileRelations = relations(chromeProfiles, ({ one, many }) => ({
  user: one(users, {
    fields: [chromeProfiles.userId],
    references: [users.id],
  }),
  customer: one(customers, {
    fields: [chromeProfiles.customerId],
    references: [customers.id],
  }),
  histories: many(chromeHistories),
}));

export const chromeHistoryRelations = relations(chromeHistories, ({ one, many }) => ({
  user: one(users, {
    fields: [chromeHistories.userId],
    references: [users.id],
  }),
  customer: one(customers, {
    fields: [chromeHistories.customerId],
    references: [customers.id],
  }),
  profile: one(chromeProfiles, {
    fields: [chromeHistories.profileId],
    references: [chromeProfiles.id],
  }),
  htmls: many(chromeHtmls),
  actions: many(chromeActions),
}));

export const chromeHtmlRelations = relations(chromeHtmls, ({ one }) => ({
  history: one(chromeHistories, {
    fields: [chromeHtmls.historyId],
    references: [chromeHistories.id],
  }),
}));

export const chromeActionRelations = relations(chromeActions, ({ one }) => ({
  history: one(chromeHistories, {
    fields: [chromeActions.historyId],
    references: [chromeHistories.id],
  }),
}));

export const chromeWhatsappRelations = relations(chromeWhatsapps, ({ one, many }) => ({
  user: one(users, {
    fields: [chromeWhatsapps.userId],
    references: [users.id],
  }),
  contacts: many(chromeWhatsappContacts),
}));

export const chromeWhatsappContactRelations = relations(chromeWhatsappContacts, ({ one }) => ({
  user: one(users, {
    fields: [chromeWhatsappContacts.userId],
    references: [users.id],
  }),
  whatsapp: one(chromeWhatsapps, {
    fields: [chromeWhatsappContacts.whatsappId],
    references: [chromeWhatsapps.id],
  }),
}));

// ─── Products & Subscriptions ────────────────────────────────────────────

export const products = mysqlTable(
  "products",
  {
    id: int("id").autoincrement().primaryKey(),
    name: varchar("name", { length: 191 }).notNull(),
    description: text("description"),
    price: decimal("price", { precision: 12, scale: 2 }).default("0"),
    dataJson: json("data_json").$type<JsonRecord>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [
    uniqueIndex("products_name_unique").on(table.name),
  ],
);

export const subscriptions = mysqlTable(
  "subscriptions",
  {
    id: int("id").autoincrement().primaryKey(),
    customerId: int("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    productId: int("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    advertiserId: int("advertiser_id")
      .references(() => users.id, { onDelete: "set null" }),
    brand: varchar("brand", { length: 191 }),
    platform: varchar("platform", { length: 191 }),
    startDate: date("start_date"),
    dueDate: date("due_date"),
    status: int("status").default(1).notNull(),
    note: text("note"),
    dataJson: json("data_json").$type<JsonRecord>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [
    index("subscriptions_customer_idx").on(table.customerId),
    index("subscriptions_product_idx").on(table.productId),
    index("subscriptions_advertiser_idx").on(table.advertiserId),
    index("subscriptions_status_idx").on(table.status),
  ],
);

export const productRelations = relations(products, ({ many }) => ({
  subscriptions: many(subscriptions),
}));

export const subscriptionRelations = relations(subscriptions, ({ one }) => ({
  customer: one(customers, {
    fields: [subscriptions.customerId],
    references: [customers.id],
  }),
  product: one(products, {
    fields: [subscriptions.productId],
    references: [products.id],
  }),
  advertiser: one(users, {
    fields: [subscriptions.advertiserId],
    references: [users.id],
  }),
}));
