// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/svelte";
import PageHeader from "./PageHeader.svelte";

describe("PageHeader", () => {
  it("renders the title and optional subtitle", () => {
    const { getByRole, getByText } = render(PageHeader, { props: { title: "Plugins", subtitle: "All of them" } });
    expect(getByRole("heading", { name: "Plugins" })).toBeInTheDocument();
    expect(getByText("All of them")).toBeInTheDocument();
  });

  it("renders just the title when no subtitle is given", () => {
    const { getByRole, queryByText } = render(PageHeader, { props: { title: "Apps" } });
    expect(getByRole("heading", { name: "Apps" })).toBeInTheDocument();
    expect(queryByText("All of them")).toBeNull();
  });
});
