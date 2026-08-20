CREATE TABLE `personal_pose_analyses` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`sourceLabel` varchar(160) NOT NULL,
	`poseSpace` enum('monocular_relative_pose','calibrated_multi_view_3d') NOT NULL DEFAULT 'monocular_relative_pose',
	`status` enum('candidate','rejected','approved_private') NOT NULL DEFAULT 'candidate',
	`privacy` enum('private') NOT NULL DEFAULT 'private',
	`poseJson` text NOT NULL,
	`qualityJson` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `personal_pose_analyses_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `personal_profiles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`displayName` varchar(80) NOT NULL,
	`privacy` enum('private') NOT NULL DEFAULT 'private',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `personal_profiles_id` PRIMARY KEY(`id`),
	CONSTRAINT `personal_profiles_user_id_uq` UNIQUE(`userId`)
);
