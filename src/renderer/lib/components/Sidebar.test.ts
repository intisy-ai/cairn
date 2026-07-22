// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/svelte";
import { stubCairn } from "../testing.js";
import Sidebar from "./Sidebar.svelte";

describe("Sidebar", () => {
  it("hides the Routing nav item when hasRouting is false", () => {
    stubCairn();
    const { queryByText } = render(Sidebar, { props: { hasRouting: false } });
    expect(queryByText("Routing")).toBeNull();
  });

  it("shows the Routing nav item when hasRouting is true", () => {
    stubCairn();
    const { getByText } = render(Sidebar, { props: { hasRouting: true } });
    expect(getByText("Routing")).toBeTruthy();
  });
});
