// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent, waitFor, within, screen } from "@testing-library/svelte";
import { get } from "svelte/store";
import type { AccountView } from "@cairn/shared";
import { stubCairn } from "../testing.js";
import { toasts, toast } from "../toast.js";
import Accounts from "./Accounts.svelte";

const PROVIDERS = [
  { id: "stub", label: "Stub", accountPool: "stub", sharedWith: [], pluginName: "stub", authKind: "oauth" as const, accountCount: 2, enabled: true, exposure: { claude: true, opencode: false } },
];

const ACCOUNTS = [
  {
    id: "acc1",
    email: "a@stub.test",
    status: "active" as const,
    enabled: true,
    quota: [{ label: "5h", remainingFraction: 0.4 }],
  },
  {
    id: "acc2",
    email: "b@stub.test",
    status: "rate-limited" as const,
    enabled: false,
    quota: [],
  },
];

describe("Accounts screen", () => {
  beforeEach(() => {
    get(toasts).slice().forEach((t) => toast.dismiss(t.id));
  });

  it("renders account rows per provider, toggles enable, and removes an account", async () => {
    const accountsEnable = vi.fn(async () => ({ ok: true, data: undefined }) as const);
    const accountsRemove = vi.fn(async () => ({ ok: true, data: undefined }) as const);
    stubCairn({
      providersList: async () => ({ ok: true, data: PROVIDERS }),
      accountsList: async (provider) => (provider === "stub" ? { ok: true, data: ACCOUNTS } : { ok: true, data: [] }),
      accountsEnable,
      accountsRemove,
    });

    const { getByText, getByRole, getAllByRole } = render(Accounts);

    await waitFor(() => expect(getByText("a@stub.test")).toBeTruthy());
    expect(getByText("b@stub.test")).toBeTruthy();
    expect(getByText(/60%/)).toBeTruthy();

    const acc2Switch = getByRole("switch", { name: /b@stub.test enabled/i });
    await fireEvent.click(acc2Switch);
    expect(accountsEnable).toHaveBeenCalledWith("stub", "acc2", true);

    const removeButtons = getAllByRole("button", { name: "Remove" });
    await fireEvent.click(removeButtons[0]);
    expect(accountsRemove).not.toHaveBeenCalled();
    const dialog = within(await screen.findByRole("dialog"));
    await fireEvent.click(dialog.getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(accountsRemove).toHaveBeenCalledWith("stub", "acc1"));
  });

  it("shows an inline error when providersList fails", async () => {
    stubCairn({ providersList: async () => ({ ok: false, error: "boom" }) });
    const { getByText } = render(Accounts);
    await waitFor(() => expect(getByText(/boom/i)).toBeTruthy());
  });

  it("retries providersList when the retry button is clicked", async () => {
    const providersList = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, error: "boom" })
      .mockResolvedValueOnce({ ok: true, data: PROVIDERS });
    stubCairn({
      providersList,
      accountsList: async (provider) => (provider === "stub" ? { ok: true, data: ACCOUNTS } : { ok: true, data: [] }),
    });

    const { getByText, getByRole } = render(Accounts);
    await waitFor(() => expect(getByText(/boom/i)).toBeTruthy());

    const retryButton = getByRole("button", { name: /retry/i });
    await fireEvent.click(retryButton);

    expect(providersList).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(getByText("a@stub.test")).toBeTruthy());
  });

  it("shows an inline error when accountsList fails for a provider", async () => {
    stubCairn({
      providersList: async () => ({ ok: true, data: PROVIDERS }),
      accountsList: async () => ({ ok: false, error: "no accounts" }),
    });
    const { getByText } = render(Accounts);
    await waitFor(() => expect(getByText(/no accounts/i)).toBeTruthy());
  });

  const TWO_PROVIDERS = [
    { id: "alpha", label: "Alpha Team", accountPool: "alpha", sharedWith: [], pluginName: "alpha", authKind: "oauth" as const, accountCount: 1, enabled: true, exposure: { claude: true, opencode: false } },
    { id: "beta", label: "Beta Team", accountPool: "beta", sharedWith: [], pluginName: "beta", authKind: "oauth" as const, accountCount: 1, enabled: true, exposure: { claude: true, opencode: false } },
  ];

  function twoProviderAccounts(provider: string): { ok: true; data: AccountView[] } {
    if (provider === "alpha") return { ok: true, data: [{ id: "a1", email: "foo@x.test", status: "active", enabled: true, quota: [] }] };
    return { ok: true, data: [{ id: "b1", email: "bar@x.test", status: "active", enabled: true, quota: [] }] };
  }

  it("empty search shows all provider groups", async () => {
    stubCairn({
      providersList: async () => ({ ok: true, data: TWO_PROVIDERS }),
      accountsList: async (provider) => twoProviderAccounts(provider),
    });

    const { getByText } = render(Accounts);
    await waitFor(() => expect(getByText("foo@x.test")).toBeTruthy());
    expect(getByText("bar@x.test")).toBeTruthy();
  });

  it("search narrows to matching accounts across providers", async () => {
    stubCairn({
      providersList: async () => ({ ok: true, data: TWO_PROVIDERS }),
      accountsList: async (provider) => twoProviderAccounts(provider),
    });

    const { getByPlaceholderText, getByText, queryByText } = render(Accounts);
    await waitFor(() => expect(getByText("foo@x.test")).toBeTruthy());

    const input = getByPlaceholderText("Search accounts");
    await fireEvent.input(input, { target: { value: "foo" } });

    await waitFor(() => expect(queryByText("bar@x.test")).toBeNull(), { timeout: 1000 });
    expect(getByText("foo@x.test")).toBeTruthy();
  });

  it("virtualizes a provider group once its account count exceeds the threshold", async () => {
    const data = Array.from({ length: 25 }, (_, i) => ({
      id: `acc-${i}`,
      email: `person${i}@stub.test`,
      status: "active" as const,
      enabled: true,
      quota: [],
    }));
    stubCairn({
      providersList: async () => ({ ok: true, data: PROVIDERS }),
      accountsList: async (provider) => (provider === "stub" ? { ok: true, data } : { ok: true, data: [] }),
    });

    const { getByText, container } = render(Accounts);
    await waitFor(() => expect(getByText("person0@stub.test")).toBeTruthy());

    const groupButtons = Array.from(container.querySelectorAll("button.hd"));
    const stubButton = groupButtons.find((b) => b.querySelector(".lbl")?.textContent === "Stub");
    expect(stubButton?.querySelector(".cnt")?.textContent).toBe("25");

    const renderedRows = container.querySelectorAll(".row").length;
    expect(renderedRows).toBeGreaterThan(0);
    expect(renderedRows).toBeLessThan(25);
  });

  it("toasts an error when toggling an account fails, without a success toast", async () => {
    stubCairn({
      providersList: async () => ({ ok: true, data: PROVIDERS }),
      accountsList: async (provider) => (provider === "stub" ? { ok: true, data: ACCOUNTS } : { ok: true, data: [] }),
      accountsEnable: async () => ({ ok: false, error: "toggle boom" }),
    });

    const { getByRole } = render(Accounts);
    const acc2Switch = await waitFor(() => getByRole("switch", { name: /b@stub.test enabled/i }));
    await fireEvent.click(acc2Switch);

    await waitFor(() => expect(get(toasts).some((t) => t.kind === "error" && t.message === "toggle boom")).toBe(true));
    expect(get(toasts).some((t) => t.kind === "success")).toBe(false);
  });

  it("toasts success when removing an account succeeds", async () => {
    stubCairn({
      providersList: async () => ({ ok: true, data: PROVIDERS }),
      accountsList: async (provider) => (provider === "stub" ? { ok: true, data: ACCOUNTS } : { ok: true, data: [] }),
      accountsRemove: async () => ({ ok: true, data: undefined }),
    });

    const { getAllByRole } = render(Accounts);
    const removeButtons = await waitFor(() => getAllByRole("button", { name: "Remove" }));
    await fireEvent.click(removeButtons[0]);
    const dialog = within(await screen.findByRole("dialog"));
    await fireEvent.click(dialog.getByRole("button", { name: "Remove" }));

    await waitFor(() => expect(get(toasts).some((t) => t.kind === "success" && t.message === "Account removed")).toBe(true));
  });

  it("toasts an error when removing an account fails", async () => {
    stubCairn({
      providersList: async () => ({ ok: true, data: PROVIDERS }),
      accountsList: async (provider) => (provider === "stub" ? { ok: true, data: ACCOUNTS } : { ok: true, data: [] }),
      accountsRemove: async () => ({ ok: false, error: "remove boom" }),
    });

    const { getAllByRole } = render(Accounts);
    const removeButtons = await waitFor(() => getAllByRole("button", { name: "Remove" }));
    await fireEvent.click(removeButtons[0]);
    const dialog = within(await screen.findByRole("dialog"));
    await fireEvent.click(dialog.getByRole("button", { name: "Remove" }));

    await waitFor(() => expect(get(toasts).some((t) => t.kind === "error" && t.message === "remove boom")).toBe(true));
  });

  it("opens the add-account dialog for a provider chosen from the top-level control", async () => {
    const accountsLoginBegin = vi.fn(async () => ({ ok: true, data: { url: "https://x/login", instructions: "" } }) as const);
    stubCairn({
      providersList: async () => ({ ok: true, data: PROVIDERS }),
      accountsList: async (provider) => (provider === "stub" ? { ok: true, data: ACCOUNTS } : { ok: true, data: [] }),
      accountsLoginBegin,
    });

    const { getByText, getByRole, findByRole } = render(Accounts);
    await waitFor(() => expect(getByText("a@stub.test")).toBeTruthy());

    await fireEvent.click(getByRole("button", { name: "Add account" }));

    const menuItem = await findByRole("menuitem", { name: /^Stub/ });
    await fireEvent.click(menuItem);

    await findByRole("dialog", { name: /add stub account/i });
    await waitFor(() => expect(accountsLoginBegin).toHaveBeenCalledWith("stub"));
  });

  // A provider you have not signed into is not worth a section of its own. At the ~50
  // installed providers this screen has to hold, giving every one a group turned it into a
  // page of empty boxes, and listing accounts for all of them just to find that out cost a
  // round trip each. The count on the provider row answers that without any of them, and the
  // provider stays reachable by name.
  it("keeps a provider with no accounts out of the list until it is searched for, then offers to add one", async () => {
    const providersWithEmpty = [
      { id: "stub", label: "Stub", accountPool: "stub", sharedWith: [], pluginName: "stub", authKind: "oauth" as const, accountCount: 2, enabled: true, exposure: { claude: true, opencode: false } },
      { id: "ghost", label: "Ghost", accountPool: "ghost", sharedWith: [], pluginName: "ghost", authKind: "oauth" as const, accountCount: 0, enabled: true, exposure: { claude: true, opencode: false } },
    ];
    const accountsLoginBegin = vi.fn(async () => ({ ok: true, data: { url: "https://x/login", instructions: "" } }) as const);
    const accountsList = vi.fn(async (provider: string) => (provider === "stub" ? { ok: true, data: ACCOUNTS } : { ok: true, data: [] }) as const);
    stubCairn({
      providersList: async () => ({ ok: true, data: providersWithEmpty }),
      accountsList,
      accountsLoginBegin,
    });

    const { getByText, getByLabelText, container, findByRole } = render(Accounts);
    await waitFor(() => expect(getByText("a@stub.test")).toBeTruthy());

    const groupLabels = () => Array.from(container.querySelectorAll("section.grp .lbl")).map((node) => node.textContent);
    expect(groupLabels()).toEqual(["Stub"]);
    expect(accountsList).not.toHaveBeenCalledWith("ghost");

    await fireEvent.input(getByLabelText("Search accounts"), { target: { value: "ghost" } });
    await waitFor(() => expect(groupLabels()).toEqual(["Ghost"]));

    const ghostGroup = Array.from(container.querySelectorAll("section.grp"))
      .find((group) => group.querySelector(".lbl")?.textContent === "Ghost");
    await fireEvent.click(within(ghostGroup as HTMLElement).getByRole("button", { name: "Add account" }));

    await findByRole("dialog", { name: /add ghost account/i });
    await waitFor(() => expect(accountsLoginBegin).toHaveBeenCalledWith("ghost"));
  });
});
