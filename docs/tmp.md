
errr

```
Error: 20 |   async queryWithCache(queryString, params, query) {
21 |     if (this.cache === void 0 || is(this.cache, NoopCache) || this.queryMetadata === void 0) {
22 |       try {
23 |         return await query();
24 |       } catch (e) {
25 |         throw new DrizzleQueryError(queryString, params, e);
                   ^
error: Failed query: select `fb_act`.`id`, `fb_act`.`customer_id`, `fb_act`.`subscription_id`, `fb_act`.`token_id`, `fb_act`.`act_id`, `fb_act`.`act_name`, `fb_act`.`name`, `fb_act`.`data_json`, `fb_act`.`created_at`, `fb_act`.`updated_at`, `customers`.`id`, `customers`.`email`, `customers`.`username`, `customers`.`phone`, `customers`.`fbid`, `customers`.`googleid`, `customers`.`password`, `customers`.`data_json`, `customers`.`deleted_at`, `customers`.`created_at`, `customers`.`updated_at`, `customer_profiles`.`id`, `customer_profiles`.`customer_id`, `customer_profiles`.`name`, `customer_profiles`.`email`, `customer_profiles`.`phone`, `customer_profiles`.`data_json`, `customer_profiles`.`created_at`, `customer_profiles`.`updated_at`, `subscriptions`.`id`, `subscriptions`.`customer_id`, `subscriptions`.`product_id`, `subscriptions`.`advertiser_id`, `subscriptions`.`brand`, `subscriptions`.`platform`, `subscriptions`.`start_date`, `subscriptions`.`due_date`, `subscriptions`.`status`, `subscriptions`.`onboarding_date`, `subscriptions`.`onboarding_status`, `subscriptions`.`target`, `subscriptions`.`onboarding_updated_at`, `subscriptions`.`note`, `subscriptions`.`data_json`, `subscriptions`.`created_at`, `subscriptions`.`updated_at`, `fb_token`.`id`, `fb_token`.`user_id`, `fb_token`.`token`, `fb_token`.`status`, `fb_token`.`created_at`, `fb_token`.`updated_at` from `fb_act` left join `customers` on `customers`.`id` = `fb_act`.`customer_id` left join `customer_profiles` on `customer_profiles`.`customer_id` = `customers`.`id` left join `subscriptions` on `subscriptions`.`id` = `fb_act`.`subscription_id` left join `fb_token` on `fb_token`.`id` = `fb_act`.`token_id` order by `fb_act`.`id` asc limit ?
params: 100
  query: "select `fb_act`.`id`, `fb_act`.`customer_id`, `fb_act`.`subscription_id`, `fb_act`.`token_id`, `fb_act`.`act_id`, `fb_act`.`act_name`, `fb_act`.`name`, `fb_act`.`data_json`, `fb_act`.`created_at`, `fb_act`.`updated_at`, `customers`.`id`, `customers`.`email`, `customers`.`username`, `customers`.`phone`, `customers`.`fbid`, `customers`.`googleid`, `customers`.`password`, `customers`.`data_json`, `customers`.`deleted_at`, `customers`.`created_at`, `customers`.`updated_at`, `customer_profiles`.`id`, `customer_profiles`.`customer_id`, `customer_profiles`.`name`, `customer_profiles`.`email`, `customer_profiles`.`phone`, `customer_profiles`.`data_json`, `customer_profiles`.`created_at`, `customer_profiles`.`updated_at`, `subscriptions`.`id`, `subscriptions`.`customer_id`, `subscriptions`.`product_id`, `subscriptions`.`advertiser_id`, `subscriptions`.`brand`, `subscriptions`.`platform`, `subscriptions`.`start_date`, `subscriptions`.`due_date`, `subscriptions`.`status`, `subscriptions`.`onboarding_date`, `subscriptions`.`onboarding_status`, `subscriptions`.`target`, `subscriptions`.`onboarding_updated_at`, `subscriptions`.`note`, `subscriptions`.`data_json`, `subscriptions`.`created_at`, `subscriptions`.`updated_at`, `fb_token`.`id`, `fb_token`.`user_id`, `fb_token`.`token`, `fb_token`.`status`, `fb_token`.`created_at`, `fb_token`.`updated_at` from `fb_act` left join `customers` on `customers`.`id` = `fb_act`.`customer_id` left join `customer_profiles` on `customer_profiles`.`customer_id` = `customers`.`id` left join `subscriptions` on `subscriptions`.`id` = `fb_act`.`subscription_id` left join `fb_token` on `fb_token`.`id` = `fb_act`.`token_id` order by `fb_act`.`id` asc limit ?",
 params: [
  100
],

      at queryWithCache (/Users/macbookairm1/project/v-auto-backend/node_modules/drizzle-orm/mysql-core/session.js:25:15)

31 |     if (connection instanceof PromisePoolConnection) connection.release();
32 |   }
33 | 
34 |   query(sql, args) {
35 |     const corePool = this.pool;
36 |     const localErr = new Error();
                              ^
error: Unknown column 'customers.deleted_at' in 'SELECT'
      errno: 1054,
        sql: "select `fb_act`.`id`, `fb_act`.`customer_id`, `fb_act`.`subscription_id`, `fb_act`.`token_id`, `fb_act`.`act_id`, `fb_act`.`act_name`, `fb_act`.`name`, `fb_act`.`data_json`, `fb_act`.`created_at`, `fb_act`.`updated_at`, `customers`.`id`, `customers`.`email`, `customers`.`username`, `customers`.`phone`, `customers`.`fbid`, `customers`.`googleid`, `customers`.`password`, `customers`.`data_json`, `customers`.`deleted_at`, `customers`.`created_at`, `customers`.`updated_at`, `customer_profiles`.`id`, `customer_profiles`.`customer_id`, `customer_profiles`.`name`, `customer_profiles`.`email`, `customer_profiles`.`phone`, `customer_profiles`.`data_json`, `customer_profiles`.`created_at`, `customer_profiles`.`updated_at`, `subscriptions`.`id`, `subscriptions`.`customer_id`, `subscriptions`.`product_id`, `subscriptions`.`advertiser_id`, `subscriptions`.`brand`, `subscriptions`.`platform`, `subscriptions`.`start_date`, `subscriptions`.`due_date`, `subscriptions`.`status`, `subscriptions`.`onboarding_date`, `subscriptions`.`onboarding_status`, `subscriptions`.`target`, `subscriptions`.`onboarding_updated_at`, `subscriptions`.`note`, `subscriptions`.`data_json`, `subscriptions`.`created_at`, `subscriptions`.`updated_at`, `fb_token`.`id`, `fb_token`.`user_id`, `fb_token`.`token`, `fb_token`.`status`, `fb_token`.`created_at`, `fb_token`.`updated_at` from `fb_act` left join `customers` on `customers`.`id` = `fb_act`.`customer_id` left join `customer_profiles` on `customer_profiles`.`customer_id` = `customers`.`id` left join `subscriptions` on `subscriptions`.`id` = `fb_act`.`subscription_id` left join `fb_token` on `fb_token`.`id` = `fb_act`.`token_id` order by `fb_act`.`id` asc limit 100",
   sqlState: "42S22",
 sqlMessage: "Unknown column 'customers.deleted_at' in 'SELECT'",
       code: "ER_BAD_FIELD_ERROR"

      at query (/Users/macbookairm1/project/v-auto-backend/node_modules/mysql2/lib/promise/pool.js:36:26)
      at <anonymous> (/Users/macbookairm1/project/v-auto-backend/node_modules/drizzle-orm/mysql2/session.js:79:27)
      at queryWithCache (/Users/macbookairm1/project/v-auto-backend/node_modules/drizzle-orm/mysql-core/session.js:23:22)
      at execute (/Users/macbookairm1/project/v-auto-backend/node_modules/drizzle-orm/mysql2/session.js:78:31)
      at then (/Users/macbookairm1/project/v-auto-backend/node_modules/drizzle-orm/query-promise.js:21:17)


```