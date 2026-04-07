import {
  decimal,
  index,
  int,
  json,
  longtext,
  mysqlTable,
  serial,
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
    businessId: int("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
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
    uniqueIndex("customers_business_email_unique").on(
      table.businessId,
      table.email,
    ),
    uniqueIndex("customers_business_username_unique").on(
      table.businessId,
      table.username,
    ),
    uniqueIndex("customers_business_phone_unique").on(
      table.businessId,
      table.phone,
    ),
    uniqueIndex("customers_business_fbid_unique").on(
      table.businessId,
      table.fbid,
    ),
    uniqueIndex("customers_business_googleid_unique").on(
      table.businessId,
      table.googleId,
    ),
    index("customers_business_idx").on(table.businessId),
  ],
);

export const customerProfiles = mysqlTable(
  "customer_profiles",
  {
    id: int("id").autoincrement().primaryKey(),
    businessId: int("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
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
    index("customer_profiles_business_idx").on(table.businessId),
    index("customer_profiles_customer_idx").on(table.customerId),
    uniqueIndex("customer_profiles_customer_unique").on(table.customerId),
  ],
);

export const storeCategoryProducts = mysqlTable(
  "store_category_products",
  {
    id: int("id").autoincrement().primaryKey(),
    businessId: int("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 191 }).notNull(),
    key: varchar("key", { length: 191 }).notNull(),
    dataJson: json("data_json").$type<JsonRecord>(),
    isShow: int("is_show").notNull().default(1),
    position: int("position").notNull().default(0),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [
    index("store_category_products_business_idx").on(table.businessId),
    index("store_category_products_visible_idx").on(
      table.businessId,
      table.isShow,
      table.position,
    ),
    uniqueIndex("store_category_products_business_name_unique").on(
      table.businessId,
      table.name,
    ),
    uniqueIndex("store_category_products_business_key_unique").on(
      table.businessId,
      table.key,
    ),
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

export const businesses = mysqlTable(
  "businesses",
  {
    id: int("id").autoincrement().primaryKey(),
    name: varchar("name", { length: 191 }).notNull(),
    dataJson: json("data_json").$type<JsonRecord>(),
  },
  (table) => [index("businesses_name_idx").on(table.name)],
);

export const settings = mysqlTable(
  "settings",
  {
    id: int("id").autoincrement().primaryKey(),
    businessId: int("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    key: varchar("key", { length: 191 }).notNull(),
    dataJson: json("data_json").$type<JsonRecord>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [
    index("settings_business_idx").on(table.businessId),
    uniqueIndex("settings_business_key_unique").on(table.businessId, table.key),
  ],
);

export const businessUsers = mysqlTable(
  "business_users",
  {
    id: int("id").autoincrement().primaryKey(),
    businessId: int("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    userId: int("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: int("role").notNull(),
    dataJson: json("data_json").$type<JsonRecord>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [
    index("business_users_business_idx").on(table.businessId),
    index("business_users_user_idx").on(table.userId),
    uniqueIndex("business_user_unique").on(table.businessId, table.userId),
  ],
);

export const settingMultiples = mysqlTable(
  "setting_multiple",
  {
    id: int("id").autoincrement().primaryKey(),
    businessId: int("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 191 }).notNull(),
    key: varchar("key", { length: 191 }).notNull(),
    dataJson: json("data_json").$type<JsonRecord>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [
    index("setting_multiple_business_idx").on(table.businessId),
    uniqueIndex("setting_multiple_business_name_key_unique").on(
      table.businessId,
      table.name,
      table.key,
    ),
  ],
);

export const userRelations = relations(users, ({ one, many }) => ({
  profile: one(profiles, {
    fields: [users.id],
    references: [profiles.userId],
  }),
  businessUsers: many(businessUsers),
  refreshTokens: many(refreshTokens),
}));

export const profileRelations = relations(profiles, ({ one }) => ({
  user: one(users, {
    fields: [profiles.userId],
    references: [users.id],
  }),
}));

export const businessRelations = relations(businesses, ({ many }) => ({
  businessUsers: many(businessUsers),
  customers: many(customers),
  customerProfiles: many(customerProfiles),
  settings: many(settings),
}));

export const businessUserRelations = relations(businessUsers, ({ one }) => ({
  business: one(businesses, {
    fields: [businessUsers.businessId],
    references: [businesses.id],
  }),
  user: one(users, {
    fields: [businessUsers.userId],
    references: [users.id],
  }),
}));

export const customerRelations = relations(customers, ({ one, many }) => ({
  business: one(businesses, {
    fields: [customers.businessId],
    references: [businesses.id],
  }),
  profiles: many(customerProfiles),
}));

export const customerProfileRelations = relations(
  customerProfiles,
  ({ one }) => ({
    business: one(businesses, {
      fields: [customerProfiles.businessId],
      references: [businesses.id],
    }),
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

// Quarterly Rocks
export const quarterlyRocks = mysqlTable(
  "quarterly_rocks",
  {
    id: int("id").autoincrement().primaryKey(),
    businessId: int("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    ownerId: int("owner_id").notNull().default(0),
    year: int("year").notNull(),
    name: varchar("name", { length: 191 }).notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    description: longtext("description"),
    status: tinyint("status").notNull().default(0),
    percentage: int("percentage").notNull().default(0),
    dueDate: timestamp("due_date"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [
    index("quarterly_rocks_business_idx").on(table.businessId),
    index("quarterly_rocks_owner_idx").on(table.ownerId),
    index("quarterly_rocks_year_idx").on(table.year),
    index("quarterly_rocks_status_idx").on(table.status),
  ],
);

// Annual Goals
export const annualGoals = mysqlTable(
  "annual_goals",
  {
    id: int("id").autoincrement().primaryKey(),
    businessId: int("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    goal: varchar("goal", { length: 255 }).notNull(),
    year: int("year").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [
    index("annual_goals_business_idx").on(table.businessId),
    index("annual_goals_year_idx").on(table.year),
    uniqueIndex("annual_goals_business_year_unique").on(table.businessId, table.year),
  ],
);

// Three Year Picture
export const threeYearPicture = mysqlTable(
  "three_year_picture",
  {
    id: int("id").autoincrement().primaryKey(),
    businessId: int("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    futureDate: timestamp("future_date").notNull(),
    revenueTarget: decimal("revenue_target", { precision: 15, scale: 2 }),
    profitTarget: decimal("profit_target", { precision: 15, scale: 2 }),
    measurables: json("measurables").$type<JsonRecord>(),
    description: longtext("description"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [
    index("three_year_picture_business_idx").on(table.businessId),
  ],
);

// KPI Categories
export const kpiCategories = mysqlTable(
  "kpi_categories",
  {
    id: int("id").autoincrement().primaryKey(),
    businessId: int("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 191 }).notNull(),
    order: int("order").notNull().default(0),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [
    index("kpi_categories_business_idx").on(table.businessId),
    uniqueIndex("kpi_categories_business_name_unique").on(table.businessId, table.name),
  ],
);

// KPIs
export const kpis = mysqlTable(
  "kpis",
  {
    id: int("id").autoincrement().primaryKey(),
    businessId: int("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    categoryId: int("category_id")
      .notNull()
      .references(() => kpiCategories.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 191 }).notNull(),
    description: longtext("description"),
    ownerId: int("owner_id").notNull(),
    unit: varchar("unit", { length: 50 }),
    targetValue: decimal("target_value", { precision: 15, scale: 2 }),
    frequency: tinyint("frequency").notNull().default(2),
    isActive: tinyint("is_active").notNull().default(1),
    order: int("order").notNull().default(0),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [
    index("kpis_business_idx").on(table.businessId),
    index("kpis_category_idx").on(table.categoryId),
    index("kpis_owner_idx").on(table.ownerId),
    index("kpis_active_idx").on(table.isActive),
  ],
);

// KPI Periods
export const kpiPeriods = mysqlTable(
  "kpi_periods",
  {
    id: int("id").autoincrement().primaryKey(),
    businessId: int("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 191 }).notNull(),
    type: varchar("type", { length: 50 }).notNull(),
    number: int("number").notNull(),
    year: int("year").notNull(),
    month: int("month"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [
    index("kpi_periods_business_idx").on(table.businessId),
    index("kpi_periods_year_month_idx").on(table.year, table.month),
    uniqueIndex("kpi_periods_business_name_unique").on(table.businessId, table.name),
  ],
);

// KPI Data
export const kpiData = mysqlTable(
  "kpi_data",
  {
    id: int("id").autoincrement().primaryKey(),
    businessId: int("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    periodId: int("period_id")
      .notNull()
      .references(() => kpiPeriods.id, { onDelete: "cascade" }),
    kpiId: int("kpi_id")
      .notNull()
      .references(() => kpis.id, { onDelete: "cascade" }),
    actualValue: decimal("actual_value", { precision: 15, scale: 2 }),
    targetValue: decimal("target_value", { precision: 15, scale: 2 }),
    status: varchar("status", { length: 50 }),
    notes: longtext("notes"),
    enteredBy: int("entered_by").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [
    index("kpi_data_business_idx").on(table.businessId),
    index("kpi_data_period_idx").on(table.periodId),
    index("kpi_data_kpi_idx").on(table.kpiId),
    index("kpi_data_entered_by_idx").on(table.enteredBy),
    uniqueIndex("kpi_data_period_kpi_unique").on(table.periodId, table.kpiId),
  ],
);

// Issues
export const issues = mysqlTable(
  "issues",
  {
    id: int("id").autoincrement().primaryKey(),
    businessId: int("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 191 }).notNull(),
    description: longtext("description"),
    priority: varchar("priority", { length: 50 }).notNull(),
    status: varchar("status", { length: 50 }).notNull().default("open"),
    openAt: timestamp("open_at").defaultNow().notNull(),
    closeAt: timestamp("close_at"),
    ownerId: int("owner_id").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [
    index("issues_business_idx").on(table.businessId),
    index("issues_owner_idx").on(table.ownerId),
    index("issues_status_idx").on(table.status),
    index("issues_priority_idx").on(table.priority),
  ],
);

// Todos
export const todos = mysqlTable(
  "todos",
  {
    id: int("id").autoincrement().primaryKey(),
    businessId: int("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    issueId: int("issue_id")
      .notNull()
      .references(() => issues.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 191 }).notNull(),
    description: longtext("description"),
    ownerId: int("owner_id").notNull(),
    dueDate: timestamp("due_date"),
    isDone: tinyint("is_done").notNull().default(0),
    doneAt: timestamp("done_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [
    index("todos_business_idx").on(table.businessId),
    index("todos_issue_idx").on(table.issueId),
    index("todos_owner_idx").on(table.ownerId),
    index("todos_done_idx").on(table.isDone),
  ],
);

// Meetings
export const meetings = mysqlTable(
  "meetings",
  {
    id: int("id").autoincrement().primaryKey(),
    businessId: int("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    type: varchar("type", { length: 50 }).notNull(),
    date: timestamp("date").notNull(),
    agenda: longtext("agenda"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [
    index("meetings_business_idx").on(table.businessId),
    index("meetings_date_idx").on(table.date),
    index("meetings_type_idx").on(table.type),
  ],
);

// Meeting Participants
export const meetingParticipants = mysqlTable(
  "meeting_participants",
  {
    id: int("id").autoincrement().primaryKey(),
    businessId: int("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    meetingId: int("meeting_id")
      .notNull()
      .references(() => meetings.id, { onDelete: "cascade" }),
    userId: int("user_id").notNull(),
    isPresent: tinyint("is_present").notNull().default(0),
    rating: int("rating"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [
    index("meeting_participants_business_idx").on(table.businessId),
    index("meeting_participants_meeting_idx").on(table.meetingId),
    index("meeting_participants_user_idx").on(table.userId),
    uniqueIndex("meeting_participants_meeting_user_unique").on(table.meetingId, table.userId),
  ],
);

// Meeting Notes
export const meetingNotes = mysqlTable(
  "meeting_notes",
  {
    id: int("id").autoincrement().primaryKey(),
    businessId: int("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    meetingId: int("meeting_id")
      .notNull()
      .references(() => meetings.id, { onDelete: "cascade" }),
    createdBy: int("created_by").notNull(),
    isPrivate: tinyint("is_private").notNull().default(0),
    section: varchar("section", { length: 191 }),
    note: longtext("note").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [
    index("meeting_notes_business_idx").on(table.businessId),
    index("meeting_notes_meeting_idx").on(table.meetingId),
    index("meeting_notes_created_by_idx").on(table.createdBy),
    index("meeting_notes_private_idx").on(table.isPrivate),
  ],
);

// Seats
export const seats = mysqlTable(
  "seats",
  {
    id: int("id").autoincrement().primaryKey(),
    businessId: int("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 191 }).notNull(),
    parentId: int("parent_id"),
    level: int("level").notNull().default(0),
    order: int("order").notNull().default(0),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [
    index("seats_business_idx").on(table.businessId),
    index("seats_parent_idx").on(table.parentId),
    index("seats_level_idx").on(table.level),
  ],
);

// Seat Responsibilities
export const seatResponsibilities = mysqlTable(
  "seat_responsibilities",
  {
    id: int("id").autoincrement().primaryKey(),
    businessId: int("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    seatId: int("seat_id")
      .notNull()
      .references(() => seats.id, { onDelete: "cascade" }),
    description: longtext("description").notNull(),
    order: int("order").notNull().default(0),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [
    index("seat_responsibilities_business_idx").on(table.businessId),
    index("seat_responsibilities_seat_idx").on(table.seatId),
  ],
);

// Seat Assignments
export const seatAssignments = mysqlTable(
  "seat_assignments",
  {
    id: int("id").autoincrement().primaryKey(),
    businessId: int("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    seatId: int("seat_id")
      .notNull()
      .references(() => seats.id, { onDelete: "cascade" }),
    ownerId: int("owner_id").notNull(),
    gwdScore: int("gwd_score"),
    isRightPerson: tinyint("is_right_person").notNull().default(0),
    assignedAt: timestamp("assigned_at").defaultNow().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [
    index("seat_assignments_business_idx").on(table.businessId),
    index("seat_assignments_seat_idx").on(table.seatId),
    index("seat_assignments_owner_idx").on(table.ownerId),
    uniqueIndex("seat_assignments_seat_owner_unique").on(table.seatId, table.ownerId),
  ],
);
