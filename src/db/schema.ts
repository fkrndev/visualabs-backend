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
    uuid: varchar("uuid", { length: 36 }).notNull(),
    userId: int("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    customerId: int("customer_id")
      .references(() => customers.id, { onDelete: "set null" }),
    name: varchar("name", { length: 191 }).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [
    uniqueIndex("chrome_profiles_uuid_unique").on(table.uuid),
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
      .references(() => customers.id, { onDelete: "set null" }),
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
    onboardingDate: date("onboarding_date"),
    onboardingStatus: int("onboarding_status").default(0).notNull(),
    target: text("target"),
    onboardingUpdatedAt: timestamp("onboarding_updated_at"),
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

// ─── Ticket Issues ───────────────────────────────────────────────────

export const ticketIssues = mysqlTable(
  "ticket_issues",
  {
    id: int("id").autoincrement().primaryKey(),
    title: varchar("title", { length: 255 }).notNull(),
    customerId: int("customer_id")
      .references(() => customers.id, { onDelete: "set null" }),
    subscriptionId: int("subscription_id")
      .references(() => subscriptions.id, { onDelete: "set null" }),
    assignedTo: int("assigned_to")
      .references(() => users.id, { onDelete: "set null" }),
    description: text("description"),
    status: int("status").default(0).notNull(),
    pendingOn: int("pending_on").default(0).notNull(),
    holdSince: timestamp("hold_since"),
    dataJson: json("data_json").$type<JsonRecord>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [
    index("ticket_issues_customer_idx").on(table.customerId),
    index("ticket_issues_subscription_idx").on(table.subscriptionId),
    index("ticket_issues_assigned_idx").on(table.assignedTo),
    index("ticket_issues_status_idx").on(table.status),
  ],
);

// ─── Meetings ────────────────────────────────────────────────────────

export const meetings = mysqlTable(
  "meetings",
  {
    id: int("id").autoincrement().primaryKey(),
    type: int("type").default(0).notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    date: timestamp("date"),
    customerId: int("customer_id")
      .references(() => customers.id, { onDelete: "set null" }),
    subscriptionId: int("subscription_id")
      .references(() => subscriptions.id, { onDelete: "set null" }),
    assignedTo: int("assigned_to")
      .references(() => users.id, { onDelete: "set null" }),
    members: text("members"),
    description: text("description"),
    summary: json("summary").$type<JsonRecord>(),
    actionItems: json("action_items").$type<JsonRecord>(),
    checklist: json("checklist").$type<JsonRecord>(),
    newTarget: json("new_target").$type<JsonRecord>(),
    newKpi: json("new_kpi").$type<JsonRecord>(),
    dataJson: json("data_json").$type<JsonRecord>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [
    index("meetings_customer_idx").on(table.customerId),
    index("meetings_subscription_idx").on(table.subscriptionId),
    index("meetings_assigned_idx").on(table.assignedTo),
    index("meetings_date_idx").on(table.date),
  ],
);

export const meetingMembers = mysqlTable(
  "meeting_members",
  {
    id: int("id").autoincrement().primaryKey(),
    meetingId: int("meeting_id")
      .notNull()
      .references(() => meetings.id, { onDelete: "cascade" }),
    userId: int("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (table) => [
    index("meeting_members_meeting_idx").on(table.meetingId),
    index("meeting_members_user_idx").on(table.userId),
  ],
);

// ─── Scorecards ──────────────────────────────────────────────────────

export const scorecards = mysqlTable(
  "scorecards",
  {
    id: int("id").autoincrement().primaryKey(),
    customerId: int("customer_id")
      .references(() => customers.id, { onDelete: "set null" }),
    subscriptionId: int("subscription_id")
      .references(() => subscriptions.id, { onDelete: "set null" }),
    title: varchar("title", { length: 255 }).notNull(),
    description: text("description"),
    assignedTo: int("assigned_to")
      .references(() => users.id, { onDelete: "set null" }),
    pic: int("pic").default(0).notNull(), // 0 = internal (advertiser), 1 = client
    category: int("category").default(0).notNull(), // 0 = goal / target, 1 = indikator, 2 = aktifitas yang bisa di ukur
    targetValue: decimal("target_value", { precision: 14, scale: 2 }),
    unitValue: int("unit_value").default(0).notNull(),
    unitCustom: varchar("unit_custom", { length: 100 }),
    frequency: int("frequency").default(1).notNull(),
    showOnScorecard: int("show_on_scorecard").default(1).notNull(),
    greenThreshold: int("green_threshold").default(100).notNull(),
    yellowThreshold: int("yellow_threshold").default(80).notNull(),
    status: int("status").default(1).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [
    index("scorecards_customer_idx").on(table.customerId),
    index("scorecards_subscription_idx").on(table.subscriptionId),
    index("scorecards_assigned_idx").on(table.assignedTo),
    index("scorecards_status_idx").on(table.status),
  ],
);

export const scorecardData = mysqlTable(
  "scorecard_data",
  {
    id: int("id").autoincrement().primaryKey(),
    scorecardId: int("scorecard_id")
      .notNull()
      .references(() => scorecards.id, { onDelete: "cascade" }),
    year: int("year").notNull(),
    month: int("month"),
    week: int("week"),
    day: int("day"),
    actualValue: decimal("actual_value", { precision: 14, scale: 2 }),
    targetValue: decimal("target_value", { precision: 14, scale: 2 }),
    status: int("status").default(1).notNull(),
    threshold: int("threshold").default(0).notNull(),
    trend: int("trend").default(0).notNull(),
    enteredBy: int("entered_by").default(0).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [
    index("scorecard_data_scorecard_idx").on(table.scorecardId),
    index("scorecard_data_period_idx").on(table.year, table.month, table.week),
    index("scorecard_data_status_idx").on(table.status),
  ],
);

// ─── Todos ───────────────────────────────────────────────────────────

export const todos = mysqlTable(
  "todos",
  {
    id: int("id").autoincrement().primaryKey(),
    type: int("type").default(3).notNull(), // 0 = scorecard 1 = meeting, 2 = ticket issue, 3 = other
    title: varchar("title", { length: 255 }).notNull(),
    customerId: int("customer_id")
      .references(() => customers.id, { onDelete: "set null" }),
    subscriptionId: int("subscription_id")
      .references(() => subscriptions.id, { onDelete: "set null" }),
    assignedTo: int("assigned_to")
      .references(() => users.id, { onDelete: "set null" }),
    pic: int("pic").default(0).notNull(),
    scorecardId: int("scorecard_id")
      .references(() => scorecards.id, { onDelete: "set null" }),
    scorecardDataId: int("scorecard_data_id")
      .references(() => scorecardData.id, { onDelete: "set null" }),
    meetingId: int("meeting_id")
      .references(() => meetings.id, { onDelete: "set null" }),
    ticketIssueId: int("ticket_issue_id")
      .references(() => ticketIssues.id, { onDelete: "set null" }),
    description: text("description"),
    status: int("status").default(0).notNull(),
    subTask: json("sub_task").$type<JsonRecord>(),
    checklist: json("checklist").$type<JsonRecord>(),
    startDate: date("start_date"),
    dueDate: date("due_date"),
    priority: int("priority").default(1).notNull(),
    tags: text("tags"),
    platform: varchar("platform", { length: 191 }),
    isRecurring: int("is_recurring").default(0).notNull(),
    dataJson: json("data_json").$type<JsonRecord>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [
    index("todos_customer_idx").on(table.customerId),
    index("todos_subscription_idx").on(table.subscriptionId),
    index("todos_assigned_idx").on(table.assignedTo),
    index("todos_status_idx").on(table.status),
    index("todos_priority_idx").on(table.priority),
    index("todos_type_idx").on(table.type),
    index("todos_scorecard_idx").on(table.scorecardId),
    index("todos_meeting_idx").on(table.meetingId),
    index("todos_ticket_idx").on(table.ticketIssueId),
  ],
);

// ─── Repeat Task ─────────────────────────────────────────────────────

export const repeatTasks = mysqlTable(
  "repeat_tasks",
  {
    id: int("id").autoincrement().primaryKey(),
    todoId: int("todo_id")
      .notNull()
      .references(() => todos.id, { onDelete: "cascade" }),
    type: int("type").default(0).notNull(), // 0 = daily, 1 = weekly, 2 = monthly, 3 = yearly
    status: int("status").default(0).notNull(), // 0 = active, 1 = inactive
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [
    index("repeat_task_todo_idx").on(table.todoId),
  ],
);

// ─── Todo Repeat History ─────────────────────────────────────────────

export const todoRepeatHistories = mysqlTable(
  "todo_repeat_histories",
  {
    id: int("id").autoincrement().primaryKey(),
    repeatTaskId: int("repeat_task_id")
      .notNull()
      .references(() => repeatTasks.id, { onDelete: "cascade" }),
    type: int("type").default(3).notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    customerId: int("customer_id")
      .references(() => customers.id, { onDelete: "set null" }),
    subscriptionId: int("subscription_id")
      .references(() => subscriptions.id, { onDelete: "set null" }),
    assignedTo: int("assigned_to")
      .references(() => users.id, { onDelete: "set null" }),
    pic: int("pic").default(0).notNull(),
    scorecardId: int("scorecard_id")
      .references(() => scorecards.id, { onDelete: "set null" }),
    scorecardDataId: int("scorecard_data_id")
      .references(() => scorecardData.id, { onDelete: "set null" }),
    meetingId: int("meeting_id")
      .references(() => meetings.id, { onDelete: "set null" }),
    ticketIssueId: int("ticket_issue_id")
      .references(() => ticketIssues.id, { onDelete: "set null" }),
    description: text("description"),
    status: int("status").default(0).notNull(),
    subTask: json("sub_task").$type<JsonRecord>(),
    checklist: json("checklist").$type<JsonRecord>(),
    startDate: date("start_date"),
    dueDate: date("due_date"),
    priority: int("priority").default(1).notNull(),
    tags: text("tags"),
    platform: varchar("platform", { length: 191 }),
    isRecurring: int("is_recurring").default(0).notNull(),
    dataJson: json("data_json").$type<JsonRecord>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [
    index("todo_repeat_hist_repeat_idx").on(table.repeatTaskId),
    index("todo_repeat_hist_customer_idx").on(table.customerId),
    index("todo_repeat_hist_assigned_idx").on(table.assignedTo),
    index("todo_repeat_hist_status_idx").on(table.status),
  ],
);

// ─── Relations for new tables ────────────────────────────────────────

export const ticketIssueRelations = relations(ticketIssues, ({ one }) => ({
  customer: one(customers, { fields: [ticketIssues.customerId], references: [customers.id] }),
  subscription: one(subscriptions, { fields: [ticketIssues.subscriptionId], references: [subscriptions.id] }),
  assignee: one(users, { fields: [ticketIssues.assignedTo], references: [users.id] }),
}));

export const meetingRelations = relations(meetings, ({ one, many }) => ({
  customer: one(customers, { fields: [meetings.customerId], references: [customers.id] }),
  subscription: one(subscriptions, { fields: [meetings.subscriptionId], references: [subscriptions.id] }),
  assignee: one(users, { fields: [meetings.assignedTo], references: [users.id] }),
  meetingMembers: many(meetingMembers),
}));

export const meetingMemberRelations = relations(meetingMembers, ({ one }) => ({
  meeting: one(meetings, { fields: [meetingMembers.meetingId], references: [meetings.id] }),
  user: one(users, { fields: [meetingMembers.userId], references: [users.id] }),
}));

export const scorecardRelations = relations(scorecards, ({ one, many }) => ({
  customer: one(customers, { fields: [scorecards.customerId], references: [customers.id] }),
  subscription: one(subscriptions, { fields: [scorecards.subscriptionId], references: [subscriptions.id] }),
  assignee: one(users, { fields: [scorecards.assignedTo], references: [users.id] }),
  data: many(scorecardData),
}));

export const scorecardDataRelations = relations(scorecardData, ({ one }) => ({
  scorecard: one(scorecards, { fields: [scorecardData.scorecardId], references: [scorecards.id] }),
}));

export const todoRelations = relations(todos, ({ one, many }) => ({
  customer: one(customers, { fields: [todos.customerId], references: [customers.id] }),
  subscription: one(subscriptions, { fields: [todos.subscriptionId], references: [subscriptions.id] }),
  assignee: one(users, { fields: [todos.assignedTo], references: [users.id] }),
  scorecard: one(scorecards, { fields: [todos.scorecardId], references: [scorecards.id] }),
  meeting: one(meetings, { fields: [todos.meetingId], references: [meetings.id] }),
  ticketIssue: one(ticketIssues, { fields: [todos.ticketIssueId], references: [ticketIssues.id] }),
  repeats: many(repeatTasks),
}));

export const repeatTaskRelations = relations(repeatTasks, ({ one, many }) => ({
  todo: one(todos, { fields: [repeatTasks.todoId], references: [todos.id] }),
  histories: many(todoRepeatHistories),
}));

export const todoRepeatHistoryRelations = relations(todoRepeatHistories, ({ one }) => ({
  repeatTask: one(repeatTasks, { fields: [todoRepeatHistories.repeatTaskId], references: [repeatTasks.id] }),
  customer: one(customers, { fields: [todoRepeatHistories.customerId], references: [customers.id] }),
  subscription: one(subscriptions, { fields: [todoRepeatHistories.subscriptionId], references: [subscriptions.id] }),
  assignee: one(users, { fields: [todoRepeatHistories.assignedTo], references: [users.id] }),
  scorecard: one(scorecards, { fields: [todoRepeatHistories.scorecardId], references: [scorecards.id] }),
  meeting: one(meetings, { fields: [todoRepeatHistories.meetingId], references: [meetings.id] }),
  ticketIssue: one(ticketIssues, { fields: [todoRepeatHistories.ticketIssueId], references: [ticketIssues.id] }),
}));
