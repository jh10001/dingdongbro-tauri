import { resolve } from "node:path";

import { resolveDesktopBuildEnv } from "./lib/nativePackaging";
import { runCommand } from "./lib/runCommand";

export interface BuildDesktopPackageOptions {
  env?: Record<string, string | undefined>;
  execute?: typeof runCommand;
  projectRoot?: string;
}

export const buildDesktopPackage = (options: BuildDesktopPackageOptions = {}): void => {
  const projectRoot = resolve(options.projectRoot ?? process.cwd());
  const envOverrides = resolveDesktopBuildEnv(options.env ?? process.env);

  (options.execute ?? runCommand)("bun", ["tauri", "build"], { cwd: projectRoot, envOverrides });
};

if (import.meta.main) {
  buildDesktopPackage();
}
