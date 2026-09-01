-- Add 'waiting_verify' to shopee_scrape_sessions status enum
ALTER TABLE shopee_scrape_sessions
  MODIFY COLUMN status ENUM('scraping','analyzing','done','failed','waiting_verify') NOT NULL DEFAULT 'scraping';
