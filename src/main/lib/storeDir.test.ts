import { describe, it, expect } from "vitest";
import { resolveStoreDir } from "./storeDir.js";

describe("resolveStoreDir", () => {
  it("uses %APPDATA%/intisy on win32", () => {
    expect(resolveStoreDir({ APPDATA: "C:\\Users\\x\\AppData\\Roaming" }, "win32", "C:\\Users\\x"))
      .toBe("C:\\Users\\x\\AppData\\Roaming\\intisy");
  });
  it("uses Application Support on darwin", () => {
    expect(resolveStoreDir({}, "darwin", "/Users/x")).toBe("/Users/x/Library/Application Support/intisy");
  });
  it("honors XDG_CONFIG_HOME on linux, else ~/.config/intisy", () => {
    expect(resolveStoreDir({ XDG_CONFIG_HOME: "/cfg" }, "linux", "/home/x")).toBe("/cfg/intisy");
    expect(resolveStoreDir({}, "linux", "/home/x")).toBe("/home/x/.config/intisy");
  });
});
