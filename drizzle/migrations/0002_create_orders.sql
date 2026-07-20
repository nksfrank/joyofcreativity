CREATE TABLE `order_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`order_id` text NOT NULL,
	`product_id` text NOT NULL,
	`blank_id` text NOT NULL,
	`pattern_id` text NOT NULL,
	`yarn_color_ids` text NOT NULL,
	`customisation` text NOT NULL,
	`unit_amount` integer NOT NULL,
	`quantity` integer NOT NULL,
	`display` text NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "order_items_unit_amount_non_negative" CHECK("order_items"."unit_amount" >= 0),
	CONSTRAINT "order_items_quantity_positive" CHECK("order_items"."quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE `orders` (
	`id` text PRIMARY KEY NOT NULL,
	`currency` text NOT NULL,
	`created_at` integer NOT NULL
);
