import * as Schema from "effect/Schema";

// Shared by low-level ID helpers without importing the composer UI or stores.
export const DraftId = Schema.String.pipe(Schema.brand("DraftId"));
export type DraftId = typeof DraftId.Type;
