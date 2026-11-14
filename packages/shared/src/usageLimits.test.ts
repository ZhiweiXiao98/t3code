import {
  DEFAULT_SERVER_SETTINGS,
  EnvironmentId,
  ProviderDriverKind,
  ProviderInstanceId,
  ServerProviderUsageWindow,
  type ServerProvider,
  UsageLimitSourceId,
} from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";
import * as Schema from "effect/Schema";

import {
  type LimitAccount,
  collectProviderUsageLimits,
  sameUsageLimitCommandCoverage,
  withUsageLimitsCommands,
  collectLimitAccounts,
  collectExternalUsageLinks,
  collectLimitNotices,
  collectLimitPools,
  elapsedShare,
  exhaustedUsageWindow,
  formatUsageWindowLabel,
  formatUsageUnavailableMessage,
  limitsNotice,
  paceOf,
  paceRemainingPercent,
  usesChatGptSharing,
  resolveNewThreadModelSelection,
} from "./usageLimits.ts";

const now = Date.parse("2026-09-03T12:00:00.000Z");
const encodeUsageWindow = Schema.encodeSync(ServerProviderUsageWindow);
const decodeUsageWindow = Schema.decodeUnknownSync(ServerProviderUsageWindow);

const window = {
  id: "five_hour",
  kind: "session",
  label: "Session",
  usedPercent: 40,
  windowDurationMins: 300,
  resetsAt: "2026-09-03T14:00:00.000Z",
} as const;

function provider(overrides: Partial<ServerProvider>): ServerProvider {
  return {
    instanceId: ProviderInstanceId.make("codex"),
    driver: ProviderDriverKind.make("codex"),
    enabled: true,
    installed: true,
    version: null,
    status: "ready",
    auth: { status: "authenticated" },
    checkedAt: "2026-09-03T11:00:00.000Z",
    models: [],
    slashCommands: [],
    skills: [],
    ...overrides,
  };
}

describe("new thread model fallback", () => {
  const selection = { instanceId: ProviderInstanceId.make("codex"), model: "gpt-6.1-sol" };
  const fallback = { instanceId: ProviderInstanceId.make("claude"), model: "claude-fable-5-1" };
  const limited = provider({
    usageLimits: {
      checkedAt: "2026-09-03T11:00:00.000Z",
      windows: [{ ...window, usedPercent: 100 }],
    },
  });
  const available = provider({
    instanceId: fallback.instanceId,
    driver: ProviderDriverKind.make("claudeAgent"),
  });

  const defaults = {
    defaultSelection: selection,
    fallbackSelection: fallback,
    providers: [limited, available],
    now,
  };
  it.each([
    ["exhausted default", {}, fallback],
    ["explicit selection", { explicitSelection: selection }, selection],
    ["missing default", { defaultSelection: null }, null],
    ["no fallback", { fallbackSelection: null }, selection],
    ["expired window", { now: Date.parse("2026-09-04T00:00:00Z") }, selection],
    [
      "environment disabled",
      {
        settings: {
          ...DEFAULT_SERVER_SETTINGS,
          providerInstances: {
            [fallback.instanceId]: { driver: available.driver, enabled: false, config: {} },
          },
        },
      },
      selection,
    ],
  ] as const)("resolves %s", (_name, overrides, expected) => {
    expect(resolveNewThreadModelSelection({ ...defaults, ...overrides }).selection).toEqual(
      expected,
    );
  });
  it.each([
    { enabled: false },
    { installed: false },
    { auth: { status: "unauthenticated" as const } },
    { availability: "unavailable" as const },
    { usageLimits: limited.usageLimits },
  ])("rejects an unusable fallback: %j", (overrides) => {
    expect(
      resolveNewThreadModelSelection({
        ...defaults,
        providers: [limited, { ...available, ...overrides }],
      }).selection,
    ).toEqual(selection);
  });
  it.each([undefined, "invalid"])("treats an unknown reset as exhausted: %s", (resetsAt) => {
    expect(
      exhaustedUsageWindow(
        provider({
          usageLimits: {
            checkedAt: limited.checkedAt,
            windows: [{ ...window, usedPercent: 100, resetsAt }],
          },
        }),
        now,
      ),
    ).toBeDefined();
  });
  it.each([
    ["cursor", ["autoPercentUsed"], "claude-opus-5-5", false],
    ["cursor", ["autoPercentUsed"], "composer-2.5", false],
    ["cursor", ["autoPercentUsed", "apiPercentUsed"], "composer-2.5", true],
    ["antigravity", ["gemini-weekly"], "claude-opus-5-5", false],
    ["antigravity", ["3p-weekly"], "claude-opus-5-5", true],
    ["antigravity", ["gemini-weekly"], "antigravity-default", true],
    ["opencode", ["go_weekly"], "opencode/big-pickle", false],
    ["opencode", ["go_weekly"], "opencode-go/big-pickle", true],
  ] as const)("matches %s pools %s to %s", (driver, ids, model, usesFallback) => {
    const defaultSelection = { ...selection, model };
    expect(
      resolveNewThreadModelSelection({
        ...defaults,
        defaultSelection,
        providers: [
          provider({
            driver: ProviderDriverKind.make(driver),
            usageLimits: {
              checkedAt: limited.checkedAt,
              windows: ids.map((id) => ({ ...window, id, usedPercent: 100 })),
            },
          }),
          available,
        ],
      }).selection,
    ).toEqual(usesFallback ? fallback : defaultSelection);
  });
});

describe("pace", () => {
  it("places the clock three fifths through a five-hour window with two hours left", () => {
    expect(elapsedShare(window, now)).toBeCloseTo(0.6);
    expect(paceRemainingPercent(window, now)).toBe(40);
    expect(paceOf(window, now)).toBe("under");
    expect(paceOf({ ...window, usedPercent: 62 }, now)).toBe("on");
    expect(paceOf({ ...window, usedPercent: 80 }, now)).toBe("ahead");
  });
});

describe("owned usage window labels", () => {
  it("localizes only matching owned descriptors and preserves opaque suffixes across locale changes", () => {
    const suffix = "  Settings/$&/{0}\n中文  ";
    const cases = [
      ["Session", { code: "session" }, "会话"],
      ["Weekly", { code: "weekly" }, "每周"],
      ["Monthly", { code: "monthly" }, "每月"],
      ["Monthly credit limit", { code: "monthlyCreditLimit" }, "每月额度上限"],
      ["Monthly spend", { code: "monthlySpend" }, "每月支出"],
      [`Weekly · ${suffix}`, { code: "weeklyScoped", displayName: suffix }, `每周 · ${suffix}`],
      ["Session", undefined, "Session"],
      ["Settings", { code: "session" }, "Settings"],
      ["Session ", { code: "session" }, "Session "],
      ["Session", { code: "future" }, "Session"],
      ["Session", null, "Session"],
      ["Session", "session", "Session"],
      ["Session", {}, "Session"],
      ["Session", { code: "constructor" }, "Session"],
      ["Weekly · Settings", { code: "weeklyScoped", displayName: "Other" }, "Weekly · Settings"],
      ["Weekly · Settings", { code: "weeklyScoped" }, "Weekly · Settings"],
      ["Weekly · 42", { code: "weeklyScoped", displayName: 42 }, "Weekly · 42"],
    ] as const;
    for (const [label, labelDescriptor, chinese] of cases) {
      const input = { label, labelDescriptor };
      const original = structuredClone(input);
      for (const locale of ["en", "zh-CN", "en"] as const) {
        expect(formatUsageWindowLabel(input, locale)).toBe(locale === "zh-CN" ? chinese : label);
      }
      expect(input).toEqual(original);
    }
    for (const displayName of [suffix, "Settings\n", "   "]) {
      const produced = {
        ...window,
        label: `Weekly · ${displayName}`,
        labelDescriptor: { code: "weeklyScoped" as const, displayName },
      };
      const restored = decodeUsageWindow(JSON.parse(JSON.stringify(encodeUsageWindow(produced))));
      expect(restored.label).toBe(produced.label.trim());
      expect(restored.labelDescriptor).toEqual(produced.labelDescriptor);
      expect(formatUsageWindowLabel(restored, "zh-CN")).toBe(`每周 · ${displayName}`);
      expect(formatUsageWindowLabel(restored, "en")).toBe(restored.label);
      expect(
        formatUsageWindowLabel({ ...restored, label: `${restored.label} extra` }, "zh-CN"),
      ).toBe(`${restored.label} extra`);
      expect(formatUsageWindowLabel({ ...restored, label: ` ${restored.label}` }, "zh-CN")).toBe(
        ` ${restored.label}`,
      );
    }
  });
});

describe("pools", () => {
  const checkedAt = "2026-09-03T11:00:00.000Z";
  const weekly = {
    id: "seven_day",
    kind: "weekly",
    label: "Weekly",
    windowDurationMins: 7 * 24 * 60,
    resetsAt: "2026-09-06T12:00:00.000Z",
  } as const;
  const claude = ProviderDriverKind.make("claudeAgent");
  const source = {
    id: UsageLimitSourceId.make("hub"),
    kind: "cliproxy" as const,
    label: "hub",
    checkedAt,
  };
  const laptop = { entry: { target: { label: "Laptop" } } };

  it("merges one account reported natively on two environments and by a hub into one entry", () => {
    const native = provider({
      driver: claude,
      instanceId: ProviderInstanceId.make("claude"),
      auth: { status: "authenticated", email: "Same@example.com" },
      usageLimits: { checkedAt, windows: [{ ...window, usedPercent: 40 }] },
    });
    const input = new Map([
      [EnvironmentId.make("env-a"), { ...laptop, serverConfig: { providers: [native] } }],
      [
        EnvironmentId.make("env-b"),
        {
          entry: { target: { label: "Desktop" } },
          serverConfig: {
            providers: [
              {
                ...native,
                usageLimits: {
                  checkedAt: "2026-09-03T11:30:00.000Z",
                  windows: [{ ...window, usedPercent: 55 }],
                },
              },
            ],
            usageLimitSources: [
              {
                ...source,
                accounts: [
                  {
                    id: "claude-same@example.com.json",
                    driver: claude,
                    email: "same@example.com",
                    plan: "Claude Subscription",
                    usageLimits: { checkedAt, windows: [{ ...window, usedPercent: 10 }] },
                  },
                ],
              },
            ],
          },
        },
      ],
    ]);
    const accounts = collectLimitAccounts(input);
    expect(accounts).toHaveLength(1);
    expect(accounts[0]).toMatchObject({
      key: "env-a:claude",
      sourceLabel: null,
      redeem: { environmentId: "env-b", input: { instanceId: "claude" } },
      environments: [
        { environmentId: "env-a", label: "Laptop" },
        { environmentId: "env-b", label: "Desktop" },
      ],
    });
    expect(accounts[0]?.limits.windows[0]?.usedPercent).toBe(55);
  });

  it("uses the freshest reported plan even when the newest quota has no plan", () => {
    const snapshot = (label: string | undefined, checkedAt: string, usedPercent: number) =>
      provider({
        driver: claude,
        auth: { status: "authenticated", email: "same@example.com", label },
        usageLimits: { checkedAt, windows: [{ ...window, usedPercent }] },
      });
    const stale = snapshot("Claude Team Subscription", checkedAt, 40);
    const fresh = snapshot("Claude Max Subscription", "2026-09-03T11:30:00.000Z", 7);
    const newest = snapshot(undefined, "2026-09-03T12:00:00.000Z", 5);
    for (const [reports, plan, usedPercent] of [
      [[stale, fresh], "Claude Max Subscription", 7],
      [[stale, newest], "Claude Team Subscription", 5],
      [[stale, fresh, newest], "Claude Max Subscription", 5],
    ] as const) {
      for (const order of reports.length === 2
        ? [reports, reports.toReversed()]
        : [
            [stale, fresh, newest],
            [stale, newest, fresh],
            [fresh, stale, newest],
            [fresh, newest, stale],
            [newest, stale, fresh],
            [newest, fresh, stale],
          ]) {
        const accounts = collectLimitAccounts(
          new Map(
            order.map((entry, index) => [
              EnvironmentId.make(`env-${index}`),
              { ...laptop, serverConfig: { providers: [entry] } },
            ]),
          ),
        );
        expect(accounts).toHaveLength(1);
        expect(accounts[0]?.plan).toBe(plan);
        expect(accounts[0]?.limits.windows[0]?.usedPercent).toBe(usedPercent);
      }
    }
  });

  it("merges OpenCode Go limits from machines with the same API key", () => {
    const go = provider({
      driver: ProviderDriverKind.make("opencode"),
      instanceId: ProviderInstanceId.make("opencode"),
      auth: { status: "authenticated" },
      usageLimits: {
        checkedAt,
        credentialFingerprint: "shared-go-key",
        windows: [{ ...window, id: "go_rolling", usedPercent: 3 }],
      },
    });
    const input = new Map([
      [EnvironmentId.make("env-a"), { ...laptop, serverConfig: { providers: [go] } }],
      [
        EnvironmentId.make("env-b"),
        {
          entry: { target: { label: "Desktop" } },
          serverConfig: {
            providers: [
              {
                ...go,
                usageLimits: {
                  ...go.usageLimits!,
                  checkedAt: "2026-09-03T11:30:00.000Z",
                  windows: [{ ...window, id: "go_rolling", usedPercent: 4 }],
                },
              },
            ],
          },
        },
      ],
    ]);
    const accounts = collectLimitAccounts(input);
    expect(accounts).toHaveLength(1);
    expect(accounts[0]?.environments).toEqual([
      { environmentId: "env-a", label: "Laptop" },
      { environmentId: "env-b", label: "Desktop" },
    ]);
    expect(collectLimitPools(accounts, now)[0]?.windows[0]?.members).toHaveLength(1);
    expect(accounts[0]?.limits.windows[0]?.usedPercent).toBe(4);

    const differentKey = {
      ...go,
      usageLimits: { ...go.usageLimits!, credentialFingerprint: "other-go-key" },
    };
    input.set(EnvironmentId.make("env-b"), {
      entry: { target: { label: "Desktop" } },
      serverConfig: { providers: [differentKey] },
    });
    expect(collectLimitAccounts(input)).toHaveLength(2);

    input.set(EnvironmentId.make("env-a"), {
      ...laptop,
      serverConfig: {
        providers: [{ ...go, auth: { status: "authenticated", email: "same@example.com" } }],
      },
    });
    input.set(EnvironmentId.make("env-b"), {
      entry: { target: { label: "Desktop" } },
      serverConfig: {
        providers: [
          { ...differentKey, auth: { status: "authenticated", email: "SAME@example.com" } },
        ],
      },
    });
    expect(collectLimitAccounts(input)).toHaveLength(1);
  });

  it("merges a local Antigravity login with its hub account by Google account fingerprint", () => {
    const antigravity = ProviderDriverKind.make("antigravity");
    const local = provider({
      driver: antigravity,
      instanceId: ProviderInstanceId.make("antigravity"),
      auth: { status: "authenticated" },
      usageLimits: {
        checkedAt,
        credentialFingerprint: "google-key",
        windows: [{ ...window, id: "gemini-weekly", usedPercent: 20 }],
      },
    });
    const hubAccount = {
      id: "antigravity-g@example.com.json",
      driver: antigravity,
      usageLimits: {
        checkedAt: "2026-09-03T11:30:00.000Z",
        credentialFingerprint: "google-key",
        windows: [{ ...window, id: "gemini-weekly", usedPercent: 30 }],
      },
    };
    const accounts = collectLimitAccounts(
      new Map([
        [
          EnvironmentId.make("env-a"),
          {
            ...laptop,
            serverConfig: {
              providers: [local],
              usageLimitSources: [{ ...source, accounts: [hubAccount] }],
            },
          },
        ],
      ]),
    );
    expect(accounts).toHaveLength(1);
    expect(accounts[0]?.limits.windows[0]?.usedPercent).toBe(30);
  });

  it("takes windows from a fresher hub read but credits and redeem from the native instance", () => {
    const native = provider({
      driver: claude,
      instanceId: ProviderInstanceId.make("claude"),
      auth: { status: "authenticated", email: "same@example.com" },
      usageLimits: {
        checkedAt,
        windows: [{ ...window, usedPercent: 40 }],
        resetCredits: { availableCount: 2 },
      },
    });
    const input = new Map([
      [
        EnvironmentId.make("env-a"),
        {
          ...laptop,
          serverConfig: {
            providers: [native],
            usageLimitSources: [
              {
                ...source,
                accounts: [
                  {
                    id: "claude-same@example.com.json",
                    driver: claude,
                    email: "same@example.com",
                    usageLimits: {
                      checkedAt: "2026-09-03T11:30:00.000Z",
                      windows: [{ ...window, usedPercent: 55 }],
                    },
                  },
                ],
              },
            ],
          },
        },
      ],
    ]);
    const [account] = collectLimitAccounts(input);
    expect(account?.limits.windows[0]?.usedPercent).toBe(55);
    expect(account?.limits.resetCredits?.availableCount).toBe(2);
    expect(account?.redeem).toEqual({ environmentId: "env-a", input: { instanceId: "claude" } });
    expect(account?.environments).toEqual([{ environmentId: "env-a", label: "Laptop" }]);
  });

  it("redeems through the hub when it holds a credit, even with a fresher native read", () => {
    const native = provider({
      driver: claude,
      instanceId: ProviderInstanceId.make("claude"),
      auth: { status: "authenticated", email: "same@example.com" },
      usageLimits: {
        checkedAt: "2026-09-03T11:30:00.000Z",
        windows: [{ ...window, usedPercent: 40 }],
        resetCredits: { availableCount: 3, nextCreditId: "native-credit" },
      },
    });
    const input = new Map([
      [
        EnvironmentId.make("env-a"),
        {
          ...laptop,
          serverConfig: {
            providers: [native],
            usageLimitSources: [
              {
                ...source,
                accounts: [
                  {
                    id: "claude-same@example.com.json",
                    driver: claude,
                    email: "same@example.com",
                    usageLimits: {
                      checkedAt,
                      windows: [{ ...window, usedPercent: 55 }],
                      resetCredits: { availableCount: 2, nextCreditId: "hub-credit" },
                    },
                  },
                ],
              },
            ],
          },
        },
      ],
    ]);
    const [account] = collectLimitAccounts(input);
    expect(account?.redeem).toEqual({
      environmentId: "env-a",
      input: { sourceId: "hub", accountId: "claude-same@example.com.json", creditId: "hub-credit" },
    });
    expect(account?.limits.resetCredits?.availableCount).toBe(3);
  });

  it("redeems on the environment whose snapshot supplied the credits on show", () => {
    const stale = provider({
      auth: { status: "authenticated", email: "same@example.com" },
      usageLimits: {
        checkedAt,
        windows: [window],
        resetCredits: { availableCount: 0 },
      },
    });
    const fresh = {
      ...stale,
      usageLimits: {
        checkedAt: "2026-09-03T11:30:00.000Z",
        windows: [window],
        resetCredits: { availableCount: 2 },
      },
    };
    const input = new Map([
      [EnvironmentId.make("env-a"), { ...laptop, serverConfig: { providers: [stale] } }],
      [
        EnvironmentId.make("env-b"),
        { entry: { target: { label: "Desktop" } }, serverConfig: { providers: [fresh] } },
      ],
    ]);
    const [account] = collectLimitAccounts(input);
    expect(account?.limits.resetCredits?.availableCount).toBe(2);
    expect(account?.redeem).toEqual({ environmentId: "env-b", input: { instanceId: "codex" } });
  });

  it("keeps distinct hub accounts redeemable through their own source", () => {
    const hubAccounts = ["first", "second"].map((id) => ({
      id,
      driver: ProviderDriverKind.make("codex"),
      email: `${id}@example.com`,
      usageLimits: {
        checkedAt,
        windows: [window],
        resetCredits: { availableCount: 2, nextCreditId: `${id}-credit` },
      },
    }));
    const input = new Map([
      [
        EnvironmentId.make("env-a"),
        {
          ...laptop,
          serverConfig: {
            providers: [],
            usageLimitSources: [{ ...source, accounts: hubAccounts }],
          },
        },
      ],
    ]);
    expect(collectLimitAccounts(input).map((account) => account.redeem)).toEqual(
      hubAccounts.map((account) => ({
        environmentId: "env-a",
        input: { sourceId: "hub", accountId: account.id, creditId: `${account.id}-credit` },
      })),
    );
  });

  it("does not give old credits the timestamp of a newer window-only read", () => {
    const snapshots = [
      { checkedAt, windows: [window], resetCredits: { availableCount: 2 } },
      { checkedAt: "2026-09-03T12:00:00.000Z", windows: [window] },
      {
        checkedAt: "2026-09-03T11:30:00.000Z",
        windows: [window],
        resetCredits: { availableCount: 1 },
      },
    ];
    const input = new Map(
      snapshots.map((usageLimits, i) => [
        EnvironmentId.make(`env-${i}`),
        {
          ...laptop,
          serverConfig: {
            providers: [
              provider({
                auth: { status: "authenticated", email: "same@example.com" },
                usageLimits,
              }),
            ],
          },
        },
      ]),
    );
    const [account] = collectLimitAccounts(input);
    expect(account?.limits.checkedAt).toBe("2026-09-03T12:00:00.000Z");
    expect(account?.limits.resetCredits?.availableCount).toBe(1);
    expect(account?.redeem?.environmentId).toBe("env-2");
  });

  it("keeps one email in two workspaces apart while merging each workspace's duplicates", () => {
    const login = (instanceId: string, workspaceId: string, usedPercent: number) =>
      provider({
        instanceId: ProviderInstanceId.make(instanceId),
        auth: { status: "authenticated", email: "same@example.com", workspaceId },
        usageLimits: { checkedAt, windows: [{ ...weekly, usedPercent }] },
      });
    const hubAccount = (id: string, workspaceId?: string) => ({
      id,
      driver: ProviderDriverKind.make("codex"),
      email: "same@example.com",
      ...(workspaceId ? { workspaceId } : {}),
      usageLimits: { checkedAt, windows: [{ ...weekly, usedPercent: 50 }] },
    });
    const input = new Map([
      [
        EnvironmentId.make("env-a"),
        {
          ...laptop,
          serverConfig: {
            providers: [login("business", "ws-business", 8), login("personal", "ws-plus", 26)],
            usageLimitSources: [
              { ...source, accounts: [hubAccount("plus.json", "ws-plus"), hubAccount("x.json")] },
            ],
          },
        },
      ],
      [
        EnvironmentId.make("env-b"),
        {
          entry: { target: { label: "Desktop" } },
          serverConfig: { providers: [login("personal", "ws-plus", 26)] },
        },
      ],
    ]);
    const accounts = collectLimitAccounts(input);
    expect(accounts.map((account) => account.key)).toEqual([
      "env-a:business",
      "env-a:personal",
      "hub:x.json",
    ]);
    expect(accounts[0]?.limits.windows[0]?.usedPercent).toBe(8);
    const withoutEmail = (id: string, workspaceId: string) => {
      const { email: _email, ...account } = hubAccount(id, workspaceId);
      return account;
    };
    const sameFile = new Map([
      [
        EnvironmentId.make("env-a"),
        {
          ...laptop,
          serverConfig: {
            providers: [],
            usageLimitSources: [{ ...source, accounts: [withoutEmail("a.json", "ws-1")] }],
          },
        },
      ],
      [
        EnvironmentId.make("env-b"),
        {
          ...laptop,
          serverConfig: {
            providers: [],
            usageLimitSources: [{ ...source, accounts: [withoutEmail("a.json", "ws-2")] }],
          },
        },
      ],
    ]);
    expect(collectLimitAccounts(sameFile).map((account) => account.key)).toEqual([
      "hub:a.json:ws-1",
      "hub:a.json:ws-2",
    ]);
    expect(accounts[1]?.environments.map((environment) => environment.label)).toEqual([
      "Laptop",
      "Desktop",
    ]);
  });

  it("joins a report without a workspace to the only workspace signed in with its email", () => {
    const native = provider({
      driver: claude,
      auth: { status: "authenticated", email: "same@example.com", workspaceId: "org-a" },
      usageLimits: { checkedAt, windows: [window] },
    });
    const hubAccount = {
      id: "claude.json",
      driver: claude,
      email: "same@example.com",
      usageLimits: { checkedAt, windows: [window] },
    };
    const withOther = (other: ServerProvider) =>
      new Map([
        [
          EnvironmentId.make("env-a"),
          {
            ...laptop,
            serverConfig: {
              providers: [native, other],
              usageLimitSources: [{ ...source, accounts: [hubAccount] }],
            },
          },
        ],
      ]);
    const unrelated = provider({ instanceId: ProviderInstanceId.make("codex-2") });
    expect(collectLimitAccounts(withOther(unrelated)).map((account) => account.key)).toEqual([
      "env-a:codex",
    ]);
    const unreadable = provider({
      ...native,
      instanceId: ProviderInstanceId.make("team"),
      auth: { ...native.auth, workspaceId: "org-b" },
      usageLimits: { checkedAt, windows: [], unavailable: { reason: "probeFailed" } },
    });
    expect(collectLimitAccounts(withOther(unreadable)).map((account) => account.key)).toEqual([
      "env-a:codex",
      "hub:claude.json",
    ]);
  });

  it("keys a hub account without an email by hub, so two environments on one hub share it", () => {
    const seat = {
      id: "claude-team-seat.json",
      driver: claude,
      usageLimits: { checkedAt, windows: [window] },
    };
    const hub = { ...source, accounts: [seat] };
    const input = new Map([
      [
        EnvironmentId.make("env-a"),
        { ...laptop, serverConfig: { providers: [], usageLimitSources: [hub] } },
      ],
      [
        EnvironmentId.make("env-b"),
        {
          entry: { target: { label: "Desktop" } },
          serverConfig: { providers: [], usageLimitSources: [hub] },
        },
      ],
    ]);
    const accounts = collectLimitAccounts(input);
    expect(accounts.map((account) => account.key)).toEqual(["hub:claude-team-seat.json"]);
    expect(accounts[0]?.displayName).toBe("claude-team-seat");
  });

  it("labels a default-named instance merged with a hub account by e-mail, keeping a chosen name", () => {
    const native = provider({
      driver: claude,
      instanceId: ProviderInstanceId.make("claudeAgent"),
      displayName: "Claude",
      auth: { status: "authenticated", email: "a@example.com" },
      usageLimits: { checkedAt, windows: [window] },
    });
    const named = provider({
      driver: claude,
      instanceId: ProviderInstanceId.make("claude-work"),
      displayName: "Work",
      auth: { status: "authenticated", email: "b@example.com" },
      usageLimits: { checkedAt, windows: [window] },
    });
    const hubAccount = (email: string) => ({
      id: `claude-${email}.json`,
      driver: claude,
      email,
      usageLimits: { checkedAt, windows: [window] },
    });
    const input = new Map([
      [
        EnvironmentId.make("env-a"),
        {
          ...laptop,
          serverConfig: {
            providers: [native, named],
            usageLimitSources: [
              {
                ...source,
                accounts: [
                  hubAccount("a@example.com"),
                  hubAccount("b@example.com"),
                  hubAccount("c@example.com"),
                ],
              },
            ],
          },
        },
      ],
    ]);
    expect(
      collectLimitAccounts(input).map(({ displayName, email }) => ({ displayName, email })),
    ).toEqual([
      { displayName: null, email: "a@example.com" },
      { displayName: "Work", email: "b@example.com" },
      { displayName: null, email: "c@example.com" },
    ]);
  });

  it("pools Codex windows by kind, whichever slot reported them", () => {
    const codexAccount = (id: string, slots: readonly string[]) => ({
      id,
      driver: ProviderDriverKind.make("codex"),
      usageLimits: {
        checkedAt,
        windows: slots.map((slot) => ({ ...weekly, id: slot, usedPercent: 50 })),
      },
    });
    const pooled = (accounts: ReturnType<typeof codexAccount>[]) =>
      collectLimitPools(
        collectLimitAccounts(
          new Map([
            [
              EnvironmentId.make("env-a"),
              {
                ...laptop,
                serverConfig: { providers: [], usageLimitSources: [{ ...source, accounts }] },
              },
            ],
          ]),
        ),
        now,
      )[0]?.windows ?? [];
    for (const order of [
      [codexAccount("business", ["primary"]), codexAccount("plus", ["secondary"])],
      [codexAccount("plus", ["secondary"]), codexAccount("business", ["primary"])],
    ]) {
      const windows = pooled(order);
      expect(windows.map((window) => window.id)).toEqual(["weekly"]);
      expect(windows[0]?.members).toHaveLength(2);
    }
    expect(
      pooled([codexAccount("a", ["secondary"]), codexAccount("b", ["primary", "secondary"])]).map(
        (window) => window.id,
      ),
    ).toEqual(["weekly", "weekly:secondary"]);
  });

  it("pools windows by id across accounts and orders resets by when they land", () => {
    const input = new Map([
      [
        EnvironmentId.make("env-a"),
        {
          ...laptop,
          serverConfig: {
            providers: [],
            usageLimitSources: [
              {
                ...source,
                accounts: [
                  {
                    id: "a",
                    driver: claude,
                    usageLimits: {
                      checkedAt,
                      windows: [
                        { ...window, usedPercent: 80, resetsAt: "2026-09-03T13:00:00.000Z" },
                        { ...weekly, usedPercent: 20 },
                      ],
                    },
                  },
                  {
                    id: "b",
                    driver: claude,
                    usageLimits: {
                      checkedAt,
                      windows: [{ ...window, usedPercent: 40 }],
                    },
                  },
                  {
                    id: "c",
                    driver: ProviderDriverKind.make("codex"),
                    usageLimits: { checkedAt, windows: [{ ...weekly, usedPercent: 50 }] },
                  },
                  {
                    id: "unsupported",
                    driver: claude,
                    usageLimits: {
                      checkedAt,
                      windows: [],
                      unavailable: { reason: "unsupported" as const },
                    },
                  },
                ],
              },
            ],
          },
        },
      ],
    ]);
    const pools = collectLimitPools(collectLimitAccounts(input), now);
    expect(pools.map((pool) => [pool.driver, pool.accounts.length])).toEqual([
      ["claudeAgent", 2],
      ["codex", 1],
    ]);
    const [session, week] = pools[0]!.windows;
    const untimed = collectLimitPools(
      collectLimitAccounts(input).map((account) =>
        account.key === "hub:b"
          ? {
              ...account,
              limits: {
                ...account.limits,
                windows: account.limits.windows.map((w) => ({ ...w, resetsAt: undefined })),
              },
            }
          : account,
      ),
      now,
    );
    expect(untimed[0]?.windows[0]?.pace).toBe("on");
    expect(session).toMatchObject({
      id: "five_hour",
      remainingPercent: 40,
      usedPercent: 60,
      pace: "under",
    });
    expect(
      session?.resets.map((reset) => [reset.member.account.key, reset.restoresPercent]),
    ).toEqual([
      ["hub:a", 40],
      ["hub:b", 20],
    ]);
    expect(week).toMatchObject({ id: "seven_day", remainingPercent: 80, members: [{}] });
    // Codex reports `primary` for both its five-hour and (on Go) monthly window.
    const mixed = collectLimitPools(
      [
        ...collectLimitAccounts(input),
        {
          key: "go",
          driver: claude,
          displayName: "Go",
          email: undefined,
          plan: undefined,
          accentColor: undefined,
          environments: [],
          sourceLabel: null,
          redeem: null,
          limits: {
            checkedAt,
            windows: [
              {
                id: "five_hour",
                kind: "monthly",
                label: "Monthly",
                usedPercent: 82,
                windowDurationMins: 30 * 24 * 60,
                resetsAt: "2026-09-14T12:00:00.000Z",
              },
            ],
          },
        },
      ],
      now,
    );
    expect(mixed[0]?.windows.map((window) => [window.kind, window.members.length])).toEqual([
      ["session", 2],
      ["weekly", 1],
      ["monthly", 1],
    ]);
    expect(session?.members.map((member) => member.account.key)).toEqual(["hub:a", "hub:b"]);
    expect(pools[0]?.accounts.map((account) => account.key)).toEqual(["hub:a", "hub:b"]);
  });
});

describe("pooled account columns", () => {
  const weekly = {
    ...window,
    id: "seven_day",
    kind: "weekly",
    label: "Weekly",
    windowDurationMins: 7 * 24 * 60,
  } as const;
  const account = (key: string, windows: LimitAccount["limits"]["windows"]): LimitAccount => ({
    key,
    driver: ProviderDriverKind.make("claudeAgent"),
    displayName: key,
    email: undefined,
    plan: undefined,
    accentColor: undefined,
    environments: [],
    sourceLabel: "Hub",
    redeem: null,
    limits: { checkedAt: "2026-09-03T11:00:00.000Z", windows },
  });
  const keys = (pool: ReturnType<typeof collectLimitPools>[number]) =>
    pool.windows.map((row) =>
      row.columns.map((member) => (member.window ? member.account.key : null)),
    );

  it("keeps pooled label ownership paired with the selected raw label", () => {
    const tagged = { ...window, labelDescriptor: { code: "session" as const } };
    const pooled = collectLimitPools([account("a", [tagged]), account("b", [window])], now)[0]!
      .windows[0]!;
    expect(pooled.label).toBe("Session");
    expect(pooled.labelDescriptor).toEqual(tagged.labelDescriptor);
    const untagged = collectLimitPools([account("a", [window]), account("b", [tagged])], now)[0]!
      .windows[0]!;
    expect(untagged.label).toBe("Session");
    expect(untagged.labelDescriptor).toBeUndefined();
  });

  // regression: #20349 sessions stay visible while the weekly quota is exhausted
  it.each([
    ["claudeAgent", "13:00", 40, "14:00", 100],
    ["codex", "14:00", 100, "14:00", 100],
    ["claudeAgent", "15:00", 100, "15:00", 100],
    ["codex", "15:00", 40, "14:00", 60],
  ] as const)(
    "%s session resetting at %s with %i percent spent becomes usable at %s with %i percent restored",
    (driver, sessionReset, usedPercent, usableAt, restoresPercent) => {
      const at = (time: string) => `2026-09-03T${time}:00.000Z`;
      const a = {
        ...account("a", [
          {
            ...window,
            id: driver === "codex" ? "primary" : window.id,
            usedPercent,
            resetsAt: at(sessionReset),
          },
          {
            ...weekly,
            id: driver === "codex" ? "secondary" : weekly.id,
            usedPercent: 100,
            resetsAt: at("14:00"),
          },
        ]),
        driver: ProviderDriverKind.make(driver),
      };
      const [session] = collectLimitPools([a], now)[0]!.windows;
      expect.soft(session?.remainingPercent).toBe(0);
      expect(session?.resets[0]).toMatchObject({
        at: Date.parse(at(usableAt)),
        restoresPercent,
      });
    },
  );

  it("excludes weekly-blocked sessions from the pool without changing snapshots or model allowances", () => {
    const blocked = account("blocked", [
      window,
      { ...weekly, usedPercent: 100 },
      { ...weekly, id: "seven_day_fable", usedPercent: 20 },
    ]);
    const accounts = [
      blocked,
      account("available", [
        { ...window, usedPercent: 20 },
        { ...weekly, usedPercent: 99 },
        { ...weekly, id: "seven_day_fable", usedPercent: 40 },
      ]),
      { ...blocked, key: "cursor", driver: ProviderDriverKind.make("cursor") },
    ];
    const snapshot = structuredClone(accounts);
    const [claude, cursor] = collectLimitPools(accounts, now);
    expect.soft(claude?.windows.map((row) => row.remainingPercent)).toEqual([40, 1, 70]);
    expect.soft(cursor?.windows.map((row) => row.remainingPercent)).toEqual([60, 0, 80]);
    expect(accounts).toEqual(snapshot);
  });

  it("keeps session columns across rows with opposite reset and usage orders", () => {
    const accounts = [
      account("a", [
        { ...weekly, usedPercent: 80, resetsAt: "2026-09-05T12:00:00.000Z" },
        { ...window, usedPercent: 10, resetsAt: "2026-09-03T15:00:00.000Z" },
      ]),
      account("b", [
        { ...weekly, usedPercent: 20, resetsAt: "2026-09-06T12:00:00.000Z" },
        { ...window, usedPercent: 90, resetsAt: "2026-09-03T13:00:00.000Z" },
      ]),
    ];
    const [pool] = collectLimitPools(accounts, now);
    expect(pool!.accounts.map((account) => account.key)).toEqual(["b", "a"]);
    expect(keys(pool!)).toEqual([
      ["b", "a"],
      ["b", "a"],
    ]);
    expect(pool!.windows[1]!.resets.map((reset) => reset.member.account.key)).toEqual(["a", "b"]);
    expect(pool!.windows[1]!.remainingPercent).toBe(50);
    expect(keys(collectLimitPools(accounts.toReversed(), now)[0]!)).toEqual(keys(pool!));
  });

  it.each([undefined, "invalid", "2026-09-03T11:30:00.000Z"])(
    "keeps blocked sessions empty without predicting a refill from a missing or stale clock (%s)",
    (resetsAt) => {
      const [pool] = collectLimitPools(
        [
          account("session-clock", [
            { ...window, resetsAt },
            { ...weekly, usedPercent: 100 },
          ]),
          account("weekly-clock", [window, { ...weekly, usedPercent: 100, resetsAt }]),
        ],
        now,
      );
      expect(pool!.windows[0]).toMatchObject({ remainingPercent: 0, pace: null, resets: [] });
      expect(pool!.windows[0]!.columns.map((column) => column.window?.resetsAt)).toEqual([
        undefined,
        undefined,
      ]);
    },
  );

  it("orders by usable session refill and clears suppression after a fresh weekly reading", () => {
    const blocked = account("blocked", [
      { ...window, resetsAt: "2026-09-03T13:00:00.000Z" },
      { ...weekly, usedPercent: 100, resetsAt: "2026-09-03T15:00:00.000Z" },
    ]);
    const available = account("available", [window]);
    const [before] = collectLimitPools([blocked, available], now);
    expect(before!.accounts.map((account) => account.key)).toEqual(["available", "blocked"]);
    expect(before!.windows[0]!.remainingPercent).toBe(30);
    const refreshed = {
      ...blocked,
      limits: {
        checkedAt: "2026-09-03T12:00:00.000Z",
        windows: [blocked.limits.windows[0]!, { ...weekly, usedPercent: 10 }],
      },
    };
    const [after] = collectLimitPools([refreshed, available], now);
    expect(after!.accounts.map((account) => account.key)).toEqual(["blocked", "available"]);
    expect(after!.windows[0]!.remainingPercent).toBe(60);
    expect(after!.windows[0]!.resets[0]).toMatchObject({
      at: Date.parse("2026-09-03T13:00:00.000Z"),
      restoresPercent: 20,
    });
  });

  it("preserves gaps without counting missing windows toward pooled quota", () => {
    const [pool] = collectLimitPools(
      [
        account("a", [window]),
        account("b", [
          { ...window, resetsAt: "2026-09-03T15:00:00.000Z" },
          { ...weekly, usedPercent: 80 },
        ]),
        account("c", [weekly]),
      ],
      now,
    );
    expect(keys(pool!)).toEqual([
      ["a", "b", null],
      [null, "b", "c"],
    ]);
    expect(pool!.windows[1]!.members.map((member) => member.account.key)).toEqual(["b", "c"]);
    expect(pool!.windows[1]!.remainingPercent).toBe(40);
    expect(pool!.windows[1]!.resets.map((reset) => reset.restoresPercent)).toEqual([40, 20]);
  });

  it("falls back to weekly resets when no account reports a session", () => {
    const [pool] = collectLimitPools(
      [
        account("a", [{ ...weekly, resetsAt: "2026-09-06T12:00:00.000Z" }]),
        account("b", [{ ...weekly, resetsAt: "2026-09-05T12:00:00.000Z" }]),
      ],
      now,
    );
    expect(keys(pool!)).toEqual([["b", "a"]]);
  });
});

describe("/usage-limits", () => {
  const limits = { checkedAt: "2026-09-03T11:00:00.000Z", windows: [window] };
  const selected = provider({
    usageLimits: limits,
    auth: { status: "authenticated", email: "same@example.com" },
  });
  const sources = [
    {
      id: UsageLimitSourceId.make("hub"),
      kind: "cliproxy" as const,
      label: "Accounts",
      checkedAt: limits.checkedAt,
      accounts: [
        {
          id: "duplicate",
          driver: selected.driver,
          email: "SAME@example.com",
          usageLimits: limits,
        },
        { id: "oss", driver: selected.driver, plan: "Codex OSS", usageLimits: limits },
        { id: "other-provider", driver: ProviderDriverKind.make("claude"), usageLimits: limits },
      ],
    },
  ];

  it("uses hub credit balances and redemption targets in the composer, including native duplicates", () => {
    const hubs = sources.map((source) => ({
      ...source,
      accounts: source.accounts.map((account) => ({
        ...account,
        usageLimits: {
          ...account.usageLimits,
          resetCredits: { availableCount: 2, nextCreditId: `${account.id}-credit` },
        },
      })),
    }));
    const report = collectProviderUsageLimits(selected.instanceId, [selected], hubs, now);
    expect(report?.accounts[0]?.limits.resetCredits?.availableCount).toBe(2);
    expect(report?.accounts[0]?.resetCreditInput).toEqual({
      sourceId: "hub",
      accountId: "duplicate",
      creditId: "duplicate-credit",
    });
    expect(report?.accounts.find((account) => account.id === "hub:oss")?.resetCreditInput).toEqual({
      sourceId: "hub",
      accountId: "oss",
      creditId: "oss-credit",
    });
  });

  it("gives a hub credit to no native row when its email is signed in to two workspaces", () => {
    const workspaces = ["ws-a", "ws-b"].map((workspaceId) =>
      provider({
        instanceId: ProviderInstanceId.make(workspaceId),
        usageLimits: limits,
        auth: { status: "authenticated", email: "same@example.com", workspaceId },
      }),
    );
    const hub = [
      {
        ...sources[0]!,
        accounts: [
          {
            id: "duplicate",
            driver: selected.driver,
            email: "same@example.com",
            usageLimits: { ...limits, resetCredits: { availableCount: 2, nextCreditId: "c" } },
          },
        ],
      },
    ];
    const report = collectProviderUsageLimits(workspaces[0]!.instanceId, workspaces, hub, now);
    expect(report?.accounts.map((account) => account.resetCreditInput)).toEqual([
      { instanceId: "ws-a" },
      { instanceId: "ws-b" },
      { sourceId: "hub", accountId: "duplicate", creditId: "c" },
    ]);
  });

  it("redeems a native duplicate through the hub even when the native snapshot is fresher", () => {
    const fresher = provider({
      usageLimits: {
        checkedAt: "2026-09-03T11:30:00.000Z",
        windows: [window],
        resetCredits: { availableCount: 3, nextCreditId: "native-credit" },
      },
      auth: { status: "authenticated", email: "same@example.com" },
    });
    const stale = [
      {
        id: UsageLimitSourceId.make("hub"),
        kind: "cliproxy" as const,
        label: "Accounts",
        checkedAt: limits.checkedAt,
        accounts: [
          {
            id: "duplicate",
            driver: fresher.driver,
            email: "SAME@example.com",
            usageLimits: {
              ...limits,
              resetCredits: { availableCount: 2, nextCreditId: "hub-credit" },
            },
          },
        ],
      },
    ];
    const report = collectProviderUsageLimits(fresher.instanceId, [fresher], stale, now);
    expect(report?.accounts[0]?.resetCreditInput).toEqual({
      sourceId: "hub",
      accountId: "duplicate",
      creditId: "hub-credit",
    });
    expect(report?.accounts[0]?.limits.resetCredits?.availableCount).toBe(3);
  });

  it("labels hub rows by account id without .json", () => {
    const hub = [
      {
        ...sources[0]!,
        label: "CLIProxyAPI",
        accounts: [
          {
            id: "claude-b@example.com.json",
            driver: selected.driver,
            email: "b@example.com",
            usageLimits: limits,
          },
          { id: "team-seat.json", driver: selected.driver, usageLimits: limits },
        ],
      },
    ];
    const report = collectProviderUsageLimits(selected.instanceId, [selected], hub, now);
    expect(
      report?.accounts.filter((account) => account.sourceLabel).map((account) => account.label),
    ).toEqual(["CLIProxyAPI · claude-b@example.com", "CLIProxyAPI · team-seat"]);
  });

  it("keeps unidentified custom instances separate, filtering by driver", () => {
    const report = collectProviderUsageLimits(
      selected.instanceId,
      [
        selected,
        provider({
          instanceId: ProviderInstanceId.make("codex-work"),
          displayName: "Work",
          usageLimits: { ...limits, resetCredits: { availableCount: 2 } },
        }),
        provider({
          driver: ProviderDriverKind.make("claude"),
          instanceId: ProviderInstanceId.make("claude"),
          usageLimits: limits,
        }),
      ],
      sources,
      now,
    );
    expect(report?.createdAt).toBe("2026-09-03T12:00:00.000Z");
    expect(report?.accounts.map((account) => account.id)).toEqual([
      "codex",
      "codex-work",
      "hub:oss",
    ]);
    expect(report?.accounts[0]).toMatchObject({
      instanceId: selected.instanceId,
      email: selected.auth.email,
    });
    expect(report?.accounts[1]).toMatchObject({
      displayName: "Work",
      limits: { resetCredits: { availableCount: 2 } },
    });
    expect(report?.accounts[2]).toMatchObject({
      label: "Accounts · oss",
      sourceLabel: "CLI Proxy",
      plan: "Codex OSS",
    });
    expect(report?.notices).toEqual([]);
  });

  it("keeps the freshest usable native duplicate and the freshest native credits in either order", () => {
    const failed = provider({
      auth: selected.auth,
      usageLimits: {
        ...limits,
        checkedAt: "2026-09-03T11:40:00.000Z",
        unavailable: { reason: "probeFailed" },
      },
    });
    const credited = provider({
      instanceId: ProviderInstanceId.make("codex-credit"),
      auth: selected.auth,
      usageLimits: {
        checkedAt: "2026-09-03T11:20:00.000Z",
        windows: [{ ...window, usedPercent: 50 }],
        resetCredits: { availableCount: 2 },
      },
    });
    const staleCredit = provider({
      ...credited,
      instanceId: ProviderInstanceId.make("codex-stale-credit"),
      usageLimits: { ...limits, resetCredits: { availableCount: 3 } },
    });
    const freshest = provider({
      instanceId: ProviderInstanceId.make("codex-fresh"),
      auth: selected.auth,
      usageLimits: {
        checkedAt: "2026-09-03T11:30:00.000Z",
        windows: [{ ...window, usedPercent: 55 }],
      },
    });
    const duplicates = [failed, staleCredit, credited, freshest];
    for (const providers of [duplicates, duplicates.toReversed()]) {
      const report = collectProviderUsageLimits(failed.instanceId, providers, sources, now);
      expect(report?.accounts.map((account) => account.id)).toEqual(["codex-fresh", "hub:oss"]);
      expect(report?.accounts[0]).toMatchObject({
        limits: {
          checkedAt: "2026-09-03T11:30:00.000Z",
          windows: [{ usedPercent: 55 }],
          resetCredits: { availableCount: 2 },
        },
        resetCreditInput: { instanceId: "codex-credit" },
      });
      expect(report?.accounts[0]?.limits.unavailable).toBeUndefined();
    }
  });

  it("merges native workspace duplicates only while the workspace evidence is unambiguous", () => {
    const known = provider({
      ...selected,
      instanceId: ProviderInstanceId.make("workspace-a"),
      auth: { ...selected.auth, workspaceId: "ws-a" },
    });
    const fresh = provider({
      ...known,
      instanceId: ProviderInstanceId.make("workspace-a-fresh"),
      usageLimits: { ...limits, checkedAt: "2026-09-03T11:30:00.000Z" },
    });
    const natives = [known, fresh, selected];
    expect(
      collectProviderUsageLimits(selected.instanceId, natives, [], now)?.accounts.map(
        (account) => account.id,
      ),
    ).toEqual(["workspace-a-fresh"]);

    const unreadable = provider({
      instanceId: ProviderInstanceId.make("workspace-b"),
      auth: { ...selected.auth, workspaceId: "ws-b" },
    });
    expect(
      collectProviderUsageLimits(
        selected.instanceId,
        [...natives, unreadable],
        [],
        now,
      )?.accounts.map((account) => account.id),
    ).toEqual(["workspace-a-fresh", "codex"]);
    expect(
      collectProviderUsageLimits(
        selected.instanceId,
        [...natives, { ...unreadable, usageLimits: limits }],
        [],
        now,
      )?.accounts.map((account) => account.id),
    ).toEqual(["workspace-a-fresh", "codex", "workspace-b"]);
  });

  it("supports a source-only provider and keeps duplicates when the native probe failed", () => {
    expect(
      collectProviderUsageLimits(selected.instanceId, [provider({})], sources, now)?.accounts.map(
        (account) => account.id,
      ),
    ).toEqual(["hub:duplicate", "hub:oss"]);
    const failed = provider({ usageLimits: { ...limits, unavailable: { reason: "probeFailed" } } });
    expect(
      collectProviderUsageLimits(selected.instanceId, [failed], sources, now)?.accounts.map(
        (account) => account.id,
      ),
    ).toEqual(["codex", "hub:duplicate", "hub:oss"]);
    expect(collectProviderUsageLimits(selected.instanceId, [provider({})], [], now)).toBeNull();
    expect(
      collectProviderUsageLimits(
        selected.instanceId,
        [provider({ enabled: false, usageLimits: limits })],
        [],
        now,
      ),
    ).toBeNull();
  });

  it("surfaces source errors only for sources that carry the selected driver", () => {
    const failing = { ...sources[0]!, error: "token expired" };
    expect(
      collectProviderUsageLimits(selected.instanceId, [selected], [failing], now)?.notices,
    ).toEqual(["Accounts: token expired"]);
    const claudeOnly = { ...failing, accounts: failing.accounts.slice(2) };
    expect(
      collectProviderUsageLimits(selected.instanceId, [selected], [claudeOnly], now)?.notices,
    ).toEqual([]);
    const unreadable = { ...failing, accounts: [] };
    expect(
      collectProviderUsageLimits(selected.instanceId, [selected], [unreadable], now)?.notices,
    ).toEqual(["Accounts: token expired"]);
    const sourceOnly = collectProviderUsageLimits(
      selected.instanceId,
      [provider({})],
      [unreadable],
      now,
    );
    expect(sourceOnly?.accounts).toEqual([]);
    expect(sourceOnly?.notices).toEqual(["Accounts: token expired"]);
  });

  it("advertises global and workspace commands only for providers present in Limits", () => {
    const withWorkspace = provider({
      workspaceSnapshots: [
        { cwd: "/tmp/project", checkedAt: limits.checkedAt, slashCommands: [], skills: [] },
      ],
    });
    const [supported] = withUsageLimitsCommands([withWorkspace], sources);
    expect(supported?.slashCommands.map((command) => command.name)).toEqual(["usage-limits"]);
    expect(
      supported?.workspaceSnapshots?.[0]?.slashCommands.map((command) => command.name),
    ).toEqual(["usage-limits"]);
    expect(withUsageLimitsCommands([withWorkspace], [])[0]?.slashCommands).toEqual([]);
    const ownCommand = provider({
      slashCommands: [{ name: "usage-limits", description: "Provider's own" }],
    });
    expect(withUsageLimitsCommands([ownCommand], [])[0]?.slashCommands).toEqual([
      { name: "usage-limits", description: "Provider's own" },
    ]);
    const unreadable = { ...sources[0]!, accounts: [], error: "token expired" };
    expect(
      withUsageLimitsCommands([withWorkspace], [unreadable])[0]?.slashCommands.map(
        (command) => command.name,
      ),
    ).toEqual(["usage-limits"]);
    expect(
      withUsageLimitsCommands([selected], [])[0]?.slashCommands.map((command) => command.name),
    ).toEqual(["usage-limits"]);
    const unrelated = provider({ driver: ProviderDriverKind.make("claudeAgent") });
    const disabled = provider({ ...unrelated, enabled: false, usageLimits: limits });
    const mixed = withUsageLimitsCommands([selected, withWorkspace, unrelated, disabled], []);
    expect(mixed.map((entry) => entry.slashCommands.map((command) => command.name))).toEqual([
      ["usage-limits"],
      ["usage-limits"],
      [],
      [],
    ]);
    expect(mixed[2]).toBe(unrelated);
    expect(mixed[3]).toBe(disabled);
  });
});

describe("sameUsageLimitCommandCoverage", () => {
  const codexAccount = {
    id: "a",
    driver: ProviderDriverKind.make("codex"),
    usageLimits: { checkedAt: "2026-09-03T11:00:00.000Z", windows: [] },
  };
  const base = {
    id: UsageLimitSourceId.make("hub"),
    kind: "cliproxy" as const,
    label: "Accounts",
    checkedAt: "2026-09-03T11:00:00.000Z",
  };
  it("ignores quota movement but not the drivers offered the command", () => {
    const withCodex = [{ ...base, accounts: [codexAccount] }];
    const withCodexLater = [
      {
        ...base,
        accounts: [
          {
            ...codexAccount,
            usageLimits: { ...codexAccount.usageLimits, checkedAt: "2026-09-03T12:00:00.000Z" },
          },
        ],
      },
    ];
    expect(sameUsageLimitCommandCoverage(withCodex, withCodexLater)).toBe(true);
    expect(sameUsageLimitCommandCoverage(withCodex, [{ ...base, accounts: [] }])).toBe(false);
  });
  it("treats a failed read as a change in coverage, in both directions", () => {
    const empty = [{ ...base, accounts: [] }];
    const failed = [{ ...base, accounts: [], error: "token expired" }];
    expect(sameUsageLimitCommandCoverage(empty, failed)).toBe(false);
    expect(sameUsageLimitCommandCoverage(failed, empty)).toBe(false);
    expect(
      sameUsageLimitCommandCoverage(failed, [{ ...base, accounts: [], error: "still down" }]),
    ).toBe(true);
  });
});

describe("external usage settings", () => {
  it("deduplicates destinations across accounts and environments without inventing quota pools", () => {
    const managed = provider({
      usageLimits: {
        checkedAt: "2026-09-03T11:00:00.000Z",
        windows: [],
        unavailable: { reason: "unsupported", message: "Track usage in ChatGPT." },
        externalUsage: { label: "ChatGPT usage", url: "https://chatgpt.com/#settings/Usage" },
      },
    });
    const presentations = new Map([
      [
        EnvironmentId.make("a"),
        {
          entry: { target: { label: "A" } },
          serverConfig: {
            providers: [managed, { ...managed, instanceId: ProviderInstanceId.make("personal") }],
          },
        },
      ],
      [
        EnvironmentId.make("b"),
        { entry: { target: { label: "B" } }, serverConfig: { providers: [managed] } },
      ],
    ]);
    expect(collectExternalUsageLinks(presentations)).toEqual([
      {
        ...managed.usageLimits!.externalUsage,
        message: "Track usage in ChatGPT.",
        accounts: [`${managed.instanceId} on A`, "personal on A", `${managed.instanceId} on B`],
      },
    ]);
    expect(collectLimitAccounts(presentations)).toEqual([]);
    expect(collectLimitNotices(presentations)).toEqual([]);

    const message = "Codex did not answer the usage request.";
    const messageDescriptor = { code: "codexUsageNoResponse" as const };
    const tagged = provider({
      ...managed,
      usageLimits: {
        ...managed.usageLimits!,
        unavailable: { reason: "probeFailed", message, messageDescriptor },
      },
    });
    const raw = provider({
      ...managed,
      usageLimits: { ...managed.usageLimits!, unavailable: { reason: "probeFailed", message } },
    });
    for (const pair of [
      [tagged, raw],
      [raw, tagged],
    ]) {
      const combined = new Map([
        [
          EnvironmentId.make("a"),
          {
            entry: { target: { label: "Settings/$&/{0} 中文" } },
            serverConfig: {
              providers: pair.map((entry, index) => ({
                ...entry,
                instanceId: ProviderInstanceId.make(`account-${index}`),
              })),
            },
          },
        ],
      ]);
      const links = collectExternalUsageLinks(combined);
      expect(links).toHaveLength(1);
      expect(links[0]).toEqual({
        ...managed.usageLimits!.externalUsage,
        message,
        ...(pair[1] === tagged ? { messageDescriptor } : {}),
        accounts: ["account-0 on Settings/$&/{0} 中文", "account-1 on Settings/$&/{0} 中文"],
      });
    }
  });
});

describe("ChatGPT sharing presentation", () => {
  it("requires verified sharing metadata rather than the Codex driver or login type", () => {
    const codex = provider({ auth: { status: "authenticated", type: "chatgpt" } });
    expect(usesChatGptSharing(codex)).toBe(false);
    expect(
      usesChatGptSharing({ ...codex, auth: { ...codex.auth, subscriptionSharing: true } }),
    ).toBe(true);
    expect(
      usesChatGptSharing({
        ...codex,
        auth: { status: "unauthenticated", subscriptionSharing: true },
      }),
    ).toBe(false);
  });
});

describe("limit notice display copy", () => {
  it("localizes owned provider fallbacks before concatenation without changing raw messages", () => {
    const checkedAt = "2026-09-03T11:00:00.000Z";
    const rawMessages = [
      "Could not read limits.",
      "No limits reported.",
      "  No limits reported.  ",
      " ",
      "",
    ];
    const presentations = new Map([
      [
        EnvironmentId.make("a"),
        {
          entry: { target: { label: "Settings $& {0}" } },
          serverConfig: {
            providers: [
              provider({
                displayName: "Usage",
                usageLimits: { checkedAt, windows: [], unavailable: { reason: "probeFailed" } },
              }),
              provider({ displayName: "Settings", usageLimits: { checkedAt, windows: [] } }),
              ...rawMessages.map((message, index) =>
                provider({
                  displayName: `Raw ${index}`,
                  usageLimits: {
                    checkedAt,
                    windows: [],
                    unavailable: { reason: "probeFailed" as const, message },
                  },
                }),
              ),
            ],
            usageLimitSources: rawMessages.map((error, index) => ({
              id: UsageLimitSourceId.make(`raw-${index}`),
              kind: "cliproxy" as const,
              label: `Source ${index}`,
              checkedAt,
              accounts: [],
              error,
            })),
          },
        },
      ],
      [
        EnvironmentId.make("b"),
        { entry: { target: { label: "Other" } }, serverConfig: { providers: [] } },
      ],
    ]);
    const calls: string[] = [];
    const notices = collectLimitNotices(presentations, "No accounts reported.", (message) => {
      calls.push(message);
      return message === "Could not read limits." ? "无法读取限额。" : "未报告限额。";
    });
    expect(calls).toEqual(["Could not read limits.", "No limits reported."]);
    expect(notices).toEqual([
      "Settings $& {0} · Usage: 无法读取限额。",
      "Settings $& {0} · Settings: 未报告限额。",
      ...rawMessages
        .slice(0, -1)
        .map((message, index) => `Settings $& {0} · Raw ${index}: ${message}`),
      ...rawMessages
        .slice(0, -1)
        .map((message, index) => `Settings $& {0} · Source ${index}: ${message}`),
      "Settings $& {0} · Source 4: No accounts reported.",
    ]);
    expect(collectLimitNotices(presentations)).toEqual([
      "Settings $& {0} · Usage: Could not read limits.",
      "Settings $& {0} · Settings: No limits reported.",
      ...notices.slice(2),
    ]);
    const message = "Codex did not answer the usage request.";
    const owned = new Map([
      [
        EnvironmentId.make("a"),
        {
          entry: { target: { label: "Settings $& {0}" } },
          serverConfig: {
            providers: [
              provider({
                displayName: "Owned/$&/{0}",
                usageLimits: {
                  checkedAt,
                  windows: [],
                  unavailable: {
                    reason: "probeFailed" as const,
                    message,
                    messageDescriptor: { code: "codexUsageNoResponse" as const },
                  },
                },
              }),
              provider({
                displayName: "Raw/$&/{0}",
                usageLimits: {
                  checkedAt,
                  windows: [],
                  unavailable: { reason: "probeFailed" as const, message },
                },
              }),
            ],
            usageLimitSources: [
              {
                id: UsageLimitSourceId.make("opaque"),
                kind: "cliproxy" as const,
                label: "Source/$&/{0}",
                checkedAt,
                accounts: [],
                error: message,
              },
            ],
          },
        },
      ],
    ]);
    expect(
      collectLimitNotices(owned, undefined, undefined, (unavailable) =>
        formatUsageUnavailableMessage(unavailable, "zh-CN"),
      ),
    ).toEqual([
      "Owned/$&/{0}: Codex 未响应读取用量的请求。",
      `Raw/$&/{0}: ${message}`,
      `Source/$&/{0}: ${message}`,
    ]);
  });

  it("localizes only the empty-source fallback and preserves identical provider and source errors", () => {
    const message = "No accounts reported.";
    const checkedAt = "2026-09-03T11:00:00.000Z";
    const emptySource = {
      id: UsageLimitSourceId.make("empty"),
      kind: "cliproxy" as const,
      label: "Settings $& {0}",
      checkedAt,
      accounts: [],
    };
    const presentations = new Map([
      [
        EnvironmentId.make("a"),
        {
          entry: { target: { label: "Usage" } },
          serverConfig: {
            providers: [
              provider({
                displayName: "Settings",
                usageLimits: {
                  checkedAt,
                  windows: [],
                  unavailable: { reason: "probeFailed", message },
                },
              }),
            ],
            usageLimitSources: [
              emptySource,
              {
                ...emptySource,
                id: UsageLimitSourceId.make("failed"),
                label: "Failed source",
                error: message,
              },
            ],
          },
        },
      ],
      [
        EnvironmentId.make("b"),
        { entry: { target: { label: "Other" } }, serverConfig: { providers: [] } },
      ],
    ]);
    expect(collectLimitNotices(presentations)).toEqual([
      "Usage · Settings: No accounts reported.",
      "Usage · Settings $& {0}: No accounts reported.",
      "Usage · Failed source: No accounts reported.",
    ]);
    expect(collectLimitNotices(presentations, "未报告任何账户。")).toEqual([
      "Usage · Settings: No accounts reported.",
      "Usage · Settings $& {0}: 未报告任何账户。",
      "Usage · Failed source: No accounts reported.",
    ]);
  });
});

describe("owned usage unavailable notices", () => {
  it("localizes only matching descriptors and keeps raw messages across locale changes", () => {
    const cases = [
      [
        "Codex could not read usage (JSON-RPC -32603).",
        { code: "codexUsageRequestFailed", rpcCode: -32603 },
        "Codex 无法读取用量（JSON-RPC -32603）。",
      ],
      [
        "Codex could not be started to read usage.",
        { code: "codexUsageSpawnFailed" },
        "无法启动 Codex 以读取用量。",
      ],
      [
        "Codex exited before it could report usage.",
        { code: "codexUsageProcessExited" },
        "Codex 在报告用量前已退出。",
      ],
      [
        "Codex did not answer the usage request.",
        { code: "codexUsageNoResponse" },
        "Codex 未响应读取用量的请求。",
      ],
      [
        "Codex CLI is not authenticated. Run `codex login` and try again.",
        { code: "codexUsageLoginRequired" },
        "Codex CLI 尚未登录。请运行 `codex login` 后重试。",
      ],
    ] as const;
    for (const [message, messageDescriptor, chinese] of cases) {
      const input = { message, messageDescriptor };
      const original = structuredClone(input);
      for (const locale of ["en", "zh-CN", "en"] as const) {
        expect(formatUsageUnavailableMessage(input, locale)).toBe(
          locale === "zh-CN" ? chinese : message,
        );
      }
      expect(input).toEqual(original);
      expect(formatUsageUnavailableMessage({ message }, "zh-CN")).toBe(message);
      expect(formatUsageUnavailableMessage({ ...input, message: ` ${message}` }, "zh-CN")).toBe(
        ` ${message}`,
      );
    }
    for (const messageDescriptor of [
      undefined,
      null,
      "codexUsageNoResponse",
      {},
      { code: "future" },
      { code: "constructor" },
      { code: "codexUsageRequestFailed" },
      { code: "codexUsageRequestFailed", rpcCode: "-32603" },
      { code: "codexUsageRequestFailed", rpcCode: Number.NaN },
    ]) {
      const message = "Codex could not read usage (JSON-RPC -32603).";
      expect(formatUsageUnavailableMessage({ message, messageDescriptor }, "zh-CN")).toBe(message);
    }
    for (const message of [undefined, "", "Settings/$&/{0} 中文", "Could not read limits."]) {
      expect(
        formatUsageUnavailableMessage(
          { message, messageDescriptor: { code: "codexUsageNoResponse" } },
          "zh-CN",
        ),
      ).toBe(message);
    }
  });

  it("keeps notice defaults and localizes generic fallbacks separately from explicit text", () => {
    const base = { checkedAt: "2026-09-03T11:00:00.000Z", windows: [] };
    const fallback = (message: string) => `fallback:${message}`;
    const display = (unavailable: {
      readonly message?: string | undefined;
      readonly messageDescriptor?: unknown;
    }) => formatUsageUnavailableMessage(unavailable, "zh-CN");
    for (const [reason, english] of [
      ["unsupported", "This account has no subscription limits."],
      ["probeFailed", "Could not read limits."],
    ] as const) {
      const limits = { ...base, unavailable: { reason } };
      expect(limitsNotice(limits)).toBe(english);
      expect(limitsNotice(limits, fallback, display)).toBe(`fallback:${english}`);
      for (const message of [english, "", "Settings/$&/{0} 中文"]) {
        const explicit = { ...base, unavailable: { reason, message } };
        expect(limitsNotice(explicit)).toBe(message);
        expect(limitsNotice(explicit, fallback, display)).toBe(message);
      }
    }
    expect(limitsNotice(base)).toBe("No limits reported.");
    expect(limitsNotice(base, fallback, display)).toBe("fallback:No limits reported.");
    expect(limitsNotice({ ...base, windows: [window] }, fallback, display)).toBeNull();
    const tagged = {
      ...base,
      unavailable: {
        reason: "probeFailed" as const,
        message: "Codex did not answer the usage request.",
        messageDescriptor: { code: "codexUsageNoResponse" as const },
      },
    };
    expect(limitsNotice(tagged)).toBe(tagged.unavailable.message);
    expect(limitsNotice(tagged, fallback, display)).toBe("Codex 未响应读取用量的请求。");
  });
});
