-- Add new score columns to shopee_scores
ALTER TABLE shopee_scores
  ADD COLUMN name_score INT NULL AFTER bio_score,
  ADD COLUMN stats_score INT NULL AFTER name_score,
  ADD COLUMN hero_score INT NULL AFTER stats_score,
  ADD COLUMN bottom_hero_score INT NULL AFTER hero_score,
  ADD COLUMN categories_score INT NULL AFTER photo_score,
  ADD COLUMN specs_score INT NULL AFTER categories_score;
