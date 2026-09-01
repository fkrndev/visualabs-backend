-- Migration 0046: Add image_index column to shopee_drafts
-- Untuk distinguish multiple hero_prompt / bottom_hero_prompt drafts (1 per image)

ALTER TABLE shopee_drafts
ADD COLUMN image_index INT NULL AFTER product_id;
