import { existsSync } from "node:fs";
import { resolve } from "node:path";

import {
  getTauriMobileBuildArgs,
  getTauriMobileInitArgs,
  parseMobilePackagingArgs,
  resolveMobileBuildEnv,
  resolveTauriMobileProjectDir,
  type MobilePlatform,
} from "./lib/nativePackaging";
import { runCommand } from "./lib/runCommand";

export interface EnsureTauriMobileProjectsOptions {
  execute?: typeof runCommand;
  pathExists?: (path: string) => boolean;
  projectRoot?: string;
}

export const ensureTauriMobileProjects = (
  platforms: MobilePlatform[],
  envOverrides: Record<string, string>,
  options: EnsureTauriMobileProjectsOptions = {},
): void => {
  const projectRoot = resolve(options.projectRoot ?? process.cwd());
  const execute = options.execute ?? runCommand;
  const pathExists = options.pathExists ?? existsSync;

  for (const platform of platforms) {
    if (pathExists(resolveTauriMobileProjectDir(platform, projectRoot))) {
      continue;
    }

    execute("bun", getTauriMobileInitArgs(platform), { cwd: projectRoot, envOverrides });
  }
};

export interface PackageMobileOptions extends EnsureTauriMobileProjectsOptions {
  args?: string[];
  env?: Record<string, string | undefined>;
  hostPlatform?: string;
}

export const packageMobile = (options: PackageMobileOptions = {}): void => {
  const args = options.args ?? process.argv.slice(2);
  const projectRoot = resolve(options.projectRoot ?? process.cwd());
  const execute = options.execute ?? runCommand;
  const plan = parseMobilePackagingArgs(args, options.hostPlatform ?? process.platform);
  const envOverrides = resolveMobileBuildEnv(options.env ?? process.env);

  ensureTauriMobileProjects(plan.platforms, envOverrides, {
    execute,
    pathExists: options.pathExists,
    projectRoot,
  });

  if (plan.buildNative || plan.openProject) {
    execute("bun", getTauriMobileBuildArgs(plan.platforms[0], { openProject: plan.openProject }), {
      cwd: projectRoot,
      envOverrides,
    });
  }
};

if (import.meta.main) {
  packageMobile();
}
