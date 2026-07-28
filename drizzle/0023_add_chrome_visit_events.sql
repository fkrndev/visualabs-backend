CREATE TABLE `chrome_visit_events` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `history_id` INT NOT NULL,
  `user_id` INT NOT NULL,
  `customer_id` INT NULL,
  `visited_at` TIMESTAMP NOT NULL,
  `duration_ms` INT NULL,
  `data_json` JSON NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `chrome_visit_events_user_visited_idx` (`user_id`, `visited_at`),
  KEY `chrome_visit_events_history_idx` (`history_id`),
  KEY `chrome_visit_events_customer_idx` (`customer_id`),
  KEY `chrome_visit_events_visited_at_idx` (`visited_at`),
  CONSTRAINT `chrome_visit_events_history_fk`
    FOREIGN KEY (`history_id`) REFERENCES `chrome_histories` (`id`) ON DELETE CASCADE,
  CONSTRAINT `chrome_visit_events_user_fk`
    FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `chrome_visit_events_customer_fk`
    FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
