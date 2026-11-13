import { MAX_WEBHOOK_FILTERS } from "@t3tools/contracts";
import { expect, it, vi } from "vite-plus/test";
import {
  parseWebhookFilterDrafts,
  removeWebhookFilterDraft,
  webhookFilterDrafts,
  webhookFilterDraftsChanged,
  type WebhookFilterDraft,
} from "./scheduledTaskWebhook.ts";

it.each([
  {
    name: "limit",
    drafts: Array.from({ length: MAX_WEBHOOK_FILTERS + 1 }, (_, index) => ({
      id: String(index),
      path: "body",
      op: "exists" as const,
      value: "",
    })),
    template: "Use at most {0} filters.",
    number: MAX_WEBHOOK_FILTERS,
    error: `Use at most ${MAX_WEBHOOK_FILTERS} filters.`,
  },
  {
    name: "exists path",
    drafts: [{ id: "invalid", path: "Settings", op: "exists" as const, value: "ignored" }],
    template: "Filter {0} needs a path under body, headers or query.",
    number: 1,
    error: "Filter 1 needs a path under body, headers or query.",
  },
  {
    name: "in values",
    drafts: [
      { id: "valid", path: "headers.Open", op: "exists" as const, value: "ignored" },
      { id: "invalid", path: "body.Settings", op: "in" as const, value: " ,  , " },
      { id: "later", path: "invalid", op: "equals" as const, value: "Settings" },
    ],
    template: "Filter {0} needs a path under body, headers or query, and at least one value.",
    number: 2,
    error: "Filter 2 needs a path under body, headers or query, and at least one value.",
  },
  ...(["equals", "notEquals", "startsWith"] as const).map((op) => ({
    name: `${op} path`,
    drafts: [{ id: "invalid", path: "bodySettings", op, value: "Open {0} $&" }],
    template: "Filter {0} needs a path under body, headers or query, and a value.",
    number: 1,
    error: "Filter 1 needs a path under body, headers or query, and a value.",
  })),
])(
  "keeps default English and formats only the first $name failure",
  ({ drafts, template, number, error }) => {
    const before = structuredClone(drafts);
    expect(parseWebhookFilterDrafts(drafts)).toEqual({ error });
    const formatError = vi.fn(() => "Settings {0} $&\nOpen");
    expect(parseWebhookFilterDrafts(drafts, formatError)).toEqual({
      error: "Settings {0} $&\nOpen",
    });
    expect(formatError).toHaveBeenCalledExactlyOnceWith(template, [number]);
    expect(drafts).toEqual(before);
  },
);

it("preserves filter payloads, schema semantics and row identity with a formatter present", () => {
  const drafts: readonly WebhookFilterDraft[] = [
    { id: "equal", path: " body.Settings ", op: "equals", value: "  Open {0} $&\n  " },
    { id: "empty", path: "query.value", op: "notEquals", value: "" },
    { id: "prefix", path: "headers.x-Open", op: "startsWith", value: "Settings" },
    { id: "list", path: "body.labels.[]", op: "in", value: " Settings, Open {0} $&, , 保存 " },
    { id: "exists", path: "body", op: "exists", value: "not sent" },
  ];
  const formatError = vi.fn(() => "must not run");
  const parsed = parseWebhookFilterDrafts(drafts, formatError);
  expect(parsed).toEqual({
    filters: [
      { path: "body.Settings", op: "equals", value: "  Open {0} $&\n  " },
      { path: "query.value", op: "notEquals", value: "" },
      { path: "headers.x-Open", op: "startsWith", value: "Settings" },
      { path: "body.labels.[]", op: "in", value: ["Settings", "Open {0} $&", "保存"] },
      { path: "body", op: "exists" },
    ],
  });
  expect(parseWebhookFilterDrafts([], formatError)).toEqual({ filters: [] });
  expect(
    parseWebhookFilterDrafts(
      Array.from({ length: MAX_WEBHOOK_FILTERS }, () => drafts[4]!),
      formatError,
    ),
  ).toHaveProperty("filters");
  expect(formatError).not.toHaveBeenCalled();
  if (!("filters" in parsed)) throw new Error("Valid drafts should parse");
  const restored = webhookFilterDrafts(parsed.filters);
  expect(parseWebhookFilterDrafts(restored, formatError)).toEqual(parsed);
  expect(new Set(restored.map((row) => row.id)).size).toBe(restored.length);
  expect(
    webhookFilterDraftsChanged(
      restored,
      restored.map((row) => ({ ...row, id: `new-${row.id}` })),
    ),
  ).toBe(false);
  const removed = removeWebhookFilterDraft(restored, restored[1]!.id);
  expect(removed).toEqual([restored[0], ...restored.slice(2)]);
  expect(webhookFilterDraftsChanged(restored, removed)).toBe(true);
});
