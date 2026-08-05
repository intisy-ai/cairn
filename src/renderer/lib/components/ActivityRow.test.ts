// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/svelte";
import ActivityRow from "./ActivityRow.svelte";
import type { ActivityRecord } from "@cairn/shared";

function record(overrides: Partial<ActivityRecord> = {}): ActivityRecord {
  return {
    id: "src-1",
    ts: Date.now(),
    home: "/tmp/home-a",
    topic: "plugin.installed",
    action: "updated",
    actor: "user",
    impact: "notice",
    source: "plugin-updater",
    subject: { kind: "plugin", id: "demo-plugin", label: "demo-plugin" },
    details: {},
    text: "Updated demo-plugin",
    origin: { app: "someapp", home: "/tmp/home-a" },
    cause: { kind: "user", surface: "plugins" },
    trace: { id: "trace-1" },
    ...overrides,
  } as ActivityRecord;
}

const noop = (): void => {};

describe("ActivityRow", () => {
  it("names the app it ran in, and the app it affected when they differ", () => {
    const { getByText, getByTestId } = render(ActivityRow, {
      props: { record: record({ target: { app: "otherapp", home: "/tmp/home-b" } }), expanded: false, ontoggle: noop },
    });
    // humanizeId is the tab's generic label helper, so an id renders capitalized
    expect(getByText("Someapp")).toBeInTheDocument();
    expect(getByTestId("activity-target")).toHaveTextContent("Otherapp");
  });

  it("shows no target badge when the action affected only its own app", () => {
    const { queryByTestId } = render(ActivityRow, {
      props: { record: record(), expanded: false, ontoggle: noop },
    });
    expect(queryByTestId("activity-target")).toBeNull();
  });

  it("falls back to the affected home when a target carries no app id", () => {
    const { getByTestId } = render(ActivityRow, {
      props: { record: record({ target: { home: "/tmp/home-b" } }), expanded: false, ontoggle: noop },
    });
    expect(getByTestId("activity-target")).toHaveTextContent("home-b");
  });

  it("states the cause and, when present, the outcome and duration", () => {
    const { getByTestId } = render(ActivityRow, {
      props: { record: record({ outcome: "failed", durationMs: 1500 }), expanded: true, ontoggle: noop },
    });
    const line = getByTestId("activity-cause");
    expect(line).toHaveTextContent("user");
    expect(line).toHaveTextContent("plugins");
    expect(line).toHaveTextContent("failed");
    expect(line).toHaveTextContent("1.5s");
  });

  it("shows sub-second durations in milliseconds", () => {
    const { getByTestId } = render(ActivityRow, {
      props: { record: record({ durationMs: 240 }), expanded: true, ontoggle: noop },
    });
    expect(getByTestId("activity-cause")).toHaveTextContent("240ms");
  });

  it("shows before and after values, and says redacted instead of a secret", () => {
    const { getByText, getAllByText } = render(ActivityRow, {
      props: {
        record: record({
          changes: [
            { key: "logging", from: true, to: false },
            { key: "apiKey", redacted: true },
          ],
        }),
        expanded: true,
        ontoggle: noop,
      },
    });
    expect(getByText("logging")).toBeInTheDocument();
    expect(getByText("true")).toBeInTheDocument();
    expect(getByText("false")).toBeInTheDocument();
    expect(getByText("apiKey")).toBeInTheDocument();
    expect(getAllByText(/redacted/i).length).toBeGreaterThan(0);
  });

  it("renders a missing value as unset rather than as the word undefined", () => {
    const { getByText, queryByText } = render(ActivityRow, {
      props: { record: record({ changes: [{ key: "logging", to: false }] }), expanded: true, ontoggle: noop },
    });
    expect(getByText("(unset)")).toBeInTheDocument();
    expect(queryByText("undefined")).toBeNull();
  });

  it("hides the change table and the raw payload until the row is expanded", () => {
    const { queryByTestId } = render(ActivityRow, {
      props: { record: record({ changes: [{ key: "logging", from: true, to: false }] }), expanded: false, ontoggle: noop },
    });
    expect(queryByTestId("activity-changes")).toBeNull();
    expect(queryByTestId("activity-details")).toBeNull();
  });

  it("keeps the cascade toggle separate from the row's own payload", async () => {
    const { getByTestId, getByRole, queryByTestId } = render(ActivityRow, {
      props: { record: record(), expanded: false, followerCount: 2, ontoggle: noop, oncascade: noop },
    });

    const cascade = getByTestId("activity-followers");
    expect(cascade).toHaveTextContent("+2");
    expect(cascade).toHaveAttribute("aria-expanded", "false");
    // the row's own control is a separate button, so the payload is still reachable
    expect(getByRole("button", { expanded: false, name: /Updated demo-plugin/ })).toBeInTheDocument();
    expect(queryByTestId("activity-details")).toBeNull();
  });

  it("offers no cascade toggle when nothing followed, or when no handler is given", () => {
    const withoutFollowers = render(ActivityRow, {
      props: { record: record(), expanded: false, followerCount: 0, ontoggle: noop, oncascade: noop },
    });
    expect(withoutFollowers.queryByTestId("activity-followers")).toBeNull();

    const withoutHandler = render(ActivityRow, {
      props: { record: record(), expanded: false, followerCount: 3, ontoggle: noop },
    });
    expect(withoutHandler.queryByTestId("activity-followers")).toBeNull();
  });

  it("renders a v1 record that carries no origin, cause, or target", () => {
    const bare = {
      id: "old-1", ts: Date.now(), home: "/tmp/home-a", topic: "notification", action: "notified",
      actor: "system", impact: "info", source: "core-proxy", details: {}, text: "Switched provider",
    } as unknown as ActivityRecord;
    const { getByText } = render(ActivityRow, { props: { record: bare, expanded: false, ontoggle: noop } });
    expect(getByText("Switched provider")).toBeInTheDocument();
  });
});
