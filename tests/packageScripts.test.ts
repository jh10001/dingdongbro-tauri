import { describe, expect, it } from "bun:test";

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

    packageMobile({
      args: ["android", "--build"],
      execute,
      hostPlatform: "linux",
      pathExists: () => false,
      projectRoot: "/tmp/tauri-shell",
    });

    expect(calls).toEqual([
      {
        command: "bun",
        args: ["tauri", "android", "init", "--ci", "--skip-targets-install"],
        options: {
          cwd: "/tmp/tauri-shell",
          envOverrides: {
            NATIVE_RELEASE_REMOTE_URL: "https://dingdongbro.272.chat/",
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
          },
        },
      },
    ]);
  });

  it("skips mobile init when the generated project already exists", () => {
    const { calls, execute } = createCommandRecorder();

    packageMobile({
      args: ["android", "--build"],
      execute,
      hostPlatform: "linux",
      pathExists: () => true,
      projectRoot: "/tmp/tauri-shell",
    });

    expect(calls).toEqual([
      {
        command: "bun",
        args: ["tauri", "android", "build", "--ci"],
        options: {
          cwd: "/tmp/tauri-shell",
          envOverrides: {
            NATIVE_RELEASE_REMOTE_URL: "https://dingdongbro.272.chat/",
          },
        },
      },
    ]);
  });
});