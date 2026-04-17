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
});
