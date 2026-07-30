CREATE TABLE IF NOT EXISTS `tournament_game_best_moves` (
	`id` text PRIMARY KEY NOT NULL,
	`game_id` text NOT NULL,
	`participant_id` text NOT NULL,
	`source` text NOT NULL,
	`seat_numbers_json` text DEFAULT '[]' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`game_id`) REFERENCES `tournament_games`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`participant_id`) REFERENCES `tournament_participants`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `idx_tgbm_game_source_unique` ON `tournament_game_best_moves` (`game_id`,`source`);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `idx_tgbm_game_participant_unique` ON `tournament_game_best_moves` (`game_id`,`participant_id`);
