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
  it("keeps the shell project version isolated from the main repo version", async () => {
    const shellPackage = await readJson<{ version: string }>("../package.json");
    const rootPackage = await readJson<{ version: string }>("../../package.json");

    expect(shellPackage.version).toBe("0.3.2");
    expect(rootPackage.version).toBe("0.3.1");
    expect(shellPackage.version).not.toBe(rootPackage.version);
  });

  it("keeps shell package, Cargo, and tauri config versions in sync", async () => {
    const shellPackage = await readJson<{ version: string }>("../package.json");
    const tauriConfig = await readJson<{ version: string }>("../src-tauri/tauri.conf.json");
    const cargoVersion = await readCargoVersion();

    expect(cargoVersion).toBe(shellPackage.version);
    expect(tauriConfig.version).toBe(shellPackage.version);
  });

  it("owns the Tauri CLI dependency inside the shell project instead of the root repo", async () => {
    const shellPackage = await readJson<{ devDependencies?: Record<string, string> }>("../package.json");
    const rootPackage = await readJson<{ devDependencies?: Record<string, string> }>("../../package.json");

    expect(shellPackage.devDependencies?.["@tauri-apps/cli"]).toBe("2.10.1");
    expect(rootPackage.devDependencies?.["@tauri-apps/cli"]).toBeUndefined();
  });
});
