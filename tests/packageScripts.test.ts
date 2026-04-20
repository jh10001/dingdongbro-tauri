import { describe, expect, it } from "bun:test";

import {
  ANDROID_RELEASE_KEY_ALIAS_ENV,
  ANDROID_RELEASE_KEYSTORE_BASE64_ENV,
  ANDROID_RELEASE_KEYSTORE_PASSWORD_ENV,
} from "../scripts/lib/androidSigning";
import { buildDesktopPackage } from "../scripts/package-desktop";
import { packageMobile } from "../scripts/package-mobile";

interface CommandCall {
  command: string;
  args: string[];
  options?: {
    cwd?: string;
    envOverrides?: Record<string, string>;
  };
}

const createCommandRecorder = (): {
  calls: CommandCall[];
  execute: (command: string, args: string[], options?: CommandCall["options"]) => void;
} => {
  const calls: CommandCall[] = [];

  return {
    calls,
    execute: (command, args, options) => {
      calls.push({ command, args, options });
    },
  };
};

describe("tauri shell package scripts", () => {
  it("runs desktop packaging inside the shell project with desktop env overrides", () => {
    const { calls, execute } = createCommandRecorder();

    buildDesktopPackage({
      env: { NATIVE_RELEASE_REMOTE_URL: "https://example.com/shell" },
      execute,
      projectRoot: "/tmp/tauri-shell",
    });

    expect(calls).toEqual([
      {
        command: "bun",
        args: ["tauri", "build"],
        options: {
          cwd: "/tmp/tauri-shell",
          envOverrides: {
            NATIVE_RELEASE_REMOTE_URL: "https://example.com/shell/",
            VITE_APP_RUNTIME: "desktop",
          },
        },
      },
    ]);
  });

  it("initializes a missing mobile project before building", () => {
    const { calls, execute } = createCommandRecorder();
    const signingCalls: Array<{ projectRoot: string; env: Record<string, string | undefined> }> = [];
    const policyCalls: Array<{ platforms: string[]; projectRoot: string }> = [];
    const env = {
      [ANDROID_RELEASE_KEYSTORE_BASE64_ENV]: Buffer.from("fake-keystore", "utf8").toString("base64"),
      [ANDROID_RELEASE_KEYSTORE_PASSWORD_ENV]: "store-password",
      [ANDROID_RELEASE_KEY_ALIAS_ENV]: "upload",
    };

    packageMobile({
      args: ["android", "--build"],
      env,
      execute,
      hostPlatform: "linux",
      pathExists: () => false,
      prepareAndroidReleaseSigning: (projectRoot, signingEnv) => {
        signingCalls.push({ projectRoot, env: signingEnv });
      },
      prepareMobileShellPolicy: (platforms, projectRoot) => {
        policyCalls.push({ platforms, projectRoot });
      },
      projectRoot: "/tmp/tauri-shell",
    });

    expect(signingCalls).toEqual([{ projectRoot: "/tmp/tauri-shell", env }]);
    expect(policyCalls).toEqual([{ platforms: ["android"], projectRoot: "/tmp/tauri-shell" }]);

    expect(calls).toEqual([
      {
        command: "bun",
        args: ["tauri", "android", "init", "--ci", "--skip-targets-install"],
        options: {
          cwd: "/tmp/tauri-shell",
          envOverrides: {
            NATIVE_RELEASE_REMOTE_URL: "https://dingdongbro.272.chat/",
            VITE_APP_RUNTIME: "mobile",
          },
        },
      },
      {
        command: "bun",
        args: ["tauri", "icon", "src-tauri/icons/icon.png", "--ios-color", "#ffffff"],
        options: {
          cwd: "/tmp/tauri-shell",
          envOverrides: {
            NATIVE_RELEASE_REMOTE_URL: "https://dingdongbro.272.chat/",
            VITE_APP_RUNTIME: "mobile",
          },
        },
      },
      {
        command: "bun",
        args: ["tauri", "android", "build", "--ci"],
        options: {
          cwd: "/tmp/tauri-shell",
          envOverrides: {
            NATIVE_RELEASE_REMOTE_URL: "https://dingdongbro.272.chat/",
            VITE_APP_RUNTIME: "mobile",
          },
        },
      },
    ]);
  });

  it("skips mobile init when the generated project already exists", () => {
    const { calls, execute } = createCommandRecorder();
    const signingCalls: string[] = [];
    const policyCalls: Array<{ platforms: string[]; projectRoot: string }> = [];

    packageMobile({
      args: ["android", "--build"],
      env: {
        [ANDROID_RELEASE_KEYSTORE_BASE64_ENV]: Buffer.from("fake-keystore", "utf8").toString("base64"),
        [ANDROID_RELEASE_KEYSTORE_PASSWORD_ENV]: "store-password",
        [ANDROID_RELEASE_KEY_ALIAS_ENV]: "upload",
      },
      execute,
      hostPlatform: "linux",
      pathExists: () => true,
      prepareAndroidReleaseSigning: (projectRoot) => {
        signingCalls.push(projectRoot);
      },
      prepareMobileShellPolicy: (platforms, projectRoot) => {
        policyCalls.push({ platforms, projectRoot });
      },
      projectRoot: "/tmp/tauri-shell",
    });

    expect(signingCalls).toEqual(["/tmp/tauri-shell"]);
    expect(policyCalls).toEqual([{ platforms: ["android"], projectRoot: "/tmp/tauri-shell" }]);

    expect(calls).toEqual([
      {
        command: "bun",
        args: ["tauri", "icon", "src-tauri/icons/icon.png", "--ios-color", "#ffffff"],
        options: {
          cwd: "/tmp/tauri-shell",
          envOverrides: {
            NATIVE_RELEASE_REMOTE_URL: "https://dingdongbro.272.chat/",
            VITE_APP_RUNTIME: "mobile",
          },
        },
      },
      {
        command: "bun",
        args: ["tauri", "android", "build", "--ci"],
        options: {
          cwd: "/tmp/tauri-shell",
          envOverrides: {
            NATIVE_RELEASE_REMOTE_URL: "https://dingdongbro.272.chat/",
            VITE_APP_RUNTIME: "mobile",
          },
        },
      },
    ]);
  });

  it("supports forwarding extra Tauri Android build args for ABI-specific APKs", () => {
    const { calls, execute } = createCommandRecorder();
    const policyCalls: Array<{ platforms: string[]; projectRoot: string }> = [];

    packageMobile({
      args: ["android", "--build", "--", "--apk", "--target", "aarch64"],
      env: {
        [ANDROID_RELEASE_KEYSTORE_BASE64_ENV]: Buffer.from("fake-keystore", "utf8").toString("base64"),
        [ANDROID_RELEASE_KEYSTORE_PASSWORD_ENV]: "store-password",
        [ANDROID_RELEASE_KEY_ALIAS_ENV]: "upload",
      },
      execute,
      hostPlatform: "linux",
      pathExists: () => true,
      prepareAndroidReleaseSigning: () => undefined,
      prepareMobileShellPolicy: (platforms, projectRoot) => {
        policyCalls.push({ platforms, projectRoot });
      },
      projectRoot: "/tmp/tauri-shell",
    });

    expect(policyCalls).toEqual([{ platforms: ["android"], projectRoot: "/tmp/tauri-shell" }]);

    expect(calls).toEqual([
      {
        command: "bun",
        args: ["tauri", "icon", "src-tauri/icons/icon.png", "--ios-color", "#ffffff"],
        options: {
          cwd: "/tmp/tauri-shell",
          envOverrides: {
            NATIVE_RELEASE_REMOTE_URL: "https://dingdongbro.272.chat/",
            VITE_APP_RUNTIME: "mobile",
          },
        },
      },
      {
        command: "bun",
        args: ["tauri", "android", "build", "--ci", "--apk", "--target", "aarch64"],
        options: {
          cwd: "/tmp/tauri-shell",
          envOverrides: {
            NATIVE_RELEASE_REMOTE_URL: "https://dingdongbro.272.chat/",
            VITE_APP_RUNTIME: "mobile",
          },
        },
      },
    ]);
  });
});