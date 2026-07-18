CREATE TABLE `stock` (
	`blank_id` text PRIMARY KEY NOT NULL,
	`on_hand` integer DEFAULT 0 NOT NULL,
	CONSTRAINT "stock_on_hand_non_negative" CHECK("stock"."on_hand" >= 0)
);
