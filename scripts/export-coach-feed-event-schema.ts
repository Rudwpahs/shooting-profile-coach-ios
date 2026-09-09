import { writeFileSync } from "node:fs";
import path from "node:path";

import { z } from "zod";

import { CoachFeedEventV1Schema } from "@/lib/coach/feed-event";

/**
 * Writes contracts/coach-feed-event-v1.schema.json from the Zod schema.
 * The feed event is a product-side contract (TypeScript only), so Zod is its
 * exporter; tests/coach-feed-event.test.ts fails when the file is stale.
 *
 *   pnpm exec tsx --tsconfig tsconfig.json scripts/export-coach-feed-event-schema.ts
 */
const target = path.resolve("contracts/coach-feed-event-v1.schema.json");
const schema = { ...z.toJSONSchema(CoachFeedEventV1Schema), $id: "coach-feed-event-v1.schema.json", title: "CoachFeedEventV1" };
writeFileSync(target, `${JSON.stringify(schema, null, 2)}\n`, "utf8");
console.log(target);
