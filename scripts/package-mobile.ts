import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { prepareAndroidReleaseSigning } from "./lib/androidSigning";
import { prepareMobileShellPolicy } from "./lib/mobileShellPolicy";
import {
  getTauriMobileIconArgs,
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
  prepareAndroidReleaseSigning?: typeof prepareAndroidReleaseSigning;
  prepareMobileShellPolicy?: typeof prepareMobileShellPolicy;
}

export const packageMobile = (options: PackageMobileOptions = {}): void => {
  const args = options.args ?? process.argv.slice(2);
  const env = options.env ?? process.env;
  const projectRoot = resolve(options.projectRoot ?? process.cwd());
  const execute = options.execute ?? runCommand;
  const plan = parseMobilePackagingArgs(args, options.hostPlatform ?? process.platform);
  const envOverrides = resolveMobileBuildEnv(env);

  ensureTauriMobileProjects(plan.platforms, envOverrides, {
    execute,
    pathExists: options.pathExists,
    projectRoot,
  });

  (options.prepareMobileShellPolicy ?? prepareMobileShellPolicy)(plan.platforms, projectRoot);

  execute("bun", getTauriMobileIconArgs(), {
    cwd: projectRoot,
    envOverrides,
  });

  if (plan.buildNative || plan.openProject) {
    if (plan.buildNative && plan.platforms[0] === "android") {
      (options.prepareAndroidReleaseSigning ?? prepareAndroidReleaseSigning)(projectRoot, env);
    }

    execute("bun", getTauriMobileBuildArgs(plan.platforms[0], {
      extraArgs: plan.tauriBuildArgs,
      openProject: plan.openProject,
    }), {
      cwd: projectRoot,
      envOverrides,
    });
  }
};

if (import.meta.main) {
  packageMobile();
}
