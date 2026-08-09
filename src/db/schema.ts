import {
    bigint,
    date,
    decimal,
    index,
    int,
    json,
    longtext,
    mediumtext,
    mysqlEnum,
    mysqlTable,
    serial,
    text,
    time,
    timestamp,
    tinyint,
    uniqueIndex,
    varchar,
} from 'drizzle-orm/mysql-core';
import { relations } from 'drizzle-orm';

export type JsonRecord = Record<string, unknown> | null;

export const refreshTokens = mysqlTable(
    'refresh_tokens',
    {
        id: int('id').autoincrement().primaryKey(),
        userId: int('user_id')
            .notNull()
            .references(() => users.id, { onDelete: 'cascade' }),
        token: varchar('token', { length: 255 }).notNull(),
        expiresAt: timestamp('expires_at').notNull(),
        revokedAt: timestamp('revoked_at'),
        createdAt: timestamp('created_at').defaultNow().notNull(),
        updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
    },
    (table) => [
        uniqueIndex('refresh_tokens_token_unique').on(table.token),
        index('refresh_tokens_user_idx').on(table.userId),
    ]
);

export const customerRefreshTokens = mysqlTable(
    'customer_refresh_tokens',
    {
        id: int('id').autoincrement().primaryKey(),
        customerId: int('customer_id')
            .notNull()
            .references(() => customers.id, { onDelete: 'cascade' }),
        token: varchar('token', { length: 255 }).notNull(),
        expiresAt: timestamp('expires_at').notNull(),
        revokedAt: timestamp('revoked_at'),
        createdAt: timestamp('created_at').defaultNow().notNull(),
        updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
    },
    (table) => [
        uniqueIndex('crt_token_unique').on(table.token),
        index('crt_customer_idx').on(table.customerId),
    ]
);

export const customers = mysqlTable(
    'customers',
    {
        id: int('id').autoincrement().primaryKey(),
        email: varchar('email', { length: 191 }),
        username: varchar('username', { length: 100 }),
        phone: varchar('phone', { length: 32 }),
        fbid: varchar('fbid', { length: 191 }),
        googleId: varchar('googleid', { length: 191 }),
        password: varchar('password', { length: 255 }),
        dataJson: json('data_json').$type<JsonRecord>(),
        deletedAt: timestamp('deleted_at'),
        createdAt: timestamp('created_at').defaultNow().notNull(),
        updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
    },
    (table) => [
        uniqueIndex('customers_email_unique').on(table.email),
        uniqueIndex('customers_username_unique').on(table.username),
        uniqueIndex('customers_phone_unique').on(table.phone),
        uniqueIndex('customers_fbid_unique').on(table.fbid),
        uniqueIndex('customers_googleid_unique').on(table.googleId),
        index('customers_deleted_at_idx').on(table.deletedAt),
        index('customers_created_at_idx').on(table.createdAt),
        index('customers_updated_at_idx').on(table.updatedAt),
        // Composite index for common queries
        index('customers_deleted_created_idx').on(table.deletedAt, table.createdAt),
    ]
);

export const customerProfiles = mysqlTable(
    'customer_profiles',
    {
        id: int('id').autoincrement().primaryKey(),
        customerId: int('customer_id')
            .notNull()
            .references(() => customers.id, { onDelete: 'cascade' }),
        name: varchar('name', { length: 150 }),
        email: varchar('email', { length: 191 }),
        phone: varchar('phone', { length: 32 }),
        dataJson: json('data_json').$type<JsonRecord>(),
        createdAt: timestamp('created_at').defaultNow().notNull(),
        updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
    },
    (table) => [
        index('customer_profiles_customer_idx').on(table.customerId),
        uniqueIndex('customer_profiles_customer_unique').on(table.customerId),
    ]
);

export const storeCategoryProducts = mysqlTable(
    'store_category_products',
    {
        id: int('id').autoincrement().primaryKey(),
        name: varchar('name', { length: 191 }).notNull(),
        key: varchar('key', { length: 191 }).notNull(),
        dataJson: json('data_json').$type<JsonRecord>(),
        isShow: int('is_show').notNull().default(1),
        position: int('position').notNull().default(0),
        createdAt: timestamp('created_at').defaultNow().notNull(),
        updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
    },
    (table) => [
        index('store_category_products_visible_idx').on(table.isShow, table.position),
        uniqueIndex('store_category_products_name_unique').on(table.name),
        uniqueIndex('store_category_products_key_unique').on(table.key),
    ]
);

export const users = mysqlTable(
    'users',
    {
        id: int('id').autoincrement().primaryKey(),
        email: varchar('email', { length: 191 }),
        username: varchar('username', { length: 100 }),
        phone: varchar('phone', { length: 32 }),
        fbid: varchar('fbid', { length: 191 }),
        googleId: varchar('googleid', { length: 191 }),
        password: varchar('password', { length: 255 }),
        role: int('role').default(1).notNull(),
        dataJson: json('data_json').$type<JsonRecord>(),
        createdAt: timestamp('created_at').defaultNow().notNull(),
        updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
    },
    (table) => [
        uniqueIndex('users_email_unique').on(table.email),
        uniqueIndex('users_username_unique').on(table.username),
        uniqueIndex('users_phone_unique').on(table.phone),
        uniqueIndex('users_fbid_unique').on(table.fbid),
        uniqueIndex('users_googleid_unique').on(table.googleId),
    ]
);

export const profiles = mysqlTable(
    'profiles',
    {
        id: int('id').autoincrement().primaryKey(),
        userId: int('user_id')
            .notNull()
            .references(() => users.id, { onDelete: 'cascade' }),
        name: varchar('name', { length: 150 }),
        email: varchar('email', { length: 191 }),
        phone: varchar('phone', { length: 32 }),
        telegramUsername: varchar('telegram_username', { length: 64 }),
        dataJson: json('data_json').$type<JsonRecord>(),
        createdAt: timestamp('created_at').defaultNow().notNull(),
        updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
    },
    (table) => [
        index('profiles_user_idx').on(table.userId),
        uniqueIndex('profiles_user_unique').on(table.userId),
    ]
);

export const settings = mysqlTable(
    'settings',
    {
        id: int('id').autoincrement().primaryKey(),
        key: varchar('key', { length: 191 }).notNull(),
        dataJson: json('data_json').$type<JsonRecord>(),
        createdAt: timestamp('created_at').defaultNow().notNull(),
        updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
    },
    (table) => [uniqueIndex('settings_key_unique').on(table.key)]
);

export const settingMultiples = mysqlTable(
    'setting_multiple',
    {
        id: int('id').autoincrement().primaryKey(),
        name: varchar('name', { length: 191 }).notNull(),
        key: varchar('key', { length: 191 }).notNull(),
        dataJson: json('data_json').$type<JsonRecord>(),
        createdAt: timestamp('created_at').defaultNow().notNull(),
        updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
    },
    (table) => [uniqueIndex('setting_multiple_name_key_unique').on(table.name, table.key)]
);

export const chromeProfiles = mysqlTable(
    'chrome_profiles',
    {
        id: int('id').autoincrement().primaryKey(),
        uuid: varchar('uuid', { length: 36 }).notNull(),
        userId: int('user_id')
            .notNull()
            .references(() => users.id, { onDelete: 'cascade' }),
        customerId: int('customer_id').references(() => customers.id, { onDelete: 'set null' }),
        name: varchar('name', { length: 191 }).notNull(),
        userAgent: text('user_agent'),
        proxy: varchar('proxy', { length: 255 }),
        cookies: json('cookies'),
        fingerprint: json('fingerprint'),
        status: int('status').default(0).notNull(),
        // --- Profile lock (device exclusivity) ---
        // Sebuah chrome profile hanya boleh dibuka oleh satu device pada satu waktu.
        // Lock dianggap aktif selama lockExpiresAt > NOW(); aplikasi mengirim
        // heartbeat tiap 30 detik untuk memperpanjang lockExpiresAt.
        lockedBy: int('locked_by').references(() => users.id, { onDelete: 'set null' }),
        lockDeviceId: varchar('lock_device_id', { length: 255 }),
        lockedAt: timestamp('locked_at'),
        lockExpiresAt: timestamp('lock_expires_at'),
        createdAt: timestamp('created_at').defaultNow().notNull(),
        updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
    },
    (table) => [
        uniqueIndex('chrome_profiles_uuid_unique').on(table.uuid),
        index('chrome_profiles_user_idx').on(table.userId),
        index('chrome_profiles_customer_idx').on(table.customerId),
        index('chrome_profiles_locked_by_idx').on(table.lockedBy),
        index('chrome_profiles_lock_expires_idx').on(table.lockExpiresAt),
    ]
);

export const chromeHistories = mysqlTable(
    'chrome_histories',
    {
        id: int('id').autoincrement().primaryKey(),
        userId: int('user_id')
            .notNull()
            .references(() => users.id, { onDelete: 'cascade' }),
        customerId: int('customer_id').references(() => customers.id, { onDelete: 'set null' }),
        profileId: int('profile_id')
            .notNull()
            .references(() => chromeProfiles.id, { onDelete: 'cascade' }),
        url: varchar('url', { length: 2048 }).notNull(),
        count: int('count').notNull().default(0),
        dataJson: json('data_json').$type<JsonRecord>(),
        createdAt: timestamp('created_at').defaultNow().notNull(),
        updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
    },
    (table) => [
        index('chrome_histories_user_idx').on(table.userId),
        index('chrome_histories_customer_idx').on(table.customerId),
        index('chrome_histories_profile_idx').on(table.profileId),
    ]
);

export const chromeVisitEvents = mysqlTable(
    'chrome_visit_events',
    {
        id: int('id').autoincrement().primaryKey(),
        historyId: int('history_id')
            .notNull()
            .references(() => chromeHistories.id, { onDelete: 'cascade' }),
        userId: int('user_id')
            .notNull()
            .references(() => users.id, { onDelete: 'cascade' }),
        customerId: int('customer_id').references(() => customers.id, { onDelete: 'set null' }),
        visitedAt: timestamp('visited_at').notNull(),
        durationMs: int('duration_ms'),
        dataJson: json('data_json').$type<JsonRecord>(),
        createdAt: timestamp('created_at').defaultNow().notNull(),
    },
    (table) => [
        index('chrome_visit_events_user_visited_idx').on(table.userId, table.visitedAt),
        index('chrome_visit_events_history_idx').on(table.historyId),
        index('chrome_visit_events_customer_idx').on(table.customerId),
        index('chrome_visit_events_visited_at_idx').on(table.visitedAt),
    ]
);

export const chromeHtmls = mysqlTable(
    'chrome_htmls',
    {
        id: int('id').autoincrement().primaryKey(),
        historyId: int('history_id')
            .notNull()
            .references(() => chromeHistories.id, { onDelete: 'cascade' }),
        html: longtext('html'),
        dataJson: json('data_json').$type<JsonRecord>(),
        createdAt: timestamp('created_at').defaultNow().notNull(),
    },
    (table) => [index('chrome_htmls_history_idx').on(table.historyId)]
);

export const chromeActions = mysqlTable(
    'chrome_actions',
    {
        id: int('id').autoincrement().primaryKey(),
        historyId: int('history_id')
            .notNull()
            .references(() => chromeHistories.id, { onDelete: 'cascade' }),
        type: int('type').notNull(),
        dataJson: json('data_json').$type<JsonRecord>(),
        createdAt: timestamp('created_at').defaultNow().notNull(),
    },
    (table) => [index('chrome_actions_history_idx').on(table.historyId)]
);

export const chromeWhatsapps = mysqlTable(
    'chrome_whatsapps',
    {
        id: int('id').autoincrement().primaryKey(),
        userId: int('user_id')
            .notNull()
            .references(() => users.id, { onDelete: 'cascade' }),
        phone: varchar('phone', { length: 32 }).notNull(),
        createdAt: timestamp('created_at').defaultNow().notNull(),
        updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
    },
    (table) => [index('chrome_whatsapps_user_idx').on(table.userId)]
);

export const chromeWhatsappContacts = mysqlTable(
    'chrome_whatsapp_contacts',
    {
        id: int('id').autoincrement().primaryKey(),
        userId: int('user_id')
            .notNull()
            .references(() => users.id, { onDelete: 'cascade' }),
        whatsappId: int('whatsapp_id')
            .notNull()
            .references(() => chromeWhatsapps.id, { onDelete: 'cascade' }),
        name: varchar('name', { length: 191 }),
        phone: varchar('phone', { length: 32 }),
        waid: varchar('waid', { length: 191 }),
        lid: varchar('lid', { length: 191 }),
        createdAt: timestamp('created_at').defaultNow().notNull(),
        updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
    },
    (table) => [
        index('chrome_wa_contacts_user_idx').on(table.userId),
        index('chrome_wa_contacts_whatsapp_idx').on(table.whatsappId),
    ]
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

export const customerProfileRelations = relations(customerProfiles, ({ one }) => ({
    customer: one(customers, {
        fields: [customerProfiles.customerId],
        references: [customers.id],
    }),
}));

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

// ─── Security: Rate Limiting ─────────────────────────────────────────────

export const rateLimitEntries = mysqlTable(
    'rate_limit_entries',
    {
        id: int('id').autoincrement().primaryKey(),
        identifier: varchar('identifier', { length: 255 }).notNull(), // IP address or user identifier
        count: int('count').notNull().default(0),
        resetTime: timestamp('reset_time').notNull(),
        createdAt: timestamp('created_at').defaultNow().notNull(),
        updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
    },
    (table) => [
        uniqueIndex('rate_limit_identifier_unique').on(table.identifier),
        index('rate_limit_reset_time_idx').on(table.resetTime),
    ]
);

// ─── Security: Account Lockout ────────────────────────────────────────────

export const accountLockoutEntries = mysqlTable(
    'account_lockout_entries',
    {
        id: int('id').autoincrement().primaryKey(),
        identifier: varchar('identifier', { length: 255 }).notNull(), // email, phone, or username
        attempts: int('attempts').notNull().default(0),
        lockUntil: timestamp('lock_until'), // null if not locked
        createdAt: timestamp('created_at').defaultNow().notNull(),
        updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
    },
    (table) => [
        uniqueIndex('account_lockout_identifier_unique').on(table.identifier),
        index('account_lockout_lock_until_idx').on(table.lockUntil),
    ]
);

// ─── Audit Trail ─────────────────────────────────────────────────────────

export const auditLogs = mysqlTable(
    'audit_logs',
    {
        id: int('id').autoincrement().primaryKey(),
        userId: int('user_id').references(() => users.id, { onDelete: 'set null' }),
        customerId: int('customer_id').references(() => customers.id, { onDelete: 'set null' }),
        action: varchar('action', { length: 50 }).notNull(), // CREATE, UPDATE, DELETE, RESTORE, etc.
        entityType: varchar('entity_type', { length: 50 }).notNull(), // customer, user, subscription, etc.
        entityId: int('entity_id'),
        changes: json('changes').$type<JsonRecord>(), // before/after values
        ipAddress: varchar('ip_address', { length: 45 }),
        userAgent: text('user_agent'),
        createdAt: timestamp('created_at').defaultNow().notNull(),
    },
    (table) => [
        index('audit_logs_user_idx').on(table.userId),
        index('audit_logs_customer_idx').on(table.customerId),
        index('audit_logs_entity_idx').on(table.entityType, table.entityId),
        index('audit_logs_action_idx').on(table.action),
        index('audit_logs_created_at_idx').on(table.createdAt),
    ]
);

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
    'products',
    {
        id: int('id').autoincrement().primaryKey(),
        name: varchar('name', { length: 191 }).notNull(),
        description: text('description'),
        price: decimal('price', { precision: 12, scale: 2 }).default('0'),
        // active | inactive | archived
        status: varchar('status', { length: 20 }).default('active').notNull(),
        // Soft delete: produk tetap tersimpan dan bisa dipulihkan
        deletedAt: timestamp('deleted_at'),
        deletedBy: varchar('deleted_by', { length: 100 }),
        dataJson: json('data_json').$type<JsonRecord>(),
        createdAt: timestamp('created_at').defaultNow().notNull(),
        updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
    },
    (table) => [
        uniqueIndex('products_name_unique').on(table.name),
        index('products_status_idx').on(table.status),
        index('products_deleted_at_idx').on(table.deletedAt),
    ]
);

export const subscriptions = mysqlTable(
    'subscriptions',
    {
        id: int('id').autoincrement().primaryKey(),
        customerId: int('customer_id')
            .notNull()
            .references(() => customers.id, { onDelete: 'cascade' }),
        productId: int('product_id')
            .notNull()
            .references(() => products.id, { onDelete: 'cascade' }),
        advertiserId: int('advertiser_id').references(() => users.id, { onDelete: 'set null' }),
        brand: varchar('brand', { length: 191 }),
        platform: varchar('platform', { length: 191 }),
        startDate: date('start_date'),
        dueDate: date('due_date'),
        status: int('status').default(1).notNull(),
        onboardingDate: date('onboarding_date'),
        onboardingStatus: int('onboarding_status').default(0).notNull(),
        target: text('target'),
        onboardingUpdatedAt: timestamp('onboarding_updated_at'),
        note: text('note'),
        cancelReason: text('cancel_reason'),
        // Fase iklan untuk edukasi ekspektasi client (v-auto-client):
        // learning | optimization | scaling | steady. NULL = derive dari umur startDate.
        phase: varchar('phase', { length: 32 }),
        phaseUpdatedAt: timestamp('phase_updated_at'),
        phaseNote: varchar('phase_note', { length: 255 }),
        dataJson: json('data_json').$type<JsonRecord>(),
        createdAt: timestamp('created_at').defaultNow().notNull(),
        updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
    },
    (table) => [
        index('subscriptions_customer_idx').on(table.customerId),
        index('subscriptions_product_idx').on(table.productId),
        index('subscriptions_advertiser_idx').on(table.advertiserId),
        index('subscriptions_status_idx').on(table.status),
    ]
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
    'ticket_issues',
    {
        id: int('id').autoincrement().primaryKey(),
        title: varchar('title', { length: 255 }).notNull(),
        customerId: int('customer_id').references(() => customers.id, { onDelete: 'set null' }),
        subscriptionId: int('subscription_id').references(() => subscriptions.id, {
            onDelete: 'set null',
        }),
        assignedTo: int('assigned_to').references(() => users.id, { onDelete: 'set null' }),
        description: text('description'),
        status: int('status').default(0).notNull(),
        pendingOn: int('pending_on').default(0).notNull(),
        holdSince: timestamp('hold_since'),
        dataJson: json('data_json').$type<JsonRecord>(),
        createdAt: timestamp('created_at').defaultNow().notNull(),
        updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
    },
    (table) => [
        index('ticket_issues_customer_idx').on(table.customerId),
        index('ticket_issues_subscription_idx').on(table.subscriptionId),
        index('ticket_issues_assigned_idx').on(table.assignedTo),
        index('ticket_issues_status_idx').on(table.status),
    ]
);

// ─── Meetings ────────────────────────────────────────────────────────

export const meetings = mysqlTable(
    'meetings',
    {
        id: int('id').autoincrement().primaryKey(),
        type: int('type').default(0).notNull(),
        title: varchar('title', { length: 255 }).notNull(),
        date: timestamp('date'),
        customerId: int('customer_id').references(() => customers.id, { onDelete: 'set null' }),
        subscriptionId: int('subscription_id').references(() => subscriptions.id, {
            onDelete: 'set null',
        }),
        assignedTo: int('assigned_to').references(() => users.id, { onDelete: 'set null' }),
        members: text('members'),
        description: text('description'),
        summary: json('summary').$type<JsonRecord>(),
        actionItems: json('action_items').$type<JsonRecord>(),
        checklist: json('checklist').$type<JsonRecord>(),
        newTarget: json('new_target').$type<JsonRecord>(),
        newKpi: json('new_kpi').$type<JsonRecord>(),
        dataJson: json('data_json').$type<JsonRecord>(),
        createdAt: timestamp('created_at').defaultNow().notNull(),
        updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
    },
    (table) => [
        index('meetings_customer_idx').on(table.customerId),
        index('meetings_subscription_idx').on(table.subscriptionId),
        index('meetings_assigned_idx').on(table.assignedTo),
        index('meetings_date_idx').on(table.date),
    ]
);

export const meetingMembers = mysqlTable(
    'meeting_members',
    {
        id: int('id').autoincrement().primaryKey(),
        meetingId: int('meeting_id')
            .notNull()
            .references(() => meetings.id, { onDelete: 'cascade' }),
        userId: int('user_id')
            .notNull()
            .references(() => users.id, { onDelete: 'cascade' }),
    },
    (table) => [
        index('meeting_members_meeting_idx').on(table.meetingId),
        index('meeting_members_user_idx').on(table.userId),
    ]
);

// ─── Scorecards ──────────────────────────────────────────────────────

export const scorecards = mysqlTable(
    'scorecards',
    {
        id: int('id').autoincrement().primaryKey(),
        customerId: int('customer_id').references(() => customers.id, { onDelete: 'set null' }),
        subscriptionId: int('subscription_id').references(() => subscriptions.id, {
            onDelete: 'set null',
        }),
        title: varchar('title', { length: 255 }).notNull(),
        description: text('description'),
        assignedTo: int('assigned_to').references(() => users.id, { onDelete: 'set null' }),
        pic: int('pic').default(0).notNull(), // 0 = internal (advertiser), 1 = client
        category: int('category').default(0).notNull(), // 0 = goal / target, 1 = indikator, 2 = aktifitas yang bisa di ukur
        targetValue: decimal('target_value', { precision: 14, scale: 2 }),
        targetType: int('target_type').default(0).notNull(), // 0 = minimum (actual lebih besar = lebih baik), 1 = maximum (actual lebih kecil = lebih baik)
        unitValue: int('unit_value').default(0).notNull(),
        unitCustom: varchar('unit_custom', { length: 100 }),
        frequency: int('frequency').default(1).notNull(),
        showOnScorecard: int('show_on_scorecard').default(1).notNull(),
        greenThreshold: int('green_threshold').default(100).notNull(),
        yellowThreshold: int('yellow_threshold').default(80).notNull(),
        status: int('status').default(1).notNull(),
        createdAt: timestamp('created_at').defaultNow().notNull(),
        updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
    },
    (table) => [
        index('scorecards_customer_idx').on(table.customerId),
        index('scorecards_subscription_idx').on(table.subscriptionId),
        index('scorecards_assigned_idx').on(table.assignedTo),
        index('scorecards_status_idx').on(table.status),
    ]
);

export const scorecardData = mysqlTable(
    'scorecard_data',
    {
        id: int('id').autoincrement().primaryKey(),
        scorecardId: int('scorecard_id')
            .notNull()
            .references(() => scorecards.id, { onDelete: 'cascade' }),
        year: int('year').notNull(),
        month: int('month'),
        week: int('week'),
        day: int('day'),
        actualValue: decimal('actual_value', { precision: 14, scale: 2 }),
        targetValue: decimal('target_value', { precision: 14, scale: 2 }),
        status: int('status').default(1).notNull(),
        threshold: int('threshold').default(0).notNull(),
        trend: int('trend').default(0).notNull(),
        enteredBy: int('entered_by').default(0).notNull(),
        createdAt: timestamp('created_at').defaultNow().notNull(),
        updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
    },
    (table) => [
        index('scorecard_data_scorecard_idx').on(table.scorecardId),
        index('scorecard_data_period_idx').on(table.year, table.month, table.week),
        index('scorecard_data_status_idx').on(table.status),
    ]
);

// ─── Todos ───────────────────────────────────────────────────────────

export const todos = mysqlTable(
    'todos',
    {
        id: int('id').autoincrement().primaryKey(),
        type: int('type').default(3).notNull(), // 0 = scorecard 1 = meeting, 2 = ticket issue, 3 = other
        title: varchar('title', { length: 255 }).notNull(),
        customerId: int('customer_id').references(() => customers.id, { onDelete: 'set null' }),
        subscriptionId: int('subscription_id').references(() => subscriptions.id, {
            onDelete: 'set null',
        }),
        assignedTo: int('assigned_to').references(() => users.id, { onDelete: 'set null' }),
        pic: int('pic').default(0).notNull(),
        scorecardId: int('scorecard_id').references(() => scorecards.id, { onDelete: 'set null' }),
        scorecardDataId: int('scorecard_data_id').references(() => scorecardData.id, {
            onDelete: 'set null',
        }),
        meetingId: int('meeting_id').references(() => meetings.id, { onDelete: 'set null' }),
        ticketIssueId: int('ticket_issue_id').references(() => ticketIssues.id, {
            onDelete: 'set null',
        }),
        description: text('description'),
        status: int('status').default(0).notNull(),
        subTask: json('sub_task').$type<JsonRecord>(),
        checklist: json('checklist').$type<JsonRecord>(),
        startDate: date('start_date'),
        dueDate: date('due_date'),
        priority: int('priority').default(1).notNull(),
        tags: text('tags'),
        platform: varchar('platform', { length: 191 }),
        isRecurring: int('is_recurring').default(0).notNull(),
        dataJson: json('data_json').$type<JsonRecord>(),
        createdAt: timestamp('created_at').defaultNow().notNull(),
        updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
    },
    (table) => [
        index('todos_customer_idx').on(table.customerId),
        index('todos_subscription_idx').on(table.subscriptionId),
        index('todos_assigned_idx').on(table.assignedTo),
        index('todos_status_idx').on(table.status),
        index('todos_priority_idx').on(table.priority),
        index('todos_type_idx').on(table.type),
        index('todos_scorecard_idx').on(table.scorecardId),
        index('todos_meeting_idx').on(table.meetingId),
        index('todos_ticket_idx').on(table.ticketIssueId),
    ]
);

// ─── Repeat Task ─────────────────────────────────────────────────────

export const repeatTasks = mysqlTable(
    'repeat_tasks',
    {
        id: int('id').autoincrement().primaryKey(),
        todoId: int('todo_id')
            .notNull()
            .references(() => todos.id, { onDelete: 'cascade' }),
        type: int('type').default(0).notNull(), // 0 = daily, 1 = weekly, 2 = monthly, 3 = yearly
        status: int('status').default(0).notNull(), // 0 = active, 1 = inactive
        interval: int('interval').default(1).notNull(), // tiap N hari/minggu/bulan/tahun
        byWeekday: int('by_weekday'), // weekly: 0=Min..6=Sab (null = ikut startDate)
        byMonthDay: int('by_month_day'), // monthly/yearly: 1..31, atau -1 = hari terakhir bulan
        byMonth: int('by_month'), // yearly: 1..12
        excludeWeekdays: json('exclude_weekdays').$type<number[]>(), // daily: hari yang dilewati (0=Min..6=Sab)
        startDate: date('start_date', { mode: 'string' }), // mulai berlaku
        endDate: date('end_date', { mode: 'string' }), // berhenti (null = selamanya)
        maxOccurrences: int('max_occurrences'), // alternatif stop (null = tak terbatas)
        generatedCount: int('generated_count').default(0).notNull(),
        lastRunDate: date('last_run_date', { mode: 'string' }), // occurrence terakhir yang dibuat
        nextRunDate: date('next_run_date', { mode: 'string' }), // occurrence berikutnya (cursor cron)
        createdAt: timestamp('created_at').defaultNow().notNull(),
        updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
    },
    (table) => [
        index('repeat_task_todo_idx').on(table.todoId),
        index('repeat_task_next_run_idx').on(table.status, table.nextRunDate),
    ]
);

// ─── Todo Repeat History ─────────────────────────────────────────────

export const todoRepeatHistories = mysqlTable(
    'todo_repeat_histories',
    {
        id: int('id').autoincrement().primaryKey(),
        repeatTaskId: int('repeat_task_id')
            .notNull()
            .references(() => repeatTasks.id, { onDelete: 'cascade' }),
        occurrenceDate: date('occurrence_date', { mode: 'string' }).notNull(), // tanggal occurrence ini (anchor idempotensi)
        type: int('type').default(3).notNull(),
        title: varchar('title', { length: 255 }).notNull(),
        customerId: int('customer_id').references(() => customers.id, { onDelete: 'set null' }),
        subscriptionId: int('subscription_id').references(() => subscriptions.id, {
            onDelete: 'set null',
        }),
        assignedTo: int('assigned_to').references(() => users.id, { onDelete: 'set null' }),
        pic: int('pic').default(0).notNull(),
        scorecardId: int('scorecard_id').references(() => scorecards.id, { onDelete: 'set null' }),
        scorecardDataId: int('scorecard_data_id').references(() => scorecardData.id, {
            onDelete: 'set null',
        }),
        meetingId: int('meeting_id').references(() => meetings.id, { onDelete: 'set null' }),
        ticketIssueId: int('ticket_issue_id').references(() => ticketIssues.id, {
            onDelete: 'set null',
        }),
        description: text('description'),
        status: int('status').default(0).notNull(),
        subTask: json('sub_task').$type<JsonRecord>(),
        checklist: json('checklist').$type<JsonRecord>(),
        startDate: date('start_date', { mode: 'string' }),
        dueDate: date('due_date', { mode: 'string' }),
        priority: int('priority').default(1).notNull(),
        tags: text('tags'),
        platform: varchar('platform', { length: 191 }),
        isRecurring: int('is_recurring').default(0).notNull(),
        dataJson: json('data_json').$type<JsonRecord>(),
        createdAt: timestamp('created_at').defaultNow().notNull(),
        updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
    },
    (table) => [
        index('todo_repeat_hist_repeat_idx').on(table.repeatTaskId),
        uniqueIndex('todo_repeat_hist_repeat_occurrence_unique').on(
            table.repeatTaskId,
            table.occurrenceDate
        ),
        index('todo_repeat_hist_customer_idx').on(table.customerId),
        index('todo_repeat_hist_assigned_idx').on(table.assignedTo),
        index('todo_repeat_hist_status_idx').on(table.status),
    ]
);

// ─── Relations for new tables ────────────────────────────────────────

export const ticketIssueRelations = relations(ticketIssues, ({ one }) => ({
    customer: one(customers, { fields: [ticketIssues.customerId], references: [customers.id] }),
    subscription: one(subscriptions, {
        fields: [ticketIssues.subscriptionId],
        references: [subscriptions.id],
    }),
    assignee: one(users, { fields: [ticketIssues.assignedTo], references: [users.id] }),
}));

export const meetingRelations = relations(meetings, ({ one, many }) => ({
    customer: one(customers, { fields: [meetings.customerId], references: [customers.id] }),
    subscription: one(subscriptions, {
        fields: [meetings.subscriptionId],
        references: [subscriptions.id],
    }),
    assignee: one(users, { fields: [meetings.assignedTo], references: [users.id] }),
    meetingMembers: many(meetingMembers),
}));

export const meetingMemberRelations = relations(meetingMembers, ({ one }) => ({
    meeting: one(meetings, { fields: [meetingMembers.meetingId], references: [meetings.id] }),
    user: one(users, { fields: [meetingMembers.userId], references: [users.id] }),
}));

export const scorecardRelations = relations(scorecards, ({ one, many }) => ({
    customer: one(customers, { fields: [scorecards.customerId], references: [customers.id] }),
    subscription: one(subscriptions, {
        fields: [scorecards.subscriptionId],
        references: [subscriptions.id],
    }),
    assignee: one(users, { fields: [scorecards.assignedTo], references: [users.id] }),
    data: many(scorecardData),
}));

export const scorecardDataRelations = relations(scorecardData, ({ one }) => ({
    scorecard: one(scorecards, {
        fields: [scorecardData.scorecardId],
        references: [scorecards.id],
    }),
}));

export const todoRelations = relations(todos, ({ one, many }) => ({
    customer: one(customers, { fields: [todos.customerId], references: [customers.id] }),
    subscription: one(subscriptions, {
        fields: [todos.subscriptionId],
        references: [subscriptions.id],
    }),
    assignee: one(users, { fields: [todos.assignedTo], references: [users.id] }),
    scorecard: one(scorecards, { fields: [todos.scorecardId], references: [scorecards.id] }),
    meeting: one(meetings, { fields: [todos.meetingId], references: [meetings.id] }),
    ticketIssue: one(ticketIssues, {
        fields: [todos.ticketIssueId],
        references: [ticketIssues.id],
    }),
    repeats: many(repeatTasks),
}));

export const repeatTaskRelations = relations(repeatTasks, ({ one, many }) => ({
    todo: one(todos, { fields: [repeatTasks.todoId], references: [todos.id] }),
    histories: many(todoRepeatHistories),
}));

export const todoRepeatHistoryRelations = relations(todoRepeatHistories, ({ one }) => ({
    repeatTask: one(repeatTasks, {
        fields: [todoRepeatHistories.repeatTaskId],
        references: [repeatTasks.id],
    }),
    customer: one(customers, {
        fields: [todoRepeatHistories.customerId],
        references: [customers.id],
    }),
    subscription: one(subscriptions, {
        fields: [todoRepeatHistories.subscriptionId],
        references: [subscriptions.id],
    }),
    assignee: one(users, { fields: [todoRepeatHistories.assignedTo], references: [users.id] }),
    scorecard: one(scorecards, {
        fields: [todoRepeatHistories.scorecardId],
        references: [scorecards.id],
    }),
    meeting: one(meetings, { fields: [todoRepeatHistories.meetingId], references: [meetings.id] }),
    ticketIssue: one(ticketIssues, {
        fields: [todoRepeatHistories.ticketIssueId],
        references: [ticketIssues.id],
    }),
}));

// fb

export const fbAct = mysqlTable(
    'fb_act',
    {
        id: int('id').autoincrement().primaryKey(),
        customerId: int('customer_id')
            .notNull()
            .references(() => customers.id, { onDelete: 'cascade' }),
        subscriptionId: int('subscription_id')
            .notNull()
            .references(() => subscriptions.id, { onDelete: 'cascade' }),
        tokenId: int('token_id').references(() => fbToken.id, { onDelete: 'set null' }),
        actId: varchar('act_id', { length: 191 }).notNull(),
        actName: varchar('act_name', { length: 255 }),
        name: varchar('name', { length: 255 }),
        dataJson: json('data_json').$type<JsonRecord>(),
        thresholdWarningOverride: decimal('threshold_warning_override', {
            precision: 20,
            scale: 2,
        }),
        thresholdCriticalOverride: decimal('threshold_critical_override', {
            precision: 20,
            scale: 2,
        }),
        postpaidThresholdOverride: decimal('postpaid_threshold_override', {
            precision: 20,
            scale: 2,
        }),
        createdAt: timestamp('created_at').defaultNow().notNull(),
        updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
    },
    (table) => [
        index('fb_act_customer_idx').on(table.customerId),
        index('fb_act_subscription_idx').on(table.subscriptionId),
        index('fb_act_act_id_idx').on(table.actId),
    ]
);

export const fbToken = mysqlTable(
    'fb_token',
    {
        id: int('id').autoincrement().primaryKey(),
        userId: int('user_id')
            .notNull()
            .references(() => users.id, { onDelete: 'cascade' }),
        token: text('token').notNull(),
        status: tinyint('status').notNull().default(1),
        createdAt: timestamp('created_at').defaultNow().notNull(),
        updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
    },
    (table) => [
        index('fb_token_user_idx').on(table.userId),
        index('fb_token_status_idx').on(table.status),
    ]
);

export const fbActRelations = relations(fbAct, ({ one }) => ({
    customer: one(customers, { fields: [fbAct.customerId], references: [customers.id] }),
    subscription: one(subscriptions, {
        fields: [fbAct.subscriptionId],
        references: [subscriptions.id],
    }),
    token: one(fbToken, { fields: [fbAct.tokenId], references: [fbToken.id] }),
}));

export const fbTokenRelations = relations(fbToken, ({ one }) => ({
    user: one(users, { fields: [fbToken.userId], references: [users.id] }),
}));

export const fbActDailyData = mysqlTable(
    'fb_act_daily_data',
    {
        id: int('id').autoincrement().primaryKey(),
        fbActId: int('fb_act_id').references(() => fbAct.id, { onDelete: 'set null' }),
        actId: varchar('act_id', { length: 64 }).notNull(),
        date: date('date').notNull(),
        balance: decimal('balance', { precision: 20, scale: 2 }),
        amountSpent: decimal('amount_spent', { precision: 20, scale: 2 }),
        spendCap: decimal('spend_cap', { precision: 20, scale: 2 }),
        effectiveBalance: decimal('effective_balance', { precision: 20, scale: 2 }),
        balanceType: varchar('balance_type', { length: 32 }),
        spendingLimit: decimal('spending_limit', { precision: 20, scale: 2 }),
        outstandingBalance: decimal('outstanding_balance', { precision: 20, scale: 2 }),
        // 0 = ok, 1 = warning, 2 = critical
        statusLevel: tinyint('status_level').notNull().default(0),
        warningMessage: text('warning_message'),
        spend: decimal('spend', { precision: 20, scale: 2 }),
        impressions: int('impressions'),
        reach: int('reach'),
        frequency: decimal('frequency', { precision: 10, scale: 4 }),
        linkClicks: int('link_clicks'),
        ctr: decimal('ctr', { precision: 10, scale: 4 }),
        cpm: decimal('cpm', { precision: 20, scale: 2 }),
        cpc: decimal('cpc', { precision: 20, scale: 2 }),
        dataJson: json('data_json').$type<JsonRecord>(),
        createdAt: timestamp('created_at').defaultNow().notNull(),
        updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
    },
    (table) => [
        uniqueIndex('fb_act_daily_data_act_date_unique').on(table.actId, table.date),
        index('fb_act_daily_data_act_idx').on(table.actId),
        index('fb_act_daily_data_date_idx').on(table.date),
    ]
);

export const fbActResultConfig = mysqlTable(
    'fb_act_result_config',
    {
        id: int('id').autoincrement().primaryKey(),
        fbActId: int('fb_act_id').references(() => fbAct.id, { onDelete: 'set null' }),
        actId: varchar('act_id', { length: 64 }).notNull(),
        actionType: varchar('action_type', { length: 128 }).notNull(),
        // lead | purchase | message | profile_visit
        resultType: varchar('result_type', { length: 32 }).notNull(),
        label: varchar('label', { length: 128 }).notNull(),
        sortOrder: int('sort_order').notNull().default(0),
        // 0 = false, 1 = true (instagram_profile_visit — dihitung dari link_click campaign Traffic)
        isFallback: tinyint('is_fallback').notNull().default(0),
        dataJson: json('data_json').$type<JsonRecord>(),
        createdAt: timestamp('created_at').defaultNow().notNull(),
        updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
    },
    (table) => [
        uniqueIndex('fb_act_result_config_act_action_unique').on(table.actId, table.actionType),
        index('fb_act_result_config_act_idx').on(table.actId),
    ]
);

export const fbActCampaignDailyInsights = mysqlTable(
    'fb_act_campaign_daily_insights',
    {
        id: int('id').autoincrement().primaryKey(),
        fbActId: int('fb_act_id').references(() => fbAct.id, { onDelete: 'set null' }),
        actId: varchar('act_id', { length: 64 }).notNull(),
        date: date('date').notNull(),
        campaignId: varchar('campaign_id', { length: 64 }).notNull(),
        campaignName: varchar('campaign_name', { length: 255 }),
        spend: decimal('spend', { precision: 20, scale: 2 }),
        linkClicks: int('link_clicks'),
        // 0 = false, 1 = true
        isTrafficCampaign: tinyint('is_traffic_campaign').notNull().default(0),
        resolvedPrimaryActionType: varchar('resolved_primary_action_type', { length: 128 }),
        dataJson: json('data_json').$type<JsonRecord>(),
        createdAt: timestamp('created_at').defaultNow().notNull(),
        updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
    },
    (table) => [
        uniqueIndex('fb_act_campaign_daily_act_date_camp_unique').on(
            table.actId,
            table.date,
            table.campaignId
        ),
        index('fb_act_campaign_daily_act_idx').on(table.actId),
        index('fb_act_campaign_daily_date_idx').on(table.date),
    ]
);

export const fbActResultBreakdownDaily = mysqlTable(
    'fb_act_result_breakdown_daily',
    {
        id: int('id').autoincrement().primaryKey(),
        fbActId: int('fb_act_id').references(() => fbAct.id, { onDelete: 'set null' }),
        actId: varchar('act_id', { length: 64 }).notNull(),
        date: date('date').notNull(),
        label: varchar('label', { length: 128 }).notNull(),
        // 0 = primary, 1 = traffic, 2 = fallback
        resultType: tinyint('result_type').notNull().default(0),
        results: int('results').notNull().default(0),
        spent: decimal('spent', { precision: 20, scale: 2 }),
        totalPurchase: int('total_purchase'),
        purchaseValue: decimal('purchase_value', { precision: 20, scale: 2 }),
        costPerPurchase: decimal('cost_per_purchase', { precision: 20, scale: 2 }),
        roas: decimal('roas', { precision: 10, scale: 4 }),
        dataJson: json('data_json').$type<JsonRecord>(),
        createdAt: timestamp('created_at').defaultNow().notNull(),
        updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
    },
    (table) => [
        uniqueIndex('fb_act_breakdown_act_date_label_unique').on(
            table.actId,
            table.date,
            table.label
        ),
        index('fb_act_breakdown_act_idx').on(table.actId),
        index('fb_act_breakdown_date_idx').on(table.date),
    ]
);

export const fbActNotificationsLog = mysqlTable(
    'fb_act_notifications_log',
    {
        id: int('id').autoincrement().primaryKey(),
        fbActId: int('fb_act_id').references(() => fbAct.id, { onDelete: 'set null' }),
        actId: varchar('act_id', { length: 64 }).notNull(),
        date: date('date', { mode: 'string' }).notNull(),
        // main | extra (extra = grup Telegram tambahan per akun)
        type: varchar('type', { length: 64 }).notNull(),
        dataJson: json('data_json').$type<JsonRecord>(),
        createdAt: timestamp('created_at').defaultNow().notNull(),
    },
    (table) => [
        index('fb_act_notif_log_act_idx').on(table.actId),
        index('fb_act_notif_log_date_idx').on(table.date),
        index('fb_act_notif_log_type_idx').on(table.type),
    ]
);

export const fbActReportRuns = mysqlTable(
    'fb_act_report_runs',
    {
        id: int('id').autoincrement().primaryKey(),
        date: date('date').notNull(),
        startedAt: timestamp('started_at'),
        finishedAt: timestamp('finished_at'),
        accountsTotal: int('accounts_total').notNull().default(0),
        accountsSuccess: int('accounts_success').notNull().default(0),
        accountsFailed: int('accounts_failed').notNull().default(0),
        dataJson: json('data_json').$type<JsonRecord>(),
        createdAt: timestamp('created_at').defaultNow().notNull(),
    },
    (table) => [
        uniqueIndex('fb_act_report_runs_date_unique').on(table.date),
        index('fb_act_report_runs_date_idx').on(table.date),
    ]
);

// ─── Notification System ─────────────────────────────────────────────

export const notificationSettingsGlobal = mysqlTable('notification_settings_global', {
    userId: int('user_id')
        .primaryKey()
        .references(() => users.id, { onDelete: 'cascade' }),
    telegramUsername: varchar('telegram_username', { length: 64 }),
    extraTelegramUsername: varchar('extra_telegram_username', { length: 64 }),
    telegramStatus: tinyint('telegram_status').notNull().default(0), // 0=unknown, 1=verified, 2=failed
    telegramVerifiedAt: timestamp('telegram_verified_at'),
    quietHoursStart: tinyint('quiet_hours_start').notNull().default(22),
    quietHoursEnd: tinyint('quiet_hours_end').notNull().default(6),
    dailyReportTime: tinyint('daily_report_time').notNull().default(5),
    language: varchar('language', { length: 8 }).notNull().default('id'),
    pausedUntil: timestamp('paused_until'),
    pausedReason: varchar('paused_reason', { length: 255 }),
    dataJson: json('data_json').$type<JsonRecord>(),
    updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
});

export const notificationPreferences = mysqlTable(
    'notification_preferences',
    {
        id: int('id').autoincrement().primaryKey(),
        userId: int('user_id')
            .notNull()
            .references(() => users.id, { onDelete: 'cascade' }),
        fbActId: int('fb_act_id').references(() => fbAct.id, { onDelete: 'cascade' }),
        notifCode: varchar('notif_code', { length: 64 }).notNull(),
        enabled: tinyint('enabled').notNull().default(1),
        channel: varchar('channel', { length: 32 }).notNull().default('telegram'),
        dataJson: json('data_json').$type<JsonRecord>(),
        createdAt: timestamp('created_at').defaultNow().notNull(),
        updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
    },
    (table) => [
        uniqueIndex('notif_pref_user_act_code_unique').on(
            table.userId,
            table.fbActId,
            table.notifCode,
            table.channel
        ),
        index('notif_pref_user_idx').on(table.userId),
        index('notif_pref_act_idx').on(table.fbActId),
    ]
);

export const notificationLog = mysqlTable(
    'notification_log',
    {
        id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
        userId: int('user_id').references(() => users.id, { onDelete: 'set null' }),
        fbActId: int('fb_act_id').references(() => fbAct.id, { onDelete: 'set null' }),
        notifCode: varchar('notif_code', { length: 64 }).notNull(),
        mode: varchar('mode', { length: 1 }).notNull(), // A | B | C
        dedupeKey: varchar('dedupe_key', { length: 191 }).notNull(),
        recipient: varchar('recipient', { length: 128 }).notNull(),
        title: varchar('title', { length: 255 }),
        preview: varchar('preview', { length: 500 }),
        body: text('body'),
        status: mysqlEnum('status', ['sent', 'failed', 'skipped']).notNull(),
        reason: varchar('reason', { length: 255 }),
        readAt: timestamp('read_at'),
        dataJson: json('data_json').$type<JsonRecord>(),
        createdAt: timestamp('created_at').defaultNow().notNull(),
    },
    (table) => [
        uniqueIndex('notif_log_dedupe_unique').on(
            table.dedupeKey,
            table.recipient,
            table.notifCode
        ),
        index('notif_log_user_date_idx').on(table.userId, table.createdAt),
        index('notif_log_act_code_idx').on(table.fbActId, table.notifCode),
        index('notif_log_unread_idx').on(table.userId, table.readAt),
    ]
);

// ─── Onboarding Progress ─────────────────────────────────────────────

export const userOnboardingProgress = mysqlTable(
    'user_onboarding_progress',
    {
        id: int('id').autoincrement().primaryKey(),
        userId: int('user_id')
            .notNull()
            .references(() => users.id, { onDelete: 'cascade' }),
        flowKey: varchar('flow_key', { length: 64 }).notNull(),
        stepKey: varchar('step_key', { length: 64 }).notNull(),
        manual: tinyint('manual').notNull().default(0),
        completedAt: timestamp('completed_at'),
        dismissedAt: timestamp('dismissed_at'),
        createdAt: timestamp('created_at').defaultNow().notNull(),
        updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
    },
    (table) => [
        uniqueIndex('uop_user_flow_step_unique').on(table.userId, table.flowKey, table.stepKey),
        index('uop_user_idx').on(table.userId),
        index('uop_flow_idx').on(table.flowKey),
    ]
);

// ─── Credential Vault ────────────────────────────────────────────────

// type item
export const CREDENTIAL_TYPE = {
    APP_LOGIN: 0, // url + username + password
    API_TOKEN: 1, // token / api_key / secret (+ endpoint)
    OTHER: 2, // bebas (pakai extra fields)
} as const;

// visibilitas item
export const CREDENTIAL_VISIBILITY = {
    PRIVATE: 0, // hanya owner
    TEAM: 1, // semua user login
    RESTRICTED: 2, // sesuai credential_shares
} as const;

export const CREDENTIAL_PRINCIPAL = { USER: 0, ROLE: 1 } as const;
export const CREDENTIAL_PERMISSION = { VIEW: 0, EDIT: 1 } as const;
export const CREDENTIAL_ACTION = {
    REVEAL: 0,
    CREATE: 1,
    UPDATE: 2,
    DELETE: 3,
    SHARE: 4,
} as const;

export const credentials = mysqlTable(
    'credentials',
    {
        id: int('id').autoincrement().primaryKey(),
        ownerId: int('owner_id')
            .notNull()
            .references(() => users.id, { onDelete: 'cascade' }),
        title: varchar('title', { length: 191 }).notNull(),
        type: int('type').default(0).notNull(), // CREDENTIAL_TYPE
        visibility: int('visibility').default(0).notNull(), // CREDENTIAL_VISIBILITY
        category: varchar('category', { length: 100 }),
        // field non-rahasia (plaintext, boleh dicari)
        url: varchar('url', { length: 500 }),
        username: varchar('username', { length: 191 }),
        // payload rahasia terenkripsi AES-256-GCM (format: iv.tag.ciphertext base64)
        secretEnc: text('secret_enc'),
        createdAt: timestamp('created_at').defaultNow().notNull(),
        updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
    },
    (table) => [
        index('credentials_owner_idx').on(table.ownerId),
        index('credentials_visibility_idx').on(table.visibility),
        index('credentials_type_idx').on(table.type),
    ]
);

export const credentialShares = mysqlTable(
    'credential_shares',
    {
        id: int('id').autoincrement().primaryKey(),
        credentialId: int('credential_id')
            .notNull()
            .references(() => credentials.id, { onDelete: 'cascade' }),
        principalType: int('principal_type').notNull(), // CREDENTIAL_PRINCIPAL
        principalId: int('principal_id').notNull(), // users.id ATAU role number (0–7)
        permission: int('permission').default(0).notNull(), // CREDENTIAL_PERMISSION
        createdAt: timestamp('created_at').defaultNow().notNull(),
    },
    (table) => [
        uniqueIndex('cred_share_unique').on(
            table.credentialId,
            table.principalType,
            table.principalId
        ),
        index('cred_share_credential_idx').on(table.credentialId),
    ]
);

export const credentialAccessLogs = mysqlTable(
    'credential_access_logs',
    {
        id: bigint('id', { mode: 'number' }).autoincrement().primaryKey(),
        credentialId: int('credential_id').notNull(), // tanpa FK agar log tetap ada walau item dihapus
        userId: int('user_id').notNull(),
        action: int('action').notNull(), // CREDENTIAL_ACTION
        createdAt: timestamp('created_at').defaultNow().notNull(),
    },
    (table) => [
        index('cred_log_credential_idx').on(table.credentialId),
        index('cred_log_user_idx').on(table.userId),
    ]
);

export const credentialRelations = relations(credentials, ({ one, many }) => ({
    owner: one(users, { fields: [credentials.ownerId], references: [users.id] }),
    shares: many(credentialShares),
}));

export const credentialShareRelations = relations(credentialShares, ({ one }) => ({
    credential: one(credentials, {
        fields: [credentialShares.credentialId],
        references: [credentials.id],
    }),
}));

// ─── Client App (v-auto-client) ──────────────────────────────────────

// Feed update/saran dari tim advertiser ke client.
// type: info | attention | milestone | request | education
export const clientUpdates = mysqlTable(
    'client_updates',
    {
        id: int('id').autoincrement().primaryKey(),
        customerId: int('customer_id')
            .notNull()
            .references(() => customers.id, { onDelete: 'cascade' }),
        subscriptionId: int('subscription_id').references(() => subscriptions.id, {
            onDelete: 'set null',
        }),
        authorUserId: int('author_user_id').references(() => users.id, { onDelete: 'set null' }),
        type: varchar('type', { length: 32 }).notNull().default('info'),
        title: varchar('title', { length: 255 }).notNull(),
        body: text('body'),
        // snapshot angka saat update dibuat, mis. { spend, revenue, roas, period }
        metricSnapshot: json('metric_snapshot').$type<JsonRecord>(),
        publishedAt: timestamp('published_at').defaultNow().notNull(),
        createdAt: timestamp('created_at').defaultNow().notNull(),
        updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
    },
    (table) => [
        index('client_updates_customer_published_idx').on(table.customerId, table.publishedAt),
        index('client_updates_subscription_idx').on(table.subscriptionId),
    ]
);

export const clientUpdateReads = mysqlTable(
    'client_update_reads',
    {
        id: int('id').autoincrement().primaryKey(),
        updateId: int('update_id')
            .notNull()
            .references(() => clientUpdates.id, { onDelete: 'cascade' }),
        customerId: int('customer_id')
            .notNull()
            .references(() => customers.id, { onDelete: 'cascade' }),
        readAt: timestamp('read_at').defaultNow().notNull(),
    },
    (table) => [
        uniqueIndex('client_update_reads_unique').on(table.updateId, table.customerId),
        index('client_update_reads_customer_idx').on(table.customerId),
    ]
);

// Request aset media dari advertiser ke tim client.
// type: video | image | copywriting | product_info | other
// status: requested | in_progress | delivered | approved
export const assetRequests = mysqlTable(
    'asset_requests',
    {
        id: int('id').autoincrement().primaryKey(),
        customerId: int('customer_id')
            .notNull()
            .references(() => customers.id, { onDelete: 'cascade' }),
        subscriptionId: int('subscription_id').references(() => subscriptions.id, {
            onDelete: 'set null',
        }),
        requestedBy: int('requested_by').references(() => users.id, { onDelete: 'set null' }),
        type: varchar('type', { length: 32 }).notNull().default('other'),
        title: varchar('title', { length: 255 }).notNull(),
        description: text('description'),
        dueDate: date('due_date', { mode: 'string' }),
        status: varchar('status', { length: 32 }).notNull().default('requested'),
        deliveredAt: timestamp('delivered_at'),
        createdAt: timestamp('created_at').defaultNow().notNull(),
        updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
    },
    (table) => [
        index('asset_requests_customer_idx').on(table.customerId, table.status),
        index('asset_requests_subscription_idx').on(table.subscriptionId),
    ]
);

// Metric harian per platform untuk TikTok/Shopee (input manual/CSV oleh advertiser).
// Meta TIDAK lewat tabel ini — tetap dari fb_act_daily_data dkk.
export const platformDailyMetrics = mysqlTable(
    'platform_daily_metrics',
    {
        id: int('id').autoincrement().primaryKey(),
        subscriptionId: int('subscription_id')
            .notNull()
            .references(() => subscriptions.id, { onDelete: 'cascade' }),
        platform: varchar('platform', { length: 32 }).notNull(), // tiktok | shopee | meta
        date: date('date', { mode: 'string' }).notNull(),
        spend: decimal('spend', { precision: 20, scale: 2 }),
        revenue: decimal('revenue', { precision: 20, scale: 2 }),
        orders: int('orders'),
        clicks: int('clicks'),
        impressions: int('impressions'),
        note: varchar('note', { length: 500 }),
        source: varchar('source', { length: 16 }).notNull().default('manual'), // manual | csv | api
        createdAt: timestamp('created_at').defaultNow().notNull(),
        updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
    },
    (table) => [
        uniqueIndex('platform_daily_metrics_unique').on(
            table.subscriptionId,
            table.platform,
            table.date
        ),
        index('platform_daily_metrics_sub_date_idx').on(table.subscriptionId, table.date),
    ]
);

export const clientUpdateRelations = relations(clientUpdates, ({ one, many }) => ({
    customer: one(customers, { fields: [clientUpdates.customerId], references: [customers.id] }),
    subscription: one(subscriptions, {
        fields: [clientUpdates.subscriptionId],
        references: [subscriptions.id],
    }),
    author: one(users, { fields: [clientUpdates.authorUserId], references: [users.id] }),
    reads: many(clientUpdateReads),
}));

export const clientUpdateReadRelations = relations(clientUpdateReads, ({ one }) => ({
    update: one(clientUpdates, {
        fields: [clientUpdateReads.updateId],
        references: [clientUpdates.id],
    }),
}));

export const assetRequestRelations = relations(assetRequests, ({ one }) => ({
    customer: one(customers, { fields: [assetRequests.customerId], references: [customers.id] }),
    subscription: one(subscriptions, {
        fields: [assetRequests.subscriptionId],
        references: [subscriptions.id],
    }),
    requester: one(users, { fields: [assetRequests.requestedBy], references: [users.id] }),
}));

export const platformDailyMetricRelations = relations(platformDailyMetrics, ({ one }) => ({
    subscription: one(subscriptions, {
        fields: [platformDailyMetrics.subscriptionId],
        references: [subscriptions.id],
    }),
}));

// ─── Request Video AI ────────────────────────────────────────────────
// Pustaka produk & talent reusable milik client + antrian permintaan video AI.
// Kuota 50 video/bulan PER BRAND (subscription). Prompt 4-flow di-snapshot saat submit.

export type VideoAudience = {
    ageRanges?: string[];
    gender?: string;
    location?: string;
    notes?: string;
} | null;

export type VideoTalentBrief = {
    gender?: string;
    age?: number | string;
    setting?: string;
} | null;

export type VideoPromptSet = {
    flow1: string;
    flow2: string;
    flow3: string;
    flow4: string;
} | null;

export const clientProducts = mysqlTable(
    'client_products',
    {
        id: int('id').autoincrement().primaryKey(),
        customerId: int('customer_id')
            .notNull()
            .references(() => customers.id, { onDelete: 'cascade' }),
        name: varchar('name', { length: 255 }).notNull(),
        primaryPhotoUrl: varchar('primary_photo_url', { length: 512 }).notNull(),
        galleryJson: json('gallery_json').$type<string[]>(),
        description: text('description'),
        benefits: text('benefits'),
        archived: tinyint('archived').default(0).notNull(),
        createdAt: timestamp('created_at').defaultNow().notNull(),
        updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
    },
    (table) => [index('client_products_customer_idx').on(table.customerId)]
);

export const clientTalents = mysqlTable(
    'client_talents',
    {
        id: int('id').autoincrement().primaryKey(),
        customerId: int('customer_id')
            .notNull()
            .references(() => customers.id, { onDelete: 'cascade' }),
        name: varchar('name', { length: 255 }),
        photoUrl: varchar('photo_url', { length: 512 }).notNull(),
        note: varchar('note', { length: 512 }),
        archived: tinyint('archived').default(0).notNull(),
        createdAt: timestamp('created_at').defaultNow().notNull(),
        updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
    },
    (table) => [index('client_talents_customer_idx').on(table.customerId)]
);

// status: submitted | processing | delivered | cancelled
export const videoRequests = mysqlTable(
    'video_requests',
    {
        id: int('id').autoincrement().primaryKey(),
        customerId: int('customer_id')
            .notNull()
            .references(() => customers.id, { onDelete: 'cascade' }),
        subscriptionId: int('subscription_id')
            .notNull()
            .references(() => subscriptions.id, { onDelete: 'cascade' }),
        productId: int('product_id')
            .notNull()
            .references(() => clientProducts.id, { onDelete: 'cascade' }),
        talentId: int('talent_id').references(() => clientTalents.id, { onDelete: 'set null' }),
        talentBriefJson: json('talent_brief_json').$type<VideoTalentBrief>(),
        description: text('description'),
        benefits: text('benefits'),
        audienceJson: json('audience_json').$type<VideoAudience>(),
        contentStyle: varchar('content_style', { length: 40 }).default('grwm').notNull(),
        platform: varchar('platform', { length: 40 }).default('tiktok').notNull(),
        requestedCount: int('requested_count').notNull(),
        status: varchar('status', { length: 20 }).default('submitted').notNull(),
        promptsJson: json('prompts_json').$type<VideoPromptSet>(),
        deliveredUrls: json('delivered_urls').$type<string[]>(),
        adminNote: text('admin_note'),
        processedBy: int('processed_by').references(() => users.id, { onDelete: 'set null' }),
        deliveredAt: timestamp('delivered_at'),
        createdAt: timestamp('created_at').defaultNow().notNull(),
        updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
    },
    (table) => [
        index('video_requests_subscription_idx').on(table.subscriptionId, table.createdAt),
        index('video_requests_customer_idx').on(table.customerId),
        index('video_requests_status_idx').on(table.status),
    ]
);

export const clientProductRelations = relations(clientProducts, ({ one, many }) => ({
    customer: one(customers, { fields: [clientProducts.customerId], references: [customers.id] }),
    requests: many(videoRequests),
}));

export const clientTalentRelations = relations(clientTalents, ({ one, many }) => ({
    customer: one(customers, { fields: [clientTalents.customerId], references: [customers.id] }),
    requests: many(videoRequests),
}));

export const videoRequestRelations = relations(videoRequests, ({ one }) => ({
    customer: one(customers, { fields: [videoRequests.customerId], references: [customers.id] }),
    subscription: one(subscriptions, {
        fields: [videoRequests.subscriptionId],
        references: [subscriptions.id],
    }),
    product: one(clientProducts, {
        fields: [videoRequests.productId],
        references: [clientProducts.id],
    }),
    talent: one(clientTalents, { fields: [videoRequests.talentId], references: [clientTalents.id] }),
    processor: one(users, { fields: [videoRequests.processedBy], references: [users.id] }),
}));

// ============================================================
// HR — Master Organisasi (single-tenant: business_id dibuang)
// ============================================================

export const branches = mysqlTable(
    'branches',
    {
        id: int('id').autoincrement().primaryKey(),
        name: varchar('name', { length: 191 }).notNull(),
        code: varchar('code', { length: 64 }),
        address: text('address'),
        latitude: decimal('latitude', { precision: 10, scale: 7 }),
        longitude: decimal('longitude', { precision: 10, scale: 7 }),
        radius: int('radius'),
        status: tinyint('status').notNull().default(0),
        createdAt: timestamp('created_at').defaultNow().notNull(),
        updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
    },
    (table) => [uniqueIndex('branches_code_unique').on(table.code)]
);

export const departments = mysqlTable(
    'departments',
    {
        id: int('id').autoincrement().primaryKey(),
        name: varchar('name', { length: 191 }).notNull(),
        code: varchar('code', { length: 64 }),
        parentId: int('parent_id'),
        headEmployeeId: int('head_employee_id'),
        createdAt: timestamp('created_at').defaultNow().notNull(),
        updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
    },
    (table) => [index('departments_parent_idx').on(table.parentId)]
);

export const positions = mysqlTable(
    'positions',
    {
        id: int('id').autoincrement().primaryKey(),
        departmentId: int('department_id').references(() => departments.id, {
            onDelete: 'set null',
        }),
        name: varchar('name', { length: 191 }).notNull(),
        level: tinyint('level'),
        createdAt: timestamp('created_at').defaultNow().notNull(),
        updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
    },
    (table) => [index('positions_department_idx').on(table.departmentId)]
);

// ============================================================
// HR — Karyawan
// ============================================================

export const employees = mysqlTable(
    'employees',
    {
        id: int('id').autoincrement().primaryKey(),
        userId: int('user_id').references(() => users.id, { onDelete: 'set null' }),
        branchId: int('branch_id').references(() => branches.id, { onDelete: 'set null' }),
        departmentId: int('department_id').references(() => departments.id, {
            onDelete: 'set null',
        }),
        positionId: int('position_id').references(() => positions.id, { onDelete: 'set null' }),
        nik: varchar('nik', { length: 64 }),
        nikKtp: varchar('nik_ktp', { length: 32 }),
        fullName: varchar('full_name', { length: 191 }).notNull(),
        nickname: varchar('nickname', { length: 100 }),
        gender: tinyint('gender'),
        birthPlace: varchar('birth_place', { length: 100 }),
        birthDate: date('birth_date', { mode: 'string' }),
        religion: tinyint('religion'),
        maritalStatus: tinyint('marital_status'),
        bloodType: tinyint('blood_type'),
        address: text('address'),
        phone: varchar('phone', { length: 32 }),
        email: varchar('email', { length: 191 }),
        photo: varchar('photo', { length: 500 }),
        joinDate: date('join_date', { mode: 'string' }),
        resignDate: date('resign_date', { mode: 'string' }),
        employmentType: tinyint('employment_type'),
        employmentStatus: tinyint('employment_status').notNull().default(0),
        npwp: varchar('npwp', { length: 32 }),
        bpjsKesehatanNo: varchar('bpjs_kesehatan_no', { length: 64 }),
        bpjsKetenagakerjaanNo: varchar('bpjs_ketenagakerjaan_no', { length: 64 }),
        citizenship: tinyint('citizenship'),
        identityType: tinyint('identity_type'),
        landlinePhone: varchar('landline_phone', { length: 32 }),
        residentialAddress: text('residential_address'),
        taxStatusCode: tinyint('tax_status_code'),
        taxWithholderNpwp: varchar('tax_withholder_npwp', { length: 32 }),
        taxWithholderName: varchar('tax_withholder_name', { length: 191 }),
        defaultWorkScheduleId: int('default_work_schedule_id'),
        createdAt: timestamp('created_at').defaultNow().notNull(),
        updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
    },
    (table) => [
        index('employees_user_idx').on(table.userId),
        index('employees_branch_idx').on(table.branchId),
        index('employees_department_idx').on(table.departmentId),
        uniqueIndex('employees_nik_unique').on(table.nik),
    ]
);

export const employeeFamilies = mysqlTable(
    'employee_families',
    {
        id: int('id').autoincrement().primaryKey(),
        employeeId: int('employee_id')
            .notNull()
            .references(() => employees.id, { onDelete: 'cascade' }),
        name: varchar('name', { length: 191 }).notNull(),
        relationship: tinyint('relationship').notNull(),
        gender: tinyint('gender'),
        birthDate: date('birth_date', { mode: 'string' }),
        nikKtp: varchar('nik_ktp', { length: 32 }),
        isDependent: tinyint('is_dependent').notNull().default(0),
        createdAt: timestamp('created_at').defaultNow().notNull(),
        updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
    },
    (table) => [index('employee_families_employee_idx').on(table.employeeId)]
);

export const employeeDocuments = mysqlTable(
    'employee_documents',
    {
        id: int('id').autoincrement().primaryKey(),
        employeeId: int('employee_id')
            .notNull()
            .references(() => employees.id, { onDelete: 'cascade' }),
        documentType: tinyint('document_type').notNull(),
        documentNumber: varchar('document_number', { length: 100 }),
        fileUrl: varchar('file_url', { length: 500 }),
        expiredAt: date('expired_at', { mode: 'string' }),
        createdAt: timestamp('created_at').defaultNow().notNull(),
        updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
    },
    (table) => [index('employee_documents_employee_idx').on(table.employeeId)]
);

export const employeeEducations = mysqlTable(
    'employee_educations',
    {
        id: int('id').autoincrement().primaryKey(),
        employeeId: int('employee_id')
            .notNull()
            .references(() => employees.id, { onDelete: 'cascade' }),
        level: tinyint('level'),
        institution: varchar('institution', { length: 191 }),
        major: varchar('major', { length: 191 }),
        startYear: int('start_year'),
        endYear: int('end_year'),
        gpa: decimal('gpa', { precision: 4, scale: 2 }),
    },
    (table) => [index('employee_educations_employee_idx').on(table.employeeId)]
);

export const employeeExperiences = mysqlTable(
    'employee_experiences',
    {
        id: int('id').autoincrement().primaryKey(),
        employeeId: int('employee_id')
            .notNull()
            .references(() => employees.id, { onDelete: 'cascade' }),
        companyName: varchar('company_name', { length: 191 }),
        position: varchar('position', { length: 191 }),
        startDate: date('start_date', { mode: 'string' }),
        endDate: date('end_date', { mode: 'string' }),
        description: text('description'),
    },
    (table) => [index('employee_experiences_employee_idx').on(table.employeeId)]
);

export const employeeEmergencyContacts = mysqlTable(
    'employee_emergency_contacts',
    {
        id: int('id').autoincrement().primaryKey(),
        employeeId: int('employee_id')
            .notNull()
            .references(() => employees.id, { onDelete: 'cascade' }),
        name: varchar('name', { length: 191 }).notNull(),
        relationship: varchar('relationship', { length: 64 }),
        phone: varchar('phone', { length: 32 }),
        address: text('address'),
    },
    (table) => [index('employee_emergency_contacts_employee_idx').on(table.employeeId)]
);

export const employeeBankAccounts = mysqlTable(
    'employee_bank_accounts',
    {
        id: int('id').autoincrement().primaryKey(),
        employeeId: int('employee_id')
            .notNull()
            .references(() => employees.id, { onDelete: 'cascade' }),
        bankName: varchar('bank_name', { length: 100 }).notNull(),
        accountNumber: varchar('account_number', { length: 64 }).notNull(),
        accountHolder: varchar('account_holder', { length: 191 }).notNull(),
        isPrimary: tinyint('is_primary').notNull().default(0),
    },
    (table) => [index('employee_bank_accounts_employee_idx').on(table.employeeId)]
);

// ============================================================
// HR — Presensi
// ============================================================

export const holidays = mysqlTable(
    'holidays',
    {
        id: int('id').autoincrement().primaryKey(),
        date: date('date', { mode: 'string' }).notNull(),
        name: varchar('name', { length: 191 }).notNull(),
        type: tinyint('type').notNull().default(0),
        isRecurring: tinyint('is_recurring').notNull().default(0),
        notes: text('notes'),
        createdAt: timestamp('created_at').defaultNow().notNull(),
        updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
    },
    (table) => [
        index('holidays_date_idx').on(table.date),
        uniqueIndex('holidays_date_name_unique').on(table.date, table.name),
    ]
);

export const workSchedules = mysqlTable(
    'work_schedules',
    {
        id: int('id').autoincrement().primaryKey(),
        name: varchar('name', { length: 191 }).notNull(),
        type: tinyint('type').notNull().default(0),
        startTime: time('start_time'),
        endTime: time('end_time'),
        breakDuration: int('break_duration'),
        lateTolerance: int('late_tolerance'),
        earlyLeaveTolerance: int('early_leave_tolerance'),
        workingDays: json('working_days').$type<JsonRecord>(),
        createdAt: timestamp('created_at').defaultNow().notNull(),
        updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
    },
    (table) => []
);

export const employeeSchedules = mysqlTable(
    'employee_schedules',
    {
        id: int('id').autoincrement().primaryKey(),
        employeeId: int('employee_id')
            .notNull()
            .references(() => employees.id, { onDelete: 'cascade' }),
        workScheduleId: int('work_schedule_id')
            .notNull()
            .references(() => workSchedules.id, { onDelete: 'cascade' }),
        date: date('date', { mode: 'string' }).notNull(),
        createdAt: timestamp('created_at').defaultNow().notNull(),
        updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
    },
    (table) => [
        index('employee_schedules_employee_idx').on(table.employeeId),
        uniqueIndex('employee_schedules_employee_date_unique').on(table.employeeId, table.date),
    ]
);

export const attendances = mysqlTable(
    'attendances',
    {
        id: int('id').autoincrement().primaryKey(),
        employeeId: int('employee_id')
            .notNull()
            .references(() => employees.id, { onDelete: 'cascade' }),
        workScheduleId: int('work_schedule_id').references(() => workSchedules.id, {
            onDelete: 'set null',
        }),
        date: date('date', { mode: 'string' }).notNull(),
        checkInAt: timestamp('check_in_at'),
        checkOutAt: timestamp('check_out_at'),
        checkInLatitude: decimal('check_in_latitude', { precision: 10, scale: 7 }),
        checkInLongitude: decimal('check_in_longitude', { precision: 10, scale: 7 }),
        checkOutLatitude: decimal('check_out_latitude', { precision: 10, scale: 7 }),
        checkOutLongitude: decimal('check_out_longitude', { precision: 10, scale: 7 }),
        checkInPhoto: varchar('check_in_photo', { length: 500 }),
        checkOutPhoto: varchar('check_out_photo', { length: 500 }),
        checkInAddress: text('check_in_address'),
        checkOutAddress: text('check_out_address'),
        checkInType: tinyint('check_in_type'),
        checkOutType: tinyint('check_out_type'),
        lateMinutes: int('late_minutes').default(0),
        earlyLeaveMinutes: int('early_leave_minutes').default(0),
        overtimeMinutes: int('overtime_minutes').default(0),
        workMinutes: int('work_minutes').default(0),
        status: tinyint('status').notNull().default(0),
        notes: text('notes'),
        createdAt: timestamp('created_at').defaultNow().notNull(),
        updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
    },
    (table) => [
        index('attendances_employee_idx').on(table.employeeId),
        uniqueIndex('attendances_employee_date_unique').on(table.employeeId, table.date),
    ]
);

export const attendanceApprovals = mysqlTable(
    'attendance_approvals',
    {
        id: int('id').autoincrement().primaryKey(),
        attendanceId: int('attendance_id').references(() => attendances.id, {
            onDelete: 'set null',
        }),
        employeeId: int('employee_id')
            .notNull()
            .references(() => employees.id, { onDelete: 'cascade' }),
        requestType: tinyint('request_type').notNull(),
        requestedCheckIn: timestamp('requested_check_in'),
        requestedCheckOut: timestamp('requested_check_out'),
        reason: text('reason'),
        attachment: varchar('attachment', { length: 500 }),
        status: tinyint('status').notNull().default(0),
        approverId: int('approver_id').references(() => users.id, { onDelete: 'set null' }),
        approvedAt: timestamp('approved_at'),
        rejectionReason: text('rejection_reason'),
        createdAt: timestamp('created_at').defaultNow().notNull(),
        updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
    },
    (table) => [index('attendance_approvals_employee_idx').on(table.employeeId)]
);

// ============================================================
// HR — Cuti
// ============================================================

export const leaveTypes = mysqlTable(
    'leave_types',
    {
        id: int('id').autoincrement().primaryKey(),
        name: varchar('name', { length: 191 }).notNull(),
        code: varchar('code', { length: 64 }),
        maxDaysPerYear: int('max_days_per_year'),
        isPaid: tinyint('is_paid').notNull().default(1),
        requiresAttachment: tinyint('requires_attachment').notNull().default(0),
        gender: tinyint('gender').notNull().default(0),
        createdAt: timestamp('created_at').defaultNow().notNull(),
        updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
    },
    (table) => []
);

export const leaves = mysqlTable(
    'leaves',
    {
        id: int('id').autoincrement().primaryKey(),
        employeeId: int('employee_id')
            .notNull()
            .references(() => employees.id, { onDelete: 'cascade' }),
        leaveTypeId: int('leave_type_id')
            .notNull()
            .references(() => leaveTypes.id, { onDelete: 'restrict' }),
        startDate: date('start_date', { mode: 'string' }).notNull(),
        endDate: date('end_date', { mode: 'string' }).notNull(),
        totalDays: decimal('total_days', { precision: 5, scale: 2 }),
        reason: text('reason'),
        attachment: varchar('attachment', { length: 500 }),
        status: tinyint('status').notNull().default(0),
        approverId: int('approver_id').references(() => users.id, { onDelete: 'set null' }),
        approvedAt: timestamp('approved_at'),
        rejectionReason: text('rejection_reason'),
        createdAt: timestamp('created_at').defaultNow().notNull(),
        updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
    },
    (table) => [index('leaves_employee_idx').on(table.employeeId)]
);

export const leaveBalances = mysqlTable(
    'leave_balances',
    {
        id: int('id').autoincrement().primaryKey(),
        employeeId: int('employee_id')
            .notNull()
            .references(() => employees.id, { onDelete: 'cascade' }),
        leaveTypeId: int('leave_type_id')
            .notNull()
            .references(() => leaveTypes.id, { onDelete: 'cascade' }),
        year: int('year').notNull(),
        totalQuota: decimal('total_quota', { precision: 5, scale: 2 }).default('0'),
        used: decimal('used', { precision: 5, scale: 2 }).default('0'),
        remaining: decimal('remaining', { precision: 5, scale: 2 }).default('0'),
        createdAt: timestamp('created_at').defaultNow().notNull(),
        updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
    },
    (table) => [
        uniqueIndex('leave_balances_unique').on(table.employeeId, table.leaveTypeId, table.year),
    ]
);

// ============================================================
// HR — Approval Workflow (generik, polimorfik via module + reference_id)
// ============================================================

export const approvalWorkflows = mysqlTable(
    'approval_workflows',
    {
        id: int('id').autoincrement().primaryKey(),
        name: varchar('name', { length: 191 }).notNull(),
        module: tinyint('module').notNull(),
        createdAt: timestamp('created_at').defaultNow().notNull(),
        updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
    },
    (table) => []
);

export const approvalWorkflowSteps = mysqlTable(
    'approval_workflow_steps',
    {
        id: int('id').autoincrement().primaryKey(),
        approvalWorkflowId: int('workflow_id')
            .notNull()
            .references(() => approvalWorkflows.id, { onDelete: 'cascade' }),
        stepOrder: int('step_order').notNull(),
        approverType: tinyint('approver_type').notNull(),
        approverId: int('approver_id').references(() => users.id, { onDelete: 'set null' }),
        role: tinyint('role'),
    },
    (table) => [index('approval_workflow_steps_workflow_idx').on(table.approvalWorkflowId)]
);

export const approvals = mysqlTable(
    'approvals',
    {
        id: int('id').autoincrement().primaryKey(),
        module: tinyint('module').notNull(),
        referenceId: int('reference_id').notNull(),
        stepOrder: int('step_order').notNull(),
        approverId: int('approver_id').references(() => users.id, { onDelete: 'set null' }),
        status: tinyint('status').notNull().default(0),
        notes: text('notes'),
        approvedAt: timestamp('approved_at'),
        createdAt: timestamp('created_at').defaultNow().notNull(),
        updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
    },
    (table) => [index('approvals_module_ref_idx').on(table.module, table.referenceId)]
);

// ============================================================
// HR Fase 5 — Payroll / Kompensasi (single-tenant, tanpa business_id)
// ============================================================

export const payrollPeriods = mysqlTable(
    'payroll_periods',
    {
        id: int('id').autoincrement().primaryKey(),
        periodMonth: tinyint('period_month').notNull(),
        periodYear: int('period_year').notNull(),
        startDate: date('start_date', { mode: 'string' }).notNull(),
        endDate: date('end_date', { mode: 'string' }).notNull(),
        paymentDate: date('payment_date', { mode: 'string' }),
        status: tinyint('status').notNull().default(0),
        createdBy: int('created_by').references(() => users.id, {
            onDelete: 'set null',
        }),
        approvedBy: int('approved_by').references(() => users.id, {
            onDelete: 'set null',
        }),
        createdAt: timestamp('created_at').defaultNow().notNull(),
        updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
    },
    (table) => [
        uniqueIndex('payroll_periods_unique').on(table.periodYear, table.periodMonth),
    ]
);

export const payrolls = mysqlTable(
    'payrolls',
    {
        id: int('id').autoincrement().primaryKey(),
        payrollPeriodId: int('payroll_period_id')
            .notNull()
            .references(() => payrollPeriods.id, { onDelete: 'cascade' }),
        employeeId: int('employee_id')
            .notNull()
            .references(() => employees.id, { onDelete: 'restrict' }),
        basicSalary: decimal('basic_salary', { precision: 15, scale: 2 }).default('0'),
        totalAllowance: decimal('total_allowance', { precision: 15, scale: 2 }).default('0'),
        totalOvertime: decimal('total_overtime', { precision: 15, scale: 2 }).default('0'),
        totalBonus: decimal('total_bonus', { precision: 15, scale: 2 }).default('0'),
        totalDeduction: decimal('total_deduction', { precision: 15, scale: 2 }).default('0'),
        totalTax: decimal('total_tax', { precision: 15, scale: 2 }).default('0'),
        totalBpjs: decimal('total_bpjs', { precision: 15, scale: 2 }).default('0'),
        grossSalary: decimal('gross_salary', { precision: 15, scale: 2 }).default('0'),
        netSalary: decimal('net_salary', { precision: 15, scale: 2 }).default('0'),
        status: tinyint('status').notNull().default(0),
        paidAt: timestamp('paid_at'),
        paymentMethod: tinyint('payment_method'),
        notes: text('notes'),
        createdAt: timestamp('created_at').defaultNow().notNull(),
        updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
    },
    (table) => [
        index('payrolls_period_idx').on(table.payrollPeriodId),
        uniqueIndex('payrolls_period_employee_unique').on(
            table.payrollPeriodId,
            table.employeeId
        ),
    ]
);

export const payrollComponents = mysqlTable(
    'payroll_components',
    {
        id: int('id').autoincrement().primaryKey(),
        payrollId: int('payroll_id')
            .notNull()
            .references(() => payrolls.id, { onDelete: 'cascade' }),
        componentType: tinyint('component_type').notNull(),
        category: tinyint('category').notNull(),
        name: varchar('name', { length: 191 }).notNull(),
        amount: decimal('amount', { precision: 15, scale: 2 }).notNull().default('0'),
        notes: text('notes'),
    },
    (table) => [index('payroll_components_payroll_idx').on(table.payrollId)]
);

export const salaryStructures = mysqlTable(
    'salary_structures',
    {
        id: int('id').autoincrement().primaryKey(),
        employeeId: int('employee_id')
            .notNull()
            .references(() => employees.id, { onDelete: 'cascade' }),
        basicSalary: decimal('basic_salary', { precision: 15, scale: 2 }).notNull(),
        effectiveDate: date('effective_date', { mode: 'string' }).notNull(),
        endDate: date('end_date', { mode: 'string' }),
        createdAt: timestamp('created_at').defaultNow().notNull(),
        updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
    },
    (table) => [index('salary_structures_employee_idx').on(table.employeeId)]
);

export const allowances = mysqlTable(
    'allowances',
    {
        id: int('id').autoincrement().primaryKey(),
        name: varchar('name', { length: 191 }).notNull(),
        type: tinyint('type').notNull().default(0),
        amount: decimal('amount', { precision: 15, scale: 2 }).default('0'),
        isTaxable: tinyint('is_taxable').notNull().default(1),
        createdAt: timestamp('created_at').defaultNow().notNull(),
        updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
    },
    (table) => []
);

export const employeeAllowances = mysqlTable(
    'employee_allowances',
    {
        id: int('id').autoincrement().primaryKey(),
        employeeId: int('employee_id')
            .notNull()
            .references(() => employees.id, { onDelete: 'cascade' }),
        allowanceId: int('allowance_id')
            .notNull()
            .references(() => allowances.id, { onDelete: 'restrict' }),
        amount: decimal('amount', { precision: 15, scale: 2 }).notNull(),
        effectiveDate: date('effective_date', { mode: 'string' }).notNull(),
        endDate: date('end_date', { mode: 'string' }),
    },
    (table) => [
        index('employee_allowances_employee_idx').on(table.employeeId),
        index('employee_allowances_allowance_idx').on(table.allowanceId),
    ]
);

export const overtimes = mysqlTable(
    'overtimes',
    {
        id: int('id').autoincrement().primaryKey(),
        employeeId: int('employee_id')
            .notNull()
            .references(() => employees.id, { onDelete: 'cascade' }),
        date: date('date', { mode: 'string' }).notNull(),
        startTime: time('start_time'),
        endTime: time('end_time'),
        totalHours: decimal('total_hours', { precision: 5, scale: 2 }),
        reason: text('reason'),
        amount: decimal('amount', { precision: 15, scale: 2 }).default('0'),
        status: tinyint('status').notNull().default(0),
        approverId: int('approver_id').references(() => users.id, {
            onDelete: 'set null',
        }),
        approvedAt: timestamp('approved_at'),
        createdAt: timestamp('created_at').defaultNow().notNull(),
        updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
    },
    (table) => [index('overtimes_employee_idx').on(table.employeeId)]
);

export const cashAdvances = mysqlTable(
    'cash_advances',
    {
        id: int('id').autoincrement().primaryKey(),
        employeeId: int('employee_id')
            .notNull()
            .references(() => employees.id, { onDelete: 'cascade' }),
        amount: decimal('amount', { precision: 15, scale: 2 }).notNull(),
        reason: text('reason'),
        requestDate: date('request_date', { mode: 'string' }).notNull(),
        repaymentMethod: tinyint('repayment_method').notNull().default(0),
        installmentCount: int('installment_count'),
        installmentAmount: decimal('installment_amount', { precision: 15, scale: 2 }),
        status: tinyint('status').notNull().default(0),
        approverId: int('approver_id').references(() => users.id, {
            onDelete: 'set null',
        }),
        approvedAt: timestamp('approved_at'),
        disbursedAt: timestamp('disbursed_at'),
        createdAt: timestamp('created_at').defaultNow().notNull(),
        updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
    },
    (table) => [index('cash_advances_employee_idx').on(table.employeeId)]
);

export const cashAdvanceRepayments = mysqlTable(
    'cash_advance_repayments',
    {
        id: int('id').autoincrement().primaryKey(),
        cashAdvanceId: int('cash_advance_id')
            .notNull()
            .references(() => cashAdvances.id, { onDelete: 'cascade' }),
        payrollId: int('payroll_id').references(() => payrolls.id, {
            onDelete: 'set null',
        }),
        amount: decimal('amount', { precision: 15, scale: 2 }).notNull(),
        paidAt: timestamp('paid_at'),
    },
    (table) => [
        index('cash_advance_repayments_advance_idx').on(table.cashAdvanceId),
        index('cash_advance_repayments_payroll_idx').on(table.payrollId),
    ]
);

export const reimbursements = mysqlTable(
    'reimbursements',
    {
        id: int('id').autoincrement().primaryKey(),
        employeeId: int('employee_id')
            .notNull()
            .references(() => employees.id, { onDelete: 'cascade' }),
        category: tinyint('category').notNull(),
        title: varchar('title', { length: 255 }).notNull(),
        amount: decimal('amount', { precision: 15, scale: 2 }).notNull(),
        transactionDate: date('transaction_date', { mode: 'string' }).notNull(),
        description: text('description'),
        attachment: varchar('attachment', { length: 500 }),
        status: tinyint('status').notNull().default(0),
        approverId: int('approver_id').references(() => users.id, {
            onDelete: 'set null',
        }),
        approvedAt: timestamp('approved_at'),
        paidAt: timestamp('paid_at'),
        paymentMethod: tinyint('payment_method'),
        rejectionReason: text('rejection_reason'),
        createdAt: timestamp('created_at').defaultNow().notNull(),
        updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
    },
    (table) => [index('reimbursements_employee_idx').on(table.employeeId)]
);

// ============================================================
// HR Fase 5 — Pengaturan Payroll
// ============================================================

export const payrollSettings = mysqlTable(
    'payroll_settings',
    {
        id: int('id').autoincrement().primaryKey(),
        payrollCutoffDate: tinyint('payroll_cutoff_date'),
        paymentDate: tinyint('payment_date'),
        roundingType: tinyint('rounding_type').notNull().default(0),
        roundingValue: int('rounding_value').default(1),
        createdAt: timestamp('created_at').defaultNow().notNull(),
        updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
    },
    (table) => []
);

export const payslipSettings = mysqlTable(
    'payslip_settings',
    {
        id: int('id').autoincrement().primaryKey(),
        showCompanyLogo: tinyint('show_company_logo').notNull().default(1),
        showSignature: tinyint('show_signature').notNull().default(0),
        signatureName: varchar('signature_name', { length: 191 }),
        signaturePosition: varchar('signature_position', { length: 191 }),
        footerNote: text('footer_note'),
        createdAt: timestamp('created_at').defaultNow().notNull(),
        updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
    },
    (table) => []
);

export const overtimeSettings = mysqlTable(
    'overtime_settings',
    {
        id: int('id').autoincrement().primaryKey(),
        calculationMethod: tinyint('calculation_method').notNull().default(0),
        hourlyRateFormula: varchar('hourly_rate_formula', { length: 255 }),
        weekdayMultiplier: json('weekday_multiplier').$type<JsonRecord>(),
        weekendMultiplier: json('weekend_multiplier').$type<JsonRecord>(),
        holidayMultiplier: json('holiday_multiplier').$type<JsonRecord>(),
        minOvertimeMinutes: int('min_overtime_minutes').default(30),
        maxOvertimeHoursPerDay: int('max_overtime_hours_per_day').default(4),
        createdAt: timestamp('created_at').defaultNow().notNull(),
        updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
    },
    (table) => []
);

export const prorateSettings = mysqlTable(
    'prorate_settings',
    {
        id: int('id').autoincrement().primaryKey(),
        calculationBasis: tinyint('calculation_basis').notNull().default(0),
        applyTo: tinyint('apply_to').notNull().default(0),
        createdAt: timestamp('created_at').defaultNow().notNull(),
        updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
    },
    (table) => []
);

export const taxSettings = mysqlTable(
    'tax_settings',
    {
        id: int('id').autoincrement().primaryKey(),
        calculationMethod: tinyint('calculation_method').notNull().default(0),
        terEnabled: tinyint('ter_enabled').notNull().default(1),
        createdAt: timestamp('created_at').defaultNow().notNull(),
        updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
    },
    (table) => []
);

export const taxBrackets = mysqlTable(
    'tax_brackets',
    {
        id: int('id').autoincrement().primaryKey(),
        minIncome: decimal('min_income', { precision: 15, scale: 2 }).notNull(),
        maxIncome: decimal('max_income', { precision: 15, scale: 2 }),
        rate: decimal('rate', { precision: 5, scale: 2 }).notNull(),
        effectiveYear: int('effective_year').notNull(),
        createdAt: timestamp('created_at').defaultNow().notNull(),
    },
    (table) => [index('tax_brackets_year_idx').on(table.effectiveYear)]
);

export const ptkpSettings = mysqlTable(
    'ptkp_settings',
    {
        id: int('id').autoincrement().primaryKey(),
        code: tinyint('code').notNull(),
        amount: decimal('amount', { precision: 15, scale: 2 }).notNull(),
        effectiveYear: int('effective_year').notNull(),
    },
    (table) => [
        uniqueIndex('ptkp_settings_year_code_unique').on(table.effectiveYear, table.code),
    ]
);

export const bpjsSettings = mysqlTable(
    'bpjs_settings',
    {
        id: int('id').autoincrement().primaryKey(),
        bpjsType: tinyint('bpjs_type').notNull(),
        employerRate: decimal('employer_rate', { precision: 5, scale: 2 }).default('0'),
        employeeRate: decimal('employee_rate', { precision: 5, scale: 2 }).default('0'),
        salaryCap: decimal('salary_cap', { precision: 15, scale: 2 }),
        jkkRiskLevel: tinyint('jkk_risk_level'),
        effectiveDate: date('effective_date', { mode: 'string' }).notNull(),
        createdAt: timestamp('created_at').defaultNow().notNull(),
        updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
    },
    (table) => [index('bpjs_settings_type_idx').on(table.bpjsType)]
);

export const roundingSettings = mysqlTable(
    'rounding_settings',
    {
        id: int('id').autoincrement().primaryKey(),
        target: tinyint('target').notNull(),
        roundingType: tinyint('rounding_type').notNull().default(2),
        nominal: int('nominal').notNull().default(1),
        createdAt: timestamp('created_at').defaultNow().notNull(),
        updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
    },
    (table) => [uniqueIndex('rounding_settings_target_unique').on(table.target)]
);

export const payrollBpjsDetails = mysqlTable(
    'payroll_bpjs_details',
    {
        id: int('id').autoincrement().primaryKey(),
        payrollId: int('payroll_id')
            .notNull()
            .references(() => payrolls.id, { onDelete: 'cascade' }),
        employeeId: int('employee_id')
            .notNull()
            .references(() => employees.id, { onDelete: 'cascade' }),
        bpjsType: tinyint('bpjs_type').notNull(),
        bpjsNumber: varchar('bpjs_number', { length: 64 }),
        baseSalary: decimal('base_salary', { precision: 15, scale: 2 }).default('0'),
        employerAmount: decimal('employer_amount', { precision: 15, scale: 2 }).default('0'),
        employeeAmount: decimal('employee_amount', { precision: 15, scale: 2 }).default('0'),
        totalAmount: decimal('total_amount', { precision: 15, scale: 2 }).default('0'),
        createdAt: timestamp('created_at').defaultNow().notNull(),
    },
    (table) => [
        index('payroll_bpjs_details_payroll_idx').on(table.payrollId),
        index('payroll_bpjs_details_employee_idx').on(table.employeeId),
    ]
);

// ============================================================
// HR — Pengumuman, Audit, Notifikasi (dipakai portal ESS /me)
// ============================================================

export const announcements = mysqlTable(
    'announcements',
    {
        id: int('id').autoincrement().primaryKey(),
        title: varchar('title', { length: 255 }).notNull(),
        content: longtext('content'),
        category: tinyint('category').notNull().default(0),
        target: tinyint('target').notNull().default(0),
        targetIds: json('target_ids').$type<JsonRecord>(),
        attachment: varchar('attachment', { length: 500 }),
        publishedAt: timestamp('published_at'),
        expiredAt: timestamp('expired_at'),
        createdBy: int('created_by').references(() => users.id, { onDelete: 'set null' }),
        status: tinyint('status').notNull().default(0),
        createdAt: timestamp('created_at').defaultNow().notNull(),
        updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
    },
    (table) => []
);

export const announcementReads = mysqlTable(
    'announcement_reads',
    {
        id: int('id').autoincrement().primaryKey(),
        announcementId: int('announcement_id')
            .notNull()
            .references(() => announcements.id, { onDelete: 'cascade' }),
        employeeId: int('employee_id')
            .notNull()
            .references(() => employees.id, { onDelete: 'cascade' }),
        readAt: timestamp('read_at').defaultNow().notNull(),
    },
    (table) => [
        uniqueIndex('announcement_reads_unique').on(table.announcementId, table.employeeId),
    ]
);

export const activityLogs = mysqlTable(
    'activity_logs',
    {
        id: int('id').autoincrement().primaryKey(),
        userId: int('user_id').references(() => users.id, { onDelete: 'set null' }),
        action: tinyint('action').notNull(),
        module: varchar('module', { length: 64 }),
        referenceId: int('reference_id'),
        oldValue: json('old_value').$type<JsonRecord>(),
        newValue: json('new_value').$type<JsonRecord>(),
        ipAddress: varchar('ip_address', { length: 64 }),
        userAgent: varchar('user_agent', { length: 500 }),
        createdAt: timestamp('created_at').defaultNow().notNull(),
    },
    (table) => [
        index('activity_logs_user_idx').on(table.userId),
        index('activity_logs_module_ref_idx').on(table.module, table.referenceId),
    ]
);

export const notifications = mysqlTable(
    'notifications',
    {
        id: int('id').autoincrement().primaryKey(),
        userId: int('user_id')
            .notNull()
            .references(() => users.id, { onDelete: 'cascade' }),
        title: varchar('title', { length: 255 }).notNull(),
        message: text('message'),
        type: tinyint('type').notNull().default(0),
        module: varchar('module', { length: 64 }),
        referenceId: int('reference_id'),
        isRead: tinyint('is_read').notNull().default(0),
        readAt: timestamp('read_at'),
        createdAt: timestamp('created_at').defaultNow().notNull(),
    },
    (table) => [
        index('notifications_user_idx').on(table.userId),
        index('notifications_unread_idx').on(table.userId, table.isRead),
    ]
);

// ============================================================
// HR — Klien (Field / Sales, Fase 9)
// ============================================================

export const clients = mysqlTable(
    'clients',
    {
        id: int('id').autoincrement().primaryKey(),
        name: varchar('name', { length: 191 }).notNull(),
        code: varchar('code', { length: 64 }),
        contactPerson: varchar('contact_person', { length: 191 }),
        phone: varchar('phone', { length: 32 }),
        email: varchar('email', { length: 191 }),
        address: text('address'),
        latitude: decimal('latitude', { precision: 10, scale: 7 }),
        longitude: decimal('longitude', { precision: 10, scale: 7 }),
        category: tinyint('category'),
        picEmployeeId: int('pic_employee_id').references(() => employees.id, {
            onDelete: 'set null',
        }),
        notes: text('notes'),
        status: tinyint('status').notNull().default(0),
        createdAt: timestamp('created_at').defaultNow().notNull(),
        updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
    },
    (table) => []
);

export const clientVisits = mysqlTable(
    'client_visits',
    {
        id: int('id').autoincrement().primaryKey(),
        employeeId: int('employee_id')
            .notNull()
            .references(() => employees.id, { onDelete: 'cascade' }),
        clientId: int('client_id')
            .notNull()
            .references(() => clients.id, { onDelete: 'restrict' }),
        visitDate: date('visit_date', { mode: 'string' }).notNull(),
        checkInAt: timestamp('check_in_at'),
        checkOutAt: timestamp('check_out_at'),
        latitude: decimal('latitude', { precision: 10, scale: 7 }),
        longitude: decimal('longitude', { precision: 10, scale: 7 }),
        address: text('address'),
        photo: varchar('photo', { length: 500 }),
        purpose: varchar('purpose', { length: 255 }),
        notes: text('notes'),
        status: tinyint('status').notNull().default(0),
        createdAt: timestamp('created_at').defaultNow().notNull(),
        updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
    },
    (table) => [
        index('client_visits_employee_idx').on(table.employeeId),
        index('client_visits_client_idx').on(table.clientId),
    ]
);

// ============================================================
// HR — Pelacakan Lokasi (Fase 9)
// ============================================================

export const locationTracks = mysqlTable(
    'location_tracks',
    {
        id: int('id').autoincrement().primaryKey(),
        employeeId: int('employee_id')
            .notNull()
            .references(() => employees.id, { onDelete: 'cascade' }),
        latitude: decimal('latitude', { precision: 10, scale: 7 }).notNull(),
        longitude: decimal('longitude', { precision: 10, scale: 7 }).notNull(),
        accuracy: decimal('accuracy', { precision: 8, scale: 2 }),
        address: text('address'),
        batteryLevel: tinyint('battery_level'),
        isMockLocation: tinyint('is_mock_location').default(0),
        trackedAt: timestamp('tracked_at').notNull(),
        createdAt: timestamp('created_at').defaultNow().notNull(),
    },
    (table) => [
        index('location_tracks_employee_idx').on(table.employeeId),
        index('location_tracks_tracked_at_idx').on(table.trackedAt),
    ]
);

// ============================================================
// HR — Kas Kecil (Petty Cash, Fase 8)
// ============================================================

export const companyBankAccounts = mysqlTable(
    'company_bank_accounts',
    {
        id: int('id').autoincrement().primaryKey(),
        bankName: varchar('bank_name', { length: 100 }).notNull(),
        accountNumber: varchar('account_number', { length: 64 }).notNull(),
        accountHolder: varchar('account_holder', { length: 191 }).notNull(),
        branch: varchar('branch', { length: 100 }),
        isPrimary: tinyint('is_primary').notNull().default(0),
        createdAt: timestamp('created_at').defaultNow().notNull(),
        updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
    },
    (table) => []
);

export const pettyCash = mysqlTable(
    'petty_cash',
    {
        id: int('id').autoincrement().primaryKey(),
        branchId: int('branch_id').references(() => branches.id, {
            onDelete: 'set null',
        }),
        balance: decimal('balance', { precision: 15, scale: 2 }).notNull().default('0'),
        holderEmployeeId: int('holder_employee_id').references(() => employees.id, {
            onDelete: 'set null',
        }),
        createdAt: timestamp('created_at').defaultNow().notNull(),
        updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
    },
    (table) => []
);

export const pettyCashTransactions = mysqlTable(
    'petty_cash_transactions',
    {
        id: int('id').autoincrement().primaryKey(),
        pettyCashId: int('petty_cash_id')
            .notNull()
            .references(() => pettyCash.id, { onDelete: 'cascade' }),
        transactionType: tinyint('transaction_type').notNull(),
        category: tinyint('category').notNull(),
        amount: decimal('amount', { precision: 15, scale: 2 }).notNull(),
        description: text('description'),
        attachment: varchar('attachment', { length: 500 }),
        transactionDate: date('transaction_date', { mode: 'string' }).notNull(),
        createdBy: int('created_by').references(() => users.id, {
            onDelete: 'set null',
        }),
        createdAt: timestamp('created_at').defaultNow().notNull(),
        updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
    },
    (table) => [index('petty_cash_transactions_petty_cash_idx').on(table.pettyCashId)]
);

// ============================================================
// HR — THR & Tunjangan Cuti (Fase 8)
// ============================================================

export const thrSettings = mysqlTable(
    'thr_settings',
    {
        id: int('id').autoincrement().primaryKey(),
        calculationType: tinyint('calculation_type').notNull().default(0),
        minWorkingMonths: int('min_working_months').default(1),
        paymentBeforeHolidayDays: int('payment_before_holiday_days').default(7),
        createdAt: timestamp('created_at').defaultNow().notNull(),
        updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
    },
    (table) => []
);

export const thrDisbursements = mysqlTable(
    'thr_disbursements',
    {
        id: int('id').autoincrement().primaryKey(),
        employeeId: int('employee_id')
            .notNull()
            .references(() => employees.id, { onDelete: 'cascade' }),
        year: int('year').notNull(),
        amount: decimal('amount', { precision: 15, scale: 2 }).notNull(),
        religionHoliday: tinyint('religion_holiday').notNull(),
        paidAt: timestamp('paid_at'),
        status: tinyint('status').notNull().default(0),
        createdAt: timestamp('created_at').defaultNow().notNull(),
        updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
    },
    (table) => [
        uniqueIndex('thr_disbursements_unique').on(
            table.employeeId,
            table.year,
            table.religionHoliday
        ),
    ]
);

export const leaveAllowanceSettings = mysqlTable(
    'leave_allowance_settings',
    {
        id: int('id').autoincrement().primaryKey(),
        leaveTypeId: int('leave_type_id')
            .notNull()
            .references(() => leaveTypes.id, { onDelete: 'cascade' }),
        amountPerDay: decimal('amount_per_day', { precision: 15, scale: 2 }).notNull(),
        maxDaysPaid: int('max_days_paid'),
        createdAt: timestamp('created_at').defaultNow().notNull(),
        updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
    },
    (table) => []
);

// ============================================================
// HR — Pesangon (Severance, Fase 8)
// ============================================================

export const severanceSettings = mysqlTable(
    'severance_settings',
    {
        id: int('id').autoincrement().primaryKey(),
        severanceMultiplier: json('severance_multiplier').$type<JsonRecord>(),
        serviceAwardMultiplier: json('service_award_multiplier').$type<JsonRecord>(),
        compensationMultiplier: json('compensation_multiplier').$type<JsonRecord>(),
        createdAt: timestamp('created_at').defaultNow().notNull(),
        updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
    },
    (table) => []
);

export const severancePayments = mysqlTable(
    'severance_payments',
    {
        id: int('id').autoincrement().primaryKey(),
        employeeId: int('employee_id')
            .notNull()
            .references(() => employees.id, { onDelete: 'cascade' }),
        terminationDate: date('termination_date', { mode: 'string' }).notNull(),
        terminationReason: tinyint('termination_reason').notNull(),
        workingYears: decimal('working_years', { precision: 5, scale: 2 }),
        severanceAmount: decimal('severance_amount', { precision: 15, scale: 2 }).default('0'),
        serviceAwardAmount: decimal('service_award_amount', { precision: 15, scale: 2 }).default(
            '0'
        ),
        compensationAmount: decimal('compensation_amount', { precision: 15, scale: 2 }).default(
            '0'
        ),
        totalAmount: decimal('total_amount', { precision: 15, scale: 2 }).default('0'),
        status: tinyint('status').notNull().default(0),
        paidAt: timestamp('paid_at'),
        createdAt: timestamp('created_at').defaultNow().notNull(),
        updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
    },
    (table) => [index('severance_payments_employee_idx').on(table.employeeId)]
);

// ============================================================
// HR — Pajak & Bukti Potong (Coretax, Fase 8)
// ============================================================

export const employeeTaxProfiles = mysqlTable(
    'employee_tax_profiles',
    {
        id: int('id').autoincrement().primaryKey(),
        employeeId: int('employee_id')
            .notNull()
            .references(() => employees.id, { onDelete: 'cascade' }),
        year: int('year').notNull(),
        npwp: varchar('npwp', { length: 32 }),
        ptkpCode: tinyint('ptkp_code'),
        taxStatus: tinyint('tax_status').notNull().default(0),
        isNpwpHolder: tinyint('is_npwp_holder').notNull().default(1),
        foreignCountryCode: varchar('foreign_country_code', { length: 8 }),
        startPeriod: date('start_period', { mode: 'string' }),
        endPeriod: date('end_period', { mode: 'string' }),
        effectiveDate: date('effective_date', { mode: 'string' }),
        createdAt: timestamp('created_at').defaultNow().notNull(),
        updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
    },
    (table) => [uniqueIndex('employee_tax_profiles_unique').on(table.employeeId, table.year)]
);

export const taxWithholdingSlips = mysqlTable(
    'tax_withholding_slips',
    {
        id: int('id').autoincrement().primaryKey(),
        employeeId: int('employee_id')
            .notNull()
            .references(() => employees.id, { onDelete: 'cascade' }),
        payrollPeriodId: int('payroll_period_id').references(() => payrollPeriods.id, {
            onDelete: 'set null',
        }),
        slipType: tinyint('slip_type').notNull(),
        documentNumber: varchar('document_number', { length: 100 }),
        periodMonth: tinyint('period_month'),
        periodYear: int('period_year').notNull(),
        isAnnual: tinyint('is_annual').notNull().default(0),
        grossIncome: decimal('gross_income', { precision: 15, scale: 2 }).default('0'),
        ptkpAmount: decimal('ptkp_amount', { precision: 15, scale: 2 }).default('0'),
        taxableIncome: decimal('taxable_income', { precision: 15, scale: 2 }).default('0'),
        taxRate: decimal('tax_rate', { precision: 5, scale: 2 }).default('0'),
        taxAmount: decimal('tax_amount', { precision: 15, scale: 2 }).default('0'),
        ntpn: varchar('ntpn', { length: 64 }),
        signerName: varchar('signer_name', { length: 191 }),
        signerNik: varchar('signer_nik', { length: 32 }),
        signerPosition: varchar('signer_position', { length: 191 }),
        status: tinyint('status').notNull().default(0),
        issuedAt: timestamp('issued_at'),
        fileUrl: varchar('file_url', { length: 500 }),
        notes: text('notes'),
        createdAt: timestamp('created_at').defaultNow().notNull(),
        updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
    },
    (table) => [
        index('tax_withholding_slips_employee_idx').on(table.employeeId),
        uniqueIndex('tax_withholding_slips_document_number_unique').on(table.documentNumber),
    ]
);

export const coretaxSubmissions = mysqlTable(
    'coretax_submissions',
    {
        id: int('id').autoincrement().primaryKey(),
        periodMonth: tinyint('period_month'),
        periodYear: int('period_year').notNull(),
        submissionType: tinyint('submission_type').notNull(),
        totalSlips: int('total_slips').default(0),
        totalTaxAmount: decimal('total_tax_amount', { precision: 15, scale: 2 }).default('0'),
        ntpnBatch: varchar('ntpn_batch', { length: 64 }),
        fileUrl: varchar('file_url', { length: 500 }),
        status: tinyint('status').notNull().default(0),
        submittedAt: timestamp('submitted_at'),
        acceptedAt: timestamp('accepted_at'),
        rejectionReason: text('rejection_reason'),
        createdAt: timestamp('created_at').defaultNow().notNull(),
        updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
    },
    (table) => []
);

// ============================================================
// HR — Laporan (Report Templates & Logs, Fase 7)
// ============================================================

export const reportTemplates = mysqlTable(
    'report_templates',
    {
        id: int('id').autoincrement().primaryKey(),
        name: varchar('name', { length: 191 }).notNull(),
        module: tinyint('module').notNull(),
        config: json('config').$type<JsonRecord>(),
        createdBy: int('created_by').references(() => users.id, {
            onDelete: 'set null',
        }),
        createdAt: timestamp('created_at').defaultNow().notNull(),
        updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
    },
    (table) => []
);

export const reportLogs = mysqlTable(
    'report_logs',
    {
        id: int('id').autoincrement().primaryKey(),
        reportTemplateId: int('report_template_id').references(() => reportTemplates.id, {
            onDelete: 'set null',
        }),
        employeeId: int('employee_id').references(() => employees.id, {
            onDelete: 'set null',
        }),
        params: json('params').$type<JsonRecord>(),
        fileUrl: varchar('file_url', { length: 500 }),
        format: tinyint('format').notNull().default(0),
        generatedAt: timestamp('generated_at').defaultNow().notNull(),
    },
    (table) => [index('report_logs_template_idx').on(table.reportTemplateId)]
);

// ───────────────────────── Google Drive: list directory ─────────────────────────
// Cache struktur folder/file Google Drive. Satu baris = satu item Drive (folder atau file).
// `parentId` = 0 berarti root (root tidak punya baris sendiri, cuma dipakai sebagai penanda).
// `syncedAt` diisi timestamp run sync terakhir — dipakai untuk menghapus item yang
// sudah tidak ada lagi di Drive (lihat cleanStaleChildren di services/driveFolder.ts).

export const driveFolders = mysqlTable(
    'drive_folder',
    {
        id: int('id').autoincrement().primaryKey(),
        parentId: int('parent_id').notNull().default(0),
        name: varchar('name', { length: 512 }).notNull(),
        driveId: varchar('drive_id', { length: 128 }),
        mimeType: varchar('mime_type', { length: 191 }).notNull(),
        googleId: varchar('google_id', { length: 191 }).notNull(),
        parentGoogleId: varchar('parent_google_id', { length: 191 }).notNull(),
        webViewLink: varchar('web_view_link', { length: 1024 }),
        iconLink: varchar('icon_link', { length: 1024 }),
        sizeBytes: bigint('size_bytes', { mode: 'number' }),
        modifiedTime: timestamp('modified_time'),
        syncedAt: timestamp('synced_at').defaultNow().notNull(),
        createdAt: timestamp('created_at').defaultNow().notNull(),
        updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
    },
    (table) => [
        uniqueIndex('drive_folder_google_id_uq').on(table.googleId),
        index('drive_folder_parent_idx').on(table.parentId),
        index('drive_folder_parent_google_idx').on(table.parentGoogleId),
    ]
);

export const driveFolderClients = mysqlTable(
    'drive_folder_client',
    {
        id: int('id').autoincrement().primaryKey(),
        folderId: int('folder_id')
            .notNull()
            .references(() => driveFolders.id, { onDelete: 'cascade' }),
        customerId: int('customer_id')
            .notNull()
            .references(() => customers.id, { onDelete: 'cascade' }),
        createdAt: timestamp('created_at').defaultNow().notNull(),
        updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
    },
    (table) => [
        uniqueIndex('drive_folder_client_uq').on(table.folderId, table.customerId),
        index('drive_folder_client_customer_idx').on(table.customerId),
    ]
);

export const driveFolderRelations = relations(driveFolders, ({ many }) => ({
    clients: many(driveFolderClients),
}));

export const driveFolderClientRelations = relations(driveFolderClients, ({ one }) => ({
    folder: one(driveFolders, {
        fields: [driveFolderClients.folderId],
        references: [driveFolders.id],
    }),
    customer: one(customers, {
        fields: [driveFolderClients.customerId],
        references: [customers.id],
    }),
}));

// ─────────────────────────────────────────────────────────────────────────────
// Team Skill Hub — berbagi skill Hermes antar anggota tim.
//
// Lihat docs/plan-hermes/manage-skill.md. Ringkasnya: skill hidup sebagai
// SKILL.md di ~/.hermes/skills/ pada laptop masing-masing orang; tabel ini
// adalah registry terpusat supaya satu orang bisa membagikannya ke yang lain.
// Konten disimpan di kolom (bukan berkas) karena ukurannya dibatasi Hermes di
// 100.000 karakter — cukup kecil untuk database, dan menghindari penyimpanan
// berkas terpisah beserta backup-nya.
// ─────────────────────────────────────────────────────────────────────────────

export const teamSkills = mysqlTable(
    'team_skills',
    {
        id: int('id').autoincrement().primaryKey(),
        // Nama = nama direktori skill di mesin orang lain, jadi harus unik dan
        // aman dipakai sebagai path. Divalidasi ketat di route.
        name: varchar('name', { length: 150 }).notNull(),
        category: varchar('category', { length: 100 }),
        description: varchar('description', { length: 500 }),
        version: varchar('version', { length: 32 }),
        tags: json('tags').$type<string[]>(),
        // mediumtext (16 MB), BUKAN text (64 KB): batas Hermes 100.000 karakter
        // bisa melewati 64 KB pada teks non-ASCII dan akan terpotong diam-diam.
        content: mediumtext('content').notNull(),
        // sha256 dari content — dipakai membandingkan salinan lokal vs registry
        // tanpa perlu mengirim seluruh isinya.
        contentHash: varchar('content_hash', { length: 64 }).notNull(),
        authorUserId: int('author_user_id')
            .notNull()
            .references(() => users.id, { onDelete: 'cascade' }),
        status: varchar('status', { length: 20 }).default('published').notNull(),
        installCount: int('install_count').default(0).notNull(),
        // Didenormalisasi supaya pengurutan "paling bagus" tidak butuh agregasi
        // tiap request; dihitung ulang di dalam transaksi saat rating berubah.
        ratingAvg: decimal('rating_avg', { precision: 3, scale: 2 }).default('0').notNull(),
        ratingCount: int('rating_count').default(0).notNull(),
        createdAt: timestamp('created_at').defaultNow().notNull(),
        updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
    },
    (table) => [
        uniqueIndex('team_skills_name_uq').on(table.name),
        index('team_skills_status_idx').on(table.status),
        index('team_skills_author_idx').on(table.authorUserId),
    ]
);

export const teamSkillRatings = mysqlTable(
    'team_skill_ratings',
    {
        id: int('id').autoincrement().primaryKey(),
        skillId: int('skill_id')
            .notNull()
            .references(() => teamSkills.id, { onDelete: 'cascade' }),
        userId: int('user_id')
            .notNull()
            .references(() => users.id, { onDelete: 'cascade' }),
        rating: int('rating').notNull(), // 1..5, divalidasi zod di route
        comment: varchar('comment', { length: 1000 }),
        createdAt: timestamp('created_at').defaultNow().notNull(),
        updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
    },
    (table) => [
        // Satu orang satu rating per skill (boleh diubah, tidak boleh ditumpuk).
        uniqueIndex('team_skill_ratings_uq').on(table.skillId, table.userId),
    ]
);

export const teamSkillUsage = mysqlTable(
    'team_skill_usage',
    {
        id: int('id').autoincrement().primaryKey(),
        skillId: int('skill_id')
            .notNull()
            .references(() => teamSkills.id, { onDelete: 'cascade' }),
        userId: int('user_id')
            .notNull()
            .references(() => users.id, { onDelete: 'cascade' }),
        // Angka MENTAH dari ~/.hermes/skills/.usage.json di mesin user, yang
        // isinya total kumulatif. Karena itu baris ini di-UPSERT (nilai diganti),
        // bukan ditambahkan — kalau di-tambah, angkanya berlipat setiap kali
        // modal Agent Tools dibuka.
        useCount: int('use_count').default(0).notNull(),
        viewCount: int('view_count').default(0).notNull(),
        patchCount: int('patch_count').default(0).notNull(),
        lastUsedAt: timestamp('last_used_at'),
        reportedAt: timestamp('reported_at').defaultNow().onUpdateNow().notNull(),
    },
    (table) => [uniqueIndex('team_skill_usage_uq').on(table.skillId, table.userId)]
);

export const teamSkillRelations = relations(teamSkills, ({ one, many }) => ({
    author: one(users, {
        fields: [teamSkills.authorUserId],
        references: [users.id],
    }),
    ratings: many(teamSkillRatings),
    usage: many(teamSkillUsage),
}));

export const teamSkillRatingRelations = relations(teamSkillRatings, ({ one }) => ({
    skill: one(teamSkills, {
        fields: [teamSkillRatings.skillId],
        references: [teamSkills.id],
    }),
    user: one(users, { fields: [teamSkillRatings.userId], references: [users.id] }),
}));

export const teamSkillUsageRelations = relations(teamSkillUsage, ({ one }) => ({
    skill: one(teamSkills, {
        fields: [teamSkillUsage.skillId],
        references: [teamSkills.id],
    }),
    user: one(users, { fields: [teamSkillUsage.userId], references: [users.id] }),
}));
