import { describe, it, expect } from "vitest";
import { createProxyServer, makeDynamicResolver } from "@core-proxy/index.js";
import type { RoutingProfile } from "@core-proxy/index.js";
import type { StartedLoaderProxy } from "@core-loader/proxy-runner.js";
import type { LoadedProxyDef } from "../../sidecar/lib/proxyPlugins.js";
import { buildStartOptions, isRunning, resolveProxyProfile, start, stop } from "./proxyDaemon.js";

describe("buildStartOptions", () => {
  it("assembles the startLoaderProxy options for the given configDir and profile", () => {
    const profile = { marker: 1 } as unknown as RoutingProfile;
    const options = buildStartOptions("/some/dir", profile);
    expect(options.configDir).toBe("/some/dir");
    expect(options.port).toBe(34567);
    expect(options.createProxyServer).toBe(createProxyServer);
    expect(options.makeDynamicResolver).toBe(makeDynamicResolver);
    expect(options.profile).toBe(profile);
  });
});

describe("resolveProxyProfile", () => {
  it("throws a generic install hint when no proxy plugin is installed", async () => {
    await expect(resolveProxyProfile({ defs: async () => [] })).rejects.toThrow("no proxy plugin installed");
  });

  it("returns the first installed def's profile, whatever app it targets", async () => {
    const profile = { marker: 1 } as unknown as RoutingProfile;
    const defs: LoadedProxyDef[] = [{ app: "some-app", label: "S", profile: () => profile }];
    await expect(resolveProxyProfile({ defs: async () => defs })).resolves.toBe(profile);
  });
});

describe("isRunning", () => {
  it("resolves true when the probe succeeds", async () => {
    expect(await isRunning(async () => true)).toBe(true);
  });

  it("resolves false when the probe fails", async () => {
    expect(await isRunning(async () => false)).toBe(false);
  });
});

const fakeProfile = async (): Promise<RoutingProfile> => ({ marker: 1 }) as unknown as RoutingProfile;

describe("start", () => {
  it("concurrent calls invoke the injected starter only once", async () => {
    let calls = 0;
    const fakeHandle = { server: { close: async () => {} } } as unknown as StartedLoaderProxy;
    const starter = async (): Promise<StartedLoaderProxy> => {
      calls++;
      await new Promise((resolve) => setTimeout(resolve, 5));
      return fakeHandle;
    };

    await Promise.all([start(starter, fakeProfile), start(starter, fakeProfile)]);

    expect(calls).toBe(1);
    await stop();
  });

  it("clears the in-flight promise after a rejected starter, so a later start retries", async () => {
    let calls = 0;
    const failingStarter = async (): Promise<StartedLoaderProxy> => {
      calls++;
      throw new Error("boom");
    };

    await expect(start(failingStarter, fakeProfile)).rejects.toThrow("boom");
    expect(calls).toBe(1);

    const fakeHandle = { server: { close: async () => {} } } as unknown as StartedLoaderProxy;
    const succeedingStarter = async (): Promise<StartedLoaderProxy> => {
      calls++;
      return fakeHandle;
    };

    await start(succeedingStarter, fakeProfile);

    expect(calls).toBe(2);
    await stop();
  });

  it("propagates the not-installed error and clears the in-flight promise when no profile resolves", async () => {
    const starter = async (): Promise<StartedLoaderProxy> => {
      throw new Error("should not be called");
    };
    const rejectingProfile = async (): Promise<RoutingProfile> => {
      throw new Error("no proxy plugin installed");
    };

    await expect(start(starter, rejectingProfile)).rejects.toThrow("no proxy plugin installed");
    await expect(start(async () => ({ server: { close: async () => {} } }) as unknown as StartedLoaderProxy, fakeProfile)).resolves.toBeUndefined();
    await stop();
  });
});

describe("stop", () => {
  it("concurrent calls invoke the injected stopper only once", async () => {
    let closeCalls = 0;
    const fakeHandle = {
      server: {
        close: async () => {
          closeCalls++;
          await new Promise((resolve) => setTimeout(resolve, 5));
        },
      },
    } as unknown as StartedLoaderProxy;

    await start(async () => fakeHandle, fakeProfile);
    await Promise.all([stop(), stop()]);

    expect(closeCalls).toBe(1);
  });
});
