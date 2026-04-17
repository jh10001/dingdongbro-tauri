import { cp, mkdir, writeFile } from "node:fs/promises";
import { relative, resolve, join } from "node:path";

import {
  createDesktopShellConfigSource,
  DESKTOP_TAURI_SHELL_CONFIG_FILE,
  DESKTOP_TAURI_SHELL_OUTPUT_DIR,
  resolveNativeReleaseRemoteUrl,
} from "./lib/nativePackaging";

const PROJECT_ROOT = resolve(process.cwd());
const DEFAULT_NATIVE_SHELL_SOURCE_DIR = resolve(PROJECT_ROOT, "native-shell");

export interface BuildDesktopShellBundleOptions {
  outputDir?: string;
  remoteUrl?: string;
  sourceDir?: string;
  log?: (line: string) => void;
}

export const buildDesktopShellBundle = async (
  options: BuildDesktopShellBundleOptions = {},
): Promise<void> => {
  const sourceDir = options.sourceDir ?? DEFAULT_NATIVE_SHELL_SOURCE_DIR;
  const outputDir = options.outputDir ?? DESKTOP_TAURI_SHELL_OUTPUT_DIR;
  const remoteUrl = options.remoteUrl ?? resolveNativeReleaseRemoteUrl();
  const log = options.log ?? console.log;

  await mkdir(outputDir, { recursive: true });
  await cp(sourceDir, outputDir, { recursive: true, force: true });
  await writeFile(
    join(outputDir, DESKTOP_TAURI_SHELL_CONFIG_FILE),
    createDesktopShellConfigSource(remoteUrl),
    "utf8",
  );

  log(`Built desktop shell ${relative(PROJECT_ROOT, outputDir) || "."} -> ${remoteUrl}`);
};

if (import.meta.main) {
  await buildDesktopShellBundle();
}
