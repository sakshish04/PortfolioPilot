CREATE TABLE `family_plans` (
	`id` varchar(64) NOT NULL,
	`name` varchar(120) NOT NULL,
	`ownerId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `family_plans_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `family_members` (
	`id` int AUTO_INCREMENT NOT NULL,
	`familyId` varchar(64) NOT NULL,
	`userId` int NOT NULL,
	`role` enum('owner','editor','viewer') NOT NULL DEFAULT 'viewer',
	`joinedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `family_members_id` PRIMARY KEY(`id`),
	CONSTRAINT `uk_family_user` UNIQUE(`familyId`,`userId`)
);
--> statement-breakpoint
CREATE TABLE `family_invitations` (
	`id` varchar(64) NOT NULL,
	`familyId` varchar(64) NOT NULL,
	`inviterId` int NOT NULL,
	`recipientEmail` varchar(320) NOT NULL,
	`tokenHash` varchar(128) NOT NULL,
	`role` enum('editor','viewer') NOT NULL DEFAULT 'viewer',
	`status` enum('pending','accepted','declined','revoked','expired') NOT NULL DEFAULT 'pending',
	`expiresAt` timestamp NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`respondedAt` timestamp,
	CONSTRAINT `family_invitations_id` PRIMARY KEY(`id`),
	CONSTRAINT `family_invitations_tokenHash_unique` UNIQUE(`tokenHash`)
);
--> statement-breakpoint
CREATE TABLE `family_portfolio_states` (
	`familyId` varchar(64) NOT NULL,
	`stateJson` longtext NOT NULL,
	`updatedBy` int NOT NULL,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `family_portfolio_states_familyId` PRIMARY KEY(`familyId`)
);
--> statement-breakpoint
ALTER TABLE `family_plans` ADD CONSTRAINT `family_plans_ownerId_users_id_fk` FOREIGN KEY (`ownerId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `family_members` ADD CONSTRAINT `family_members_familyId_family_plans_id_fk` FOREIGN KEY (`familyId`) REFERENCES `family_plans`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `family_members` ADD CONSTRAINT `family_members_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `family_invitations` ADD CONSTRAINT `family_invitations_familyId_family_plans_id_fk` FOREIGN KEY (`familyId`) REFERENCES `family_plans`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `family_invitations` ADD CONSTRAINT `family_invitations_inviterId_users_id_fk` FOREIGN KEY (`inviterId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `family_portfolio_states` ADD CONSTRAINT `family_portfolio_states_familyId_family_plans_id_fk` FOREIGN KEY (`familyId`) REFERENCES `family_plans`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `family_portfolio_states` ADD CONSTRAINT `family_portfolio_states_updatedBy_users_id_fk` FOREIGN KEY (`updatedBy`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;
