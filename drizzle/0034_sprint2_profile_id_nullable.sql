-- Sprint 2: Make profile_id nullable (global session tanpa staff profile)
-- Sprint 2: shop_url jadi required saat create (enforced di app layer, bukan DB)

ALTER TABLE shopee_scrape_sessions MODIFY COLUMN profile_id VARCHAR(36) NULL;
