-- Add shop decoration columns: hero_images, bottom_banner_images, chat_performance
ALTER TABLE shopee_shops
  ADD COLUMN hero_images JSON NULL AFTER banner_local,
  ADD COLUMN bottom_banner_images JSON NULL AFTER hero_images,
  ADD COLUMN chat_performance VARCHAR(255) NULL AFTER bottom_banner_images;
