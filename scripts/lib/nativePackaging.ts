import { resolve } from "node:path";

export type MobilePlatform = "android" | "ios";
export type SupportedMobileHostPlatform = "linux" | "darwin" | "win32";

export const NATIVE_RELEASE_REMOTE_URL_ENV = "NATIVE_RELEASE_REMOTE_URL";
export const DEFAULT_NATIVE_RELEASE_REMOTE_URL = "https://dingdongbro.272.chat/";
export const DESKTOP_TAURI_SHELL_OUTPUT_DIR = resolve(process.cwd(), "build", "desktop-shell");
export const DESKTOP_TAURI_SHELL_CONFIG_FILE = "shell-config.js";

export interface MobilePackagingPlan {
  buildNative: boolean;
  openProject: boolean;
  platforms: MobilePlatform[];
}

const createNativeHostedShellBuildEnv = (
  env: Record<string, string | undefined>,
  runtime: "desktop" | "mobile",
): Record<string, string> => ({
  [NATIVE_RELEASE_REMOTE_URL_ENV]: resolveNativeReleaseRemoteUrl(env),
  ...(runtime === "desktop" ? { VITE_APP_RUNTIME: "desktop" } : {}),
});

const VALID_PLATFORMS = new Set<MobilePlatform>(["android", "ios"]);
const VALID_FLAGS = new Set(["--build", "--open"]);
const TAURI_MOBILE_PROJECT_DIRS = {
  android: ["src-tauri", "gen", "android"],
  ios: ["src-tauri", "gen", "apple"],
} as const;
const MOBILE_PLATFORM_HOSTS: Record<MobilePlatform, readonly SupportedMobileHostPlatform[]> = {
  android: ["linux", "darwin", "win32"],
  ios: ["darwin"],
};

const isSupportedMobileHostPlatform = (value: string): value is SupportedMobileHostPlatform => (
  value === "linux" || value === "darwin" || value === "win32"
);

const isMobilePlatform = (value: string): value is MobilePlatform => VALID_PLATFORMS.has(value as MobilePlatform);

export const resolveDesktopBuildEnv = (
  env: Record<string, string | undefined> = process.env,
): Record<string, string> => createNativeHostedShellBuildEnv(env, "desktop");

export const resolveMobileBuildEnv = (
  env: Record<string, string | undefined> = process.env,
): Record<string, string> => createNativeHostedShellBuildEnv(env, "mobile");

export const resolveNativeReleaseRemoteUrl = (
  env: Record<string, string | undefined> = process.env,
): string => {
  const rawValue = env[NATIVE_RELEASE_REMOTE_URL_ENV] ?? DEFAULT_NATIVE_RELEASE_REMOTE_URL;

  let parsed: URL;
  try {
    parsed = new URL(rawValue);
  } catch {
    throw new Error(`Invalid ${NATIVE_RELEASE_REMOTE_URL_ENV} URL: ${rawValue}`);
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error(`${NATIVE_RELEASE_REMOTE_URL_ENV} must use http or https.`);
  }

  if (!parsed.pathname.endsWith("/")) {
    parsed.pathname = `${parsed.pathname}/`;
  }

  return parsed.toString();
};

export const createDesktopShellConfigSource = (remoteUrl: string): string => [
  "window.__DINGDONG_REMOTE_URL__ = ",
  JSON.stringify(remoteUrl),
  ";\n",
].join("");

export const getDefaultMobilePlatformsForHost = (
  hostPlatform: SupportedMobileHostPlatform = process.platform as SupportedMobileHostPlatform,
): MobilePlatform[] => hostPlatform === "darwin" ? ["android", "ios"] : ["android"];

export const isMobilePlatformSupportedOnHost = (
  platform: MobilePlatform,
  hostPlatform: SupportedMobileHostPlatform = process.platform as SupportedMobileHostPlatform,
): boolean => MOBILE_PLATFORM_HOSTS[platform].includes(hostPlatform);

export const assertMobilePlatformSupportedOnHost = (
  platform: MobilePlatform,
  hostPlatform: string = process.platform,
): void => {
  if (!isSupportedMobileHostPlatform(hostPlatform)) {
    throw new Error(`Unsupported host platform for mobile packaging: ${hostPlatform}`);
  }

  if (isMobilePlatformSupportedOnHost(platform, hostPlatform)) {
    return;
  }

  if (platform === "ios") {
    throw new Error(`iOS packaging requires macOS. Current host: ${hostPlatform}`);
  }

  throw new Error(`Android packaging is not supported on host ${hostPlatform}`);
};

export const resolveTauriMobileProjectDir = (
  platform: MobilePlatform,
  projectRoot: string = process.cwd(),
): string => resolve(projectRoot, ...TAURI_MOBILE_PROJECT_DIRS[platform]);

export const getTauriMobileInitArgs = (platform: MobilePlatform): string[] => [
  "tauri",
  platform,
  "init",
  "--ci",
  "--skip-targets-install",
];

export const getTauriMobileBuildArgs = (
  platform: MobilePlatform,
  options: { openProject?: boolean } = {},
): string[] => [
  "tauri",
  platform,
  "build",
  ...(options.openProject ? ["--open"] : []),
  "--ci",
];

export const parseMobilePackagingArgs = (
  args: string[],
  hostPlatform: string = process.platform,
): MobilePackagingPlan => {
  const requestedFlags = args.filter((arg) => arg.startsWith("--"));
  if (!requestedFlags.every((flag) => VALID_FLAGS.has(flag))) {
    throw new Error(`Unsupported mobile packaging flag: ${requestedFlags.join(", ")}`);
  }

  const flags = new Set(requestedFlags);
  const requestedPlatforms = args.filter((arg) => !arg.startsWith("--"));

  if (!requestedPlatforms.every(isMobilePlatform)) {
    throw new Error(`Unsupported mobile packaging platform: ${requestedPlatforms.join(", ")}`);
  }

  if (!isSupportedMobileHostPlatform(hostPlatform)) {
    throw new Error(`Unsupported host platform for mobile packaging: ${hostPlatform}`);
  }

  const platforms = requestedPlatforms.length > 0
    ? [...new Set(requestedPlatforms)]
    : getDefaultMobilePlatformsForHost(hostPlatform);
  const buildNative = flags.has("--build");
  const openProject = flags.has("--open");

  if ((buildNative || openProject) && platforms.length !== 1) {
    throw new Error("Native build/open actions require exactly one target platform.");
  }

  for (const platform of platforms) {
    assertMobilePlatformSupportedOnHost(platform, hostPlatform);
  }

  return {
    buildNative,
    openProject,
    platforms,
  };
};
