import { readFile } from "node:fs/promises";

import { describe, expect, it } from "bun:test";

import {
  appendNativeShellRuntimeQuery,
  createDesktopShellConfigSource,
  DEFAULT_NATIVE_RELEASE_REMOTE_URL,
  DESKTOP_NATIVE_SHELL_RUNTIME,
  DESKTOP_TAURI_SHELL_CONFIG_FILE,
  DESKTOP_TAURI_SHELL_OUTPUT_DIR,
  getDefaultMobilePlatformsForHost,
  getTauriDesktopBuildArgs,
  getTauriMobileBuildArgs,
  getTauriMobileIconArgs,
  getTauriMobileInitArgs,
  MACOS_UNIVERSAL_DESKTOP_TARGET,
  MOBILE_TAURI_ICON_INPUT,
  MOBILE_TAURI_IOS_ICON_BACKGROUND,
  MOBILE_NATIVE_SHELL_RUNTIME,
  NATIVE_RELEASE_REMOTE_URL_ENV,
  parseMobilePackagingArgs,
  resolveDesktopBuildEnv,
  resolveMobileBuildEnv,
  resolveNativeReleaseRemoteUrl,
  resolveTauriMobileProjectDir,
} from "../scripts/lib/nativePackaging";

describe("native packaging helpers", () => {
  it("uses host-aware default mobile packaging platforms", () => {
    expect(getDefaultMobilePlatformsForHost("linux")).toEqual(["android"]);
    expect(getDefaultMobilePlatformsForHost("darwin")).toEqual(["android", "ios"]);

    expect(parseMobilePackagingArgs([], "linux")).toEqual({
      buildNative: false,
      openProject: false,
      platforms: ["android"],
      tauriBuildArgs: [],
    });
    expect(parseMobilePackagingArgs([], "darwin")).toEqual({
      buildNative: false,
      openProject: false,
      platforms: ["android", "ios"],
      tauriBuildArgs: [],
    });
  });

  it("parses explicit platform build/open requests", () => {
    expect(parseMobilePackagingArgs(["android", "--build"], "linux")).toEqual({
      buildNative: true,
      openProject: false,
      platforms: ["android"],
      tauriBuildArgs: [],
    });
    expect(parseMobilePackagingArgs(["ios", "--open"], "darwin")).toEqual({
      buildNative: false,
      openProject: true,
      platforms: ["ios"],
      tauriBuildArgs: [],
    });
    expect(parseMobilePackagingArgs(["android", "--build", "--", "--apk", "--target", "aarch64"], "linux")).toEqual({
      buildNative: true,
      openProject: false,
      platforms: ["android"],
      tauriBuildArgs: ["--apk", "--target", "aarch64"],
    });
  });

  it("rejects invalid mobile packaging argument combinations", () => {
    expect(() => parseMobilePackagingArgs(["desktop"], "linux")).toThrow(/Unsupported mobile packaging platform/);
    expect(() => parseMobilePackagingArgs(["android", "--sync-only"], "linux")).toThrow(/Unsupported mobile packaging flag/);
    expect(() => parseMobilePackagingArgs(["android", "ios", "--build"], "darwin")).toThrow(/exactly one target platform/);
    expect(() => parseMobilePackagingArgs(["ios"], "linux")).toThrow(/iOS packaging requires macOS/);
  });

  it("builds tauri mobile init and build arguments", () => {
    expect(getTauriMobileInitArgs("android")).toEqual(["x", "--bun", "tauri", "android", "init", "--ci", "--skip-targets-install"]);
    expect(getTauriMobileBuildArgs("android")).toEqual(["x", "--bun", "tauri", "android", "build", "--ci"]);
    expect(getTauriMobileBuildArgs("ios", { openProject: true })).toEqual(["x", "--bun", "tauri", "ios", "build", "--open", "--ci"]);
    expect(getTauriMobileBuildArgs("android", { extraArgs: ["--apk", "--target", "aarch64"] })).toEqual([
      "x",
      "--bun",
      "tauri",
      "android",
      "build",
      "--ci",
      "--apk",
      "--target",
      "aarch64",
    ]);
    expect(getTauriMobileIconArgs()).toEqual([
      "x",
      "--bun",
      "tauri",
      "icon",
      MOBILE_TAURI_ICON_INPUT,
      "--ios-color",
      MOBILE_TAURI_IOS_ICON_BACKGROUND,
    ]);
    expect(resolveTauriMobileProjectDir("android")).toMatch(/src-tauri[\\/]gen[\\/]android$/);
    expect(resolveTauriMobileProjectDir("ios")).toMatch(/src-tauri[\\/]gen[\\/]apple$/);
  });

  it("marks desktop packages with the desktop runtime env override", () => {
    expect(resolveDesktopBuildEnv({ [NATIVE_RELEASE_REMOTE_URL_ENV]: "https://example.com/dingdong-survivors" })).toEqual({
      VITE_APP_RUNTIME: "desktop",
      NATIVE_RELEASE_REMOTE_URL: "https://example.com/dingdong-survivors/",
    });
  });

  it("marks mobile packaging builds as hosted shells", () => {
    expect(resolveMobileBuildEnv({ [NATIVE_RELEASE_REMOTE_URL_ENV]: "https://example.com/dingdong-survivors" })).toEqual({
      VITE_APP_RUNTIME: "mobile",
      NATIVE_RELEASE_REMOTE_URL: "https://example.com/dingdong-survivors/",
    });
  });

  it("normalizes and validates the hosted native release url", () => {
    expect(resolveNativeReleaseRemoteUrl({ [NATIVE_RELEASE_REMOTE_URL_ENV]: "https://example.com/dingdong-survivors" }))
      .toBe("https://example.com/dingdong-survivors/");
    expect(resolveNativeReleaseRemoteUrl({})).toBe(DEFAULT_NATIVE_RELEASE_REMOTE_URL);
    expect(() => resolveNativeReleaseRemoteUrl({ [NATIVE_RELEASE_REMOTE_URL_ENV]: "ftp://example.com/game" }))
      .toThrow(/must use http or https/);
  });

  it("creates a desktop shell config file source for the hosted shell url", () => {
    expect(appendNativeShellRuntimeQuery("https://example.com/dingdong-survivors/", DESKTOP_NATIVE_SHELL_RUNTIME)).toBe(
      "https://example.com/dingdong-survivors/?native_runtime=tauri-desktop",
    );
    expect(createDesktopShellConfigSource("https://example.com/dingdong-survivors/", MOBILE_NATIVE_SHELL_RUNTIME)).toBe(
      'window.__DINGDONG_REMOTE_URL__ = "https://example.com/dingdong-survivors/?native_runtime=tauri-mobile";\n',
    );
    expect(DESKTOP_TAURI_SHELL_CONFIG_FILE).toBe("shell-config.js");
    expect(DESKTOP_TAURI_SHELL_OUTPUT_DIR.endsWith("build/desktop-shell")).toBe(true);
  });

  it("builds macOS desktop packages as universal binaries", () => {
    expect(getTauriDesktopBuildArgs("linux")).toEqual(["x", "--bun", "tauri", "build"]);
    expect(getTauriDesktopBuildArgs("win32")).toEqual(["x", "--bun", "tauri", "build"]);
    expect(getTauriDesktopBuildArgs("darwin")).toEqual([
      "x",
      "--bun",
      "tauri",
      "build",
      "--target",
      MACOS_UNIVERSAL_DESKTOP_TARGET,
    ]);
  });

  it("points Tauri packaging at the generated desktop shell frontend", async () => {
    const tauriConfig = JSON.parse(
      await readFile(new URL("../src-tauri/tauri.conf.json", import.meta.url), "utf8"),
    ) as {
      build?: { frontendDist?: string; beforeBuildCommand?: string };
    };

    expect(tauriConfig.build).toMatchObject({
      frontendDist: "../build/desktop-shell",
      beforeBuildCommand: "bun scripts/build-desktop-shell.ts",
    });
  });
});
