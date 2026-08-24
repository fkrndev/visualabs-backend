-- Rename bottom_banner_images → bottom_hero_images, drop chat_performance
ALTER TABLE shopee_shops
  DROP COLUMN chat_performance,
  CHANGE COLUMN bottom_banner_images bottom_hero_images JSON NULL;
