import type { LiveActivityComponent } from "expo-widgets";
import { Children, isValidElement, type ReactNode } from "react";
import { describe, expect, it, vi } from "vite-plus/test";

import type { EnvironmentId, ThreadId } from "@t3tools/contracts";
import type { RelayAgentActivityAggregateState } from "@t3tools/contracts/relay";

const registration = vi.hoisted(() => ({
  layout: null as LiveActivityComponent<AgentActivityProps> | null,
}));

vi.mock("@expo/ui/swift-ui", () => ({
  HStack: "HStack",
  Image: "Image",
  Spacer: "Spacer",
  Text: "Text",
  VStack: "VStack",
  ZStack: "ZStack",
}));
vi.mock("@expo/ui/swift-ui/modifiers", () => {
  const modifier = () => ({});
  return {
    accessibilityElement: modifier,
    accessibilityLabel: (label: string) => ({ label }),
    activityBackgroundTint: modifier,
    containerBackground: modifier,
    font: modifier,
    foregroundStyle: modifier,
    frame: modifier,
    layoutPriority: modifier,
    lineLimit: modifier,
    minimumScaleFactor: modifier,
    padding: modifier,
    resizable: modifier,
    widgetURL: (url: string) => ({ url }),
  };
});
vi.mock("expo-widgets", () => ({
  createLiveActivity: (_name: string, layout: LiveActivityComponent<AgentActivityProps>) => {
    registration.layout = layout;
    return {};
  },
  createWidget: vi.fn(() => ({})),
}));

import "./AgentActivity";
import type { AgentActivityProps } from "./AgentActivity";
import { AgentActivityWidget } from "./AgentActivityWidget";
import {
  agentActivityWidgetTimeline,
  type AgentActivityWidgetSource,
} from "./agentActivityWidgetTimeline";

type Row = RelayAgentActivityAggregateState["activities"][number];
const now = Date.parse("2026-10-18T10:00:00.000Z");

function row(phase: Row["phase"], status: string): Row {
  return {
    environmentId: "env-1" as EnvironmentId,
    threadId: "thread-1" as ThreadId,
    projectTitle: "Approval",
    threadTitle: "Working",
    modelTitle: "Settings",
    phase,
    status,
    updatedAt: "2026-10-18T09:59:00.000Z",
    deepLink: "/threads/env-1/thread-1",
  };
}

function aggregate(activities: readonly Row[]): RelayAgentActivityAggregateState {
  return {
    title: "T3 Code",
    subtitle: "Agent work in progress",
    activeCount: activities.filter((item) => item.phase !== "completed" && item.phase !== "failed")
      .length,
    updatedAt: "2026-10-18T09:59:00.000Z",
    activities,
  };
}

function inspect(node: ReactNode) {
  const text: string[] = [];
  const links: string[] = [];
  const visit = (child: ReactNode) => {
    if (Array.isArray(child)) return child.forEach(visit);
    if (
      !isValidElement<{
        children?: ReactNode;
        modifiers?: { url?: string }[];
      }>(child)
    )
      return;
    if (child.type === "Text") text.push(Children.toArray(child.props.children).join(""));
    for (const modifier of child.props.modifiers ?? []) {
      if (modifier.url) links.push(modifier.url);
    }
    visit(child.props.children);
  };
  visit(node);
  return { text, links };
}

function liveLayout(props: AgentActivityProps, isStale = false) {
  const layout = registration.layout;
  if (layout === null) throw new Error("Live Activity layout was not registered");
  return layout(props, { colorScheme: "dark", isStale } as Parameters<typeof layout>[1]);
}

function widgetLayout(props: Partial<AgentActivityProps> | undefined, family = "systemLarge") {
  return AgentActivityWidget(props, {
    colorScheme: "dark",
    widgetFamily: family,
    widgetRenderingMode: "fullColor",
  } as Parameters<typeof AgentActivityWidget>[1]);
}

const ownedStatuses = [
  ["starting", "Connecting", "正在连接"],
  ["running", "Working", "运行中"],
  ["waiting_for_approval", "Approval", "待批准"],
  ["waiting_for_input", "Input", "待输入"],
  ["completed", "Done", "完成"],
  ["failed", "Failed", "失败"],
  ["stale", "Waiting", "等待中"],
  ["stale", "Out of date", "状态已过期"],
] as const;

describe("Agent activity native widget presentation", () => {
  it.each(["en", "zh-CN"])(
    "translates only matching owned phase/status pairs, preserving source rows and navigation (%s)",
    (locale) => {
      vi.stubEnv("EXPO_PUBLIC_APP_LOCALE", locale);
      try {
        for (const [phase, status, translated] of ownedStatuses) {
          const props = aggregate([row(phase, status)]);
          const original = structuredClone(props);
          const layout = liveLayout(props);
          const expected = locale === "zh-CN" ? translated : status;
          for (const node of [layout.banner, layout.bannerSmall, layout.expandedBottom]) {
            expect(inspect(node).text.at(-1)).toBe(expected);
          }
          expect(inspect(layout.banner).text).toEqual(
            expect.arrayContaining(["Working", "Approval"]),
          );
          expect(inspect(layout.expandedBottom).links).toContain("t3code://threads/env-1/thread-1");
          for (const family of ["systemLarge", "systemSmall", "accessoryRectangular"]) {
            const rendered = inspect(widgetLayout(props, family));
            expect(rendered.text.at(-1)).toBe(expected);
            expect(rendered.text).toContain("Working");
            expect(rendered.links).toContain("t3code://threads/env-1/thread-1");
          }
          expect(props).toEqual(original);
        }
        for (const [phase, english, chinese] of [
          ["waiting_for_approval", "Approval", "待批准"],
          ["waiting_for_input", "Input", "待输入"],
          ["failed", "Failed", "失败"],
        ] as const) {
          const rendered = inspect(liveLayout(aggregate([row(phase, english)])).compactTrailing);
          expect(rendered.text).toEqual([locale === "zh-CN" ? chinese : english]);
          expect(rendered.links).toContain("t3code://threads/env-1/thread-1");
        }
      } finally {
        vi.unstubAllEnvs();
      }
    },
  );

  it.each(["en", "zh-CN"])("keeps unknown and conflicting statuses literal (%s)", (locale) => {
    vi.stubEnv("EXPO_PUBLIC_APP_LOCALE", locale);
    try {
      for (const [phase, status] of [
        ["running", "Settings"],
        ["running", "Working on my task"],
        ["running", " Working"],
        ["starting", "Done"],
        ["completed", "Approval"],
        ["unknown" as Row["phase"], "Working"],
      ] as const) {
        const props = aggregate([row(phase, status)]);
        const original = structuredClone(props);
        expect(inspect(liveLayout(props).banner).text.at(-1)).toBe(status);
        expect(inspect(widgetLayout(props)).text.at(-1)).toBe(status);
        expect(props).toEqual(original);
      }
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it.each(["en", "zh-CN"])(
    "renders timeline-owned empty and stale states without translating arbitrary subtitles (%s)",
    (locale) => {
      vi.stubEnv("EXPO_PUBLIC_APP_LOCALE", locale);
      try {
        for (const [source, english, chinese] of [
          [
            { kind: "signed-out" },
            "Sign in to T3 Connect to see agents",
            "登录 T3 Connect 以查看 Agent",
          ],
          [{ kind: "unavailable" }, "Couldn't reach T3 Connect", "无法连接 T3 Connect"],
          [{ kind: "loading" }, "Loading agents…", "正在加载 Agent…"],
          [{ kind: "snapshot", aggregate: null }, "No active agents", "没有活跃的 Agent"],
        ] satisfies readonly (readonly [AgentActivityWidgetSource, string, string])[]) {
          const props = agentActivityWidgetTimeline(source, now)[0]!.props;
          const original = structuredClone(props);
          expect(inspect(widgetLayout(props)).text.at(-1)).toBe(
            locale === "zh-CN" ? chinese : english,
          );
          expect(props).toEqual(original);
        }
        for (const subtitle of ["Settings", "Loading agents… (custom)", "No active agents ", ""]) {
          expect(inspect(widgetLayout({ activities: [], subtitle })).text.at(-1)).toBe(subtitle);
        }
        expect(inspect(widgetLayout(undefined)).text.at(-1)).toBe(
          locale === "zh-CN"
            ? "打开 T3 Code 以加载 Agent 动态"
            : "Open T3 Code to load agent activity",
        );
        const source = aggregate([row("running", "Working"), row("completed", "Done")]);
        const original = structuredClone(source);
        const timeline = agentActivityWidgetTimeline({ kind: "snapshot", aggregate: source }, now);
        const stale = timeline[1]!.props;
        expect(stale.activities[0]?.status).toBe("Out of date");
        const staleLabel = locale === "zh-CN" ? "状态已过期" : "Out of date";
        expect(inspect(widgetLayout(stale)).text).toContain(staleLabel);
        expect(inspect(liveLayout(source, true).banner).text).toContain(staleLabel);
        expect(source).toEqual(original);
      } finally {
        vi.unstubAllEnvs();
      }
    },
  );
});
