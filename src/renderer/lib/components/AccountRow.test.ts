// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/svelte";
import AccountRow from "./AccountRow.svelte";

const STATUS = { variant: "good" as const, label: "Active" };

describe("AccountRow", () => {
  it("renders label, detail, and status", () => {
    const { getByText } = render(AccountRow, {
      props: { label: "a@stub.test", detail: "5h ago", status: STATUS, enabled: true },
    });
    expect(getByText("a@stub.test")).toBeInTheDocument();
    expect(getByText("5h ago")).toBeInTheDocument();
    expect(getByText("Active")).toBeInTheDocument();
  });

  it("shows a fallback when there is no quota data", () => {
    const { getByText } = render(AccountRow, {
      props: { label: "a@stub.test", status: STATUS, enabled: true, quota: [] },
    });
    expect(getByText("No quota data")).toBeInTheDocument();
  });

  it("renders a single quota pool as one compact chip", () => {
    const { container, getByText } = render(AccountRow, {
      props: {
        label: "a@stub.test",
        status: STATUS,
        enabled: true,
        quota: [{ label: "weekly", remainingFraction: 0.4 }],
      },
    });
    const chips = container.querySelectorAll(".qchip");
    expect(chips.length).toBe(1);
    expect(getByText("60%")).toBeInTheDocument();
    expect(container.querySelector(".qmore")).not.toBeInTheDocument();
  });

  it("caps quota chips at 3 and shows a +N marker for the rest, keeping the row a single compact line", () => {
    const { container } = render(AccountRow, {
      props: {
        label: "a@stub.test",
        status: STATUS,
        enabled: true,
        quota: [
          { label: "5h", remainingFraction: 0.9 },
          { label: "weekly", remainingFraction: 0.5 },
          { label: "opus-weekly", remainingFraction: 0.2 },
          { label: "monthly", remainingFraction: 0.7 },
        ],
      },
    });

    const chips = container.querySelectorAll(".qchip");
    expect(chips.length).toBe(3);

    const more = container.querySelector(".qmore");
    expect(more).not.toBeNull();
    expect(more?.textContent).toBe("+1");

    const quotas = container.querySelector(".quotas") as HTMLElement;
    expect(quotas.querySelectorAll(".bar").length).toBe(0);
  });

  it("marks a quota chip as warn once usage crosses the threshold", () => {
    const { container } = render(AccountRow, {
      props: {
        label: "a@stub.test",
        status: STATUS,
        enabled: true,
        quota: [{ label: "5h", remainingFraction: 0.1 }],
      },
    });
    const chip = container.querySelector(".qchip");
    expect(chip?.classList.contains("warn")).toBe(true);
  });

  it("calls onToggle when the switch is flipped", async () => {
    const onToggle = vi.fn();
    const { getByRole } = render(AccountRow, {
      props: { label: "a@stub.test", status: STATUS, enabled: false, onToggle },
    });
    await fireEvent.click(getByRole("switch", { name: /a@stub.test enabled/i }));
    expect(onToggle).toHaveBeenCalledWith(true);
  });

  it("renders a Remove button only when onRemove is provided", () => {
    const { queryByRole, rerender } = render(AccountRow, {
      props: { label: "a@stub.test", status: STATUS, enabled: true },
    });
    expect(queryByRole("button", { name: "Remove" })).not.toBeInTheDocument();
  });

  it("calls onRemove when Remove is clicked", async () => {
    const onRemove = vi.fn();
    const { getByRole } = render(AccountRow, {
      props: { label: "a@stub.test", status: STATUS, enabled: true, onRemove },
    });
    await fireEvent.click(getByRole("button", { name: "Remove" }));
    expect(onRemove).toHaveBeenCalled();
  });
});
