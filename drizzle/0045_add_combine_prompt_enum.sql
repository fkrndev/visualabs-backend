-- Migration 0045: Add combine_prompt to shopee_drafts.draft_type enum
-- combine_prompt = generic prompt to overlay frame template + product photo (1 per session)

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
  'product_photo_prompt',
  'combine_prompt'
) NOT NULL;
