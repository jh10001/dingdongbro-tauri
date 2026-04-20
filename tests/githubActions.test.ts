import { readFile } from "node:fs/promises";

import { describe, expect, it } from "bun:test";

const WORKFLOW_URL = new URL("../.github/workflows/build-native-shell.yml", import.meta.url);

const readWorkflow = async (): Promise<string> => readFile(WORKFLOW_URL, "utf8");

describe("github actions workflow", () => {
  it("keeps desktop and android build jobs wired in", async () => {
    const workflow = await readWorkflow();

    for (const snippet of [
      "name: build-native-shell",
      'BUN_VERSION: "1.3.11"',
      'FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: "true"',
      "workflow_dispatch:",
      "ubuntu-22.04",
      "windows-latest",
      "macos-latest",
      "actions/checkout@v6",
      "actions/cache@v5",
      "~/.bun/install/cache",
      "node_modules",
      "bun-version: ${{ env.BUN_VERSION }}",
      "workspaces: ./src-tauri -> target",
      "windows-tauri-tools-${{ hashFiles('bun.lock', 'package.json') }}",
      "~/AppData/Local/tauri",
      "bun run build:desktop",
      "Package portable Windows desktop executable",
      "7z a -t7z -mx=9",
      "dingdongbro-desktop-windows-latest-portable.7z",
      "bun run package:mobile:android",
      "bun run package:mobile:android:arm64",
      "Android (signed)",
      "iOS (unsigned)",
      "bun run open:mobile:ios",
      "Timed out waiting for Tauri iOS bridge",
      "TAURI_IOS_OPEN_PID",
      "server-addr",
      "xcodebuild archive",
      "CODE_SIGNING_REQUIRED=NO",
      "CODE_SIGNING_ALLOWED=NO",
      "dingdongbro-desktop-${{ matrix.os }}",
      "dingdongbro-android",
      "dingdongbro-ios",
      "actions/upload-artifact@v7",
    ]) {
      expect(workflow).toContain(snippet);
    }
  });

  it("keeps Android CI self-contained", async () => {
    const workflow = await readWorkflow();

    for (const snippet of [
      "actions/setup-java@v5",
      "cache: gradle",
      "android-actions/setup-android@v4",
      "accept-android-sdk-licenses: false",
      "Restore Bun dependency cache",
      "key: ${{ runner.os }}-bun-${{ env.BUN_VERSION }}-${{ hashFiles('bun.lock', 'package.json') }}",
      "${{ runner.os }}-bun-${{ env.BUN_VERSION }}-",
      "restore-keys: |",
      "bun run package:mobile android",
      "cache-dependency-path:",
      "ANDROID_RELEASE_KEYSTORE_BASE64",
      "ANDROID_RELEASE_KEYSTORE_PASSWORD",
      "ANDROID_RELEASE_KEY_ALIAS",
      "Validate Android signing secrets",
      "set +o pipefail",
      "NDK_HOME",
      "aarch64-linux-android",
      "armv7-linux-androideabi",
      "x86_64-linux-android",
      "aarch64-apple-ios",
      "aarch64-apple-ios-sim",
      "x86_64-apple-ios",
    ]) {
      expect(workflow).toContain(snippet);
    }
  });
});
