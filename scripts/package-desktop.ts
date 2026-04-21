import { resolve } from "node:path";

import { getTauriDesktopBuildArgs, resolveDesktopBuildEnv } from "./lib/nativePackaging";
import { runCommand } from "./lib/runCommand";

export interface BuildDesktopPackageOptions {
  env?: Record<string, string | undefined>;
  execute?: typeof runCommand;
  hostPlatform?: string;
  projectRoot?: string;
}

export const buildDesktopPackage = (options: BuildDesktopPackageOptions = {}): void => {
  const projectRoot = resolve(options.projectRoot ?? process.cwd());
  const envOverrides = resolveDesktopBuildEnv(options.env ?? process.env);
  const args = getTauriDesktopBuildArgs(options.hostPlatform ?? process.platform);

  (options.execute ?? runCommand)("bun", args, { cwd: projectRoot, envOverrides });
};

if (import.meta.main) {
  buildDesktopPackage();
}
