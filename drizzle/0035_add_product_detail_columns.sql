-- Add product detail columns: specs, reviews, images, brand, ratingCount, favorit
ALTER TABLE shopee_products
  ADD COLUMN rating_count VARCHAR(20) NULL AFTER rating,
  ADD COLUMN favorit VARCHAR(50) NULL AFTER sold,
  ADD COLUMN brand VARCHAR(100) NULL AFTER favorit,
  ADD COLUMN specs JSON NULL AFTER brand,
  ADD COLUMN images JSON NULL AFTER specs,
  ADD COLUMN reviews JSON NULL AFTER images;
