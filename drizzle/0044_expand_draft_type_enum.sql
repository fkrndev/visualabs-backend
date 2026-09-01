-- 0044: Expand shopee_drafts.draft_type enum
-- Tambah image prompt types untuk shop (banner, logo, hero, bottom_hero),
-- template_design (catalog design guide 1 per session), dan product_photo_prompt.
-- Keep template_prompt & composite_prompt untuk backward compat (data lama).

ALTER TABLE shopee_drafts
  MODIFY COLUMN draft_type ENUM(
    'shop_bio',
    'product_title',
    'product_description',
    'template_prompt',
    'composite_prompt',
    'banner_prompt',
    'logo_prompt',
    'hero_prompt',
    'bottom_hero_prompt',
    'template_design',
    'product_photo_prompt'
  ) NOT NULL;
