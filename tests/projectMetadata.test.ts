import { readFile } from "node:fs/promises";

import { describe, expect, it } from "bun:test";

const readJson = async <T>(relativePath: string): Promise<T> => JSON.parse(
  await readFile(new URL(relativePath, import.meta.url), "utf8"),
) as T;

const readCargoVersion = async (): Promise<string | null> => {
  const cargoToml = await readFile(new URL("../src-tauri/Cargo.toml", import.meta.url), "utf8");
  const match = cargoToml.match(/^version = "([^"]+)"$/m);

  return match?.[1] ?? null;
};

describe("tauri shell project metadata", () => {
  it("keeps shell package, Cargo, and tauri config versions in sync", async () => {
    const shellPackage = await readJson<{ version: string }>("../package.json");
    const tauriConfig = await readJson<{ version: string }>("../src-tauri/tauri.conf.json");
    const cargoVersion = await readCargoVersion();

    expect(cargoVersion).toBe(shellPackage.version);
    expect(tauriConfig.version).toBe(shellPackage.version);
  });

  it("keeps the shell-local Tauri CLI dependency pinned in the shell project", async () => {
    const shellPackage = await readJson<{ devDependencies?: Record<string, string> }>("../package.json");

    expect(shellPackage.devDependencies?.["@tauri-apps/cli"]).toBe("2.10.1");
  });

  it("uses the requested Chinese product and window title for the shell app", async () => {
    const tauriConfig = await readJson<{
      productName?: string;
      bundle?: { windows?: { wix?: { language?: string } } };
      app?: { windows?: Array<{ title?: string }> };
    }>("../src-tauri/tauri.conf.json");

    expect(tauriConfig.productName).toBe("叮咚兄弟");
    expect(tauriConfig.app?.windows?.[0]?.title).toBe("叮咚兄弟");
    expect(tauriConfig.bundle?.windows?.wix?.language).toBe("zh-CN");
  });

  it("allows the hosted desktop shell origin to use native fullscreen window APIs", async () => {
    const capability = await readJson<{
      remote?: { urls?: string[] };
      permissions?: string[];
      windows?: string[];
    }>("../src-tauri/capabilities/default.json");

    expect(capability.windows).toContain("main");
    expect(capability.remote?.urls).toContain("https://dingdongbro.272.chat/*");
    expect(capability.permissions).toContain("core:window:allow-set-fullscreen");
  });

  it("overrides only the iOS packaged app name to ASCII for crash triage", async () => {
    const iosConfig = await readJson<{
      productName?: string;
      mainBinaryName?: string;
    }>("../src-tauri/tauri.ios.conf.json");
    const iosInfoPlist = await readFile(new URL("../src-tauri/Info.ios.plist", import.meta.url), "utf8");
    const iosZhHansInfoPlistStrings = await readFile(
      new URL("../src-tauri/zh-Hans.lproj/InfoPlist.strings", import.meta.url),
      "utf8",
    );
    const iosZhHantInfoPlistStrings = await readFile(
      new URL("../src-tauri/zh-Hant.lproj/InfoPlist.strings", import.meta.url),
      "utf8",
    );

    expect(iosConfig.productName).toBe("DingDongBro");
    expect(iosConfig.mainBinaryName).toBe("DingDongBro");
    expect(iosInfoPlist).toContain("<key>CFBundleDisplayName</key>");
    expect(iosInfoPlist).toContain("<string>DingDongBro</string>");
    expect(iosInfoPlist).toContain("<key>CFBundleName</key>");
    expect(iosInfoPlist).toContain("<string>DingDongBro</string>");
    expect(iosZhHansInfoPlistStrings).toContain('"CFBundleDisplayName" = "叮咚兄弟";');
    expect(iosZhHantInfoPlistStrings).toContain('"CFBundleDisplayName" = "叮咚兄弟";');
  });
});
