import { cp, mkdir, writeFile } from "node:fs/promises";
import { relative, resolve, join } from "node:path";

import {
  createDesktopShellConfigSource,
  DESKTOP_NATIVE_SHELL_RUNTIME,
  DESKTOP_TAURI_SHELL_CONFIG_FILE,
  DESKTOP_TAURI_SHELL_OUTPUT_DIR,
  MOBILE_NATIVE_SHELL_RUNTIME,
  resolveNativeReleaseRemoteUrl,
} from "./lib/nativePackaging";

const PROJECT_ROOT = resolve(process.cwd());
const DEFAULT_NATIVE_SHELL_SOURCE_DIR = resolve(PROJECT_ROOT, "native-shell");

export interface BuildDesktopShellBundleOptions {
  outputDir?: string;
  remoteUrl?: string;
  runtime?: "desktop" | "mobile";
  sourceDir?: string;
  log?: (line: string) => void;
}

export const buildDesktopShellBundle = async (
  options: BuildDesktopShellBundleOptions = {},
): Promise<void> => {
  const sourceDir = options.sourceDir ?? DEFAULT_NATIVE_SHELL_SOURCE_DIR;
  const outputDir = options.outputDir ?? DESKTOP_TAURI_SHELL_OUTPUT_DIR;
  const remoteUrl = options.remoteUrl ?? resolveNativeReleaseRemoteUrl();
  const runtime = options.runtime ?? (process.env.VITE_APP_RUNTIME === "mobile" ? "mobile" : "desktop");
  const log = options.log ?? console.log;

  await mkdir(outputDir, { recursive: true });
  await cp(sourceDir, outputDir, { recursive: true, force: true });
  await writeFile(
    join(outputDir, DESKTOP_TAURI_SHELL_CONFIG_FILE),
    createDesktopShellConfigSource(
      remoteUrl,
      runtime === "mobile" ? MOBILE_NATIVE_SHELL_RUNTIME : DESKTOP_NATIVE_SHELL_RUNTIME,
    ),
    "utf8",
  );

  log(`Built desktop shell ${relative(PROJECT_ROOT, outputDir) || "."} -> ${remoteUrl}`);
};

if (import.meta.main) {
  await buildDesktopShellBundle();
}
