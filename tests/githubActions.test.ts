import { readFile } from "node:fs/promises";

import { describe, expect, it } from "bun:test";

const WORKFLOW_URL = new URL("../.github/workflows/build-native-shell.yml", import.meta.url);

const readWorkflow = async (): Promise<string> => readFile(WORKFLOW_URL, "utf8");

describe("github actions workflow", () => {
  it("keeps desktop and android build jobs wired in", async () => {
    const workflow = await readWorkflow();

    for (const snippet of [
      "name: build-native-shell",
      "workflow_dispatch:",
      "ubuntu-22.04",
      "windows-latest",
      "macos-latest",
      "bun run build:desktop",
      "bun run package:mobile:android",
      "actions/upload-artifact@v4",
    ]) {
      expect(workflow).toContain(snippet);
    }
  });

  it("keeps Android CI self-contained", async () => {
    const workflow = await readWorkflow();

    for (const snippet of [
      "actions/setup-java@v4",
      "android-actions/setup-android@v3",
      "NDK_HOME",
      "aarch64-linux-android",
      "armv7-linux-androideabi",
      "x86_64-linux-android",
    ]) {
      expect(workflow).toContain(snippet);
    }
  });
});
