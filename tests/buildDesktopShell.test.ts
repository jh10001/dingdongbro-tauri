import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, describe, expect, it } from "bun:test";

import { buildDesktopShellBundle } from "../scripts/build-desktop-shell";

const tempDirs: string[] = [];

const createTempDir = async (prefix: string): Promise<string> => {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
};

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("desktop shell build script", () => {
  it("copies the native shell and writes a remote-url config file", async () => {
    const sourceDir = await createTempDir("dingdong-shell-source-");
    const outputDir = await createTempDir("dingdong-shell-output-");

    await mkdir(join(sourceDir, "assets"), { recursive: true });
    await writeFile(join(sourceDir, "index.html"), "<html><body>shell</body></html>\n", "utf8");
    await writeFile(join(sourceDir, "assets", "logo.txt"), "logo\n", "utf8");

    await buildDesktopShellBundle({
      sourceDir,
      outputDir,
      remoteUrl: "https://example.com/dingdong-survivors/",
      runtime: "mobile",
      log: () => {},
    });

    await expect(readFile(join(outputDir, "index.html"), "utf8")).resolves.toContain("shell");
    await expect(readFile(join(outputDir, "assets", "logo.txt"), "utf8")).resolves.toBe("logo\n");
    await expect(readFile(join(outputDir, "shell-config.js"), "utf8")).resolves.toBe(
      'window.__DINGDONG_REMOTE_URL__ = "https://example.com/dingdong-survivors/?native_runtime=tauri-mobile";\n',
    );
  });
});
