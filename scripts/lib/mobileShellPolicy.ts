import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { resolveTauriMobileProjectDir, type MobilePlatform } from "./nativePackaging";

const ANDROID_MAIN_ACTIVITY_NAME = "MainActivity";
const ANDROID_SCREEN_ORIENTATION = 'android:screenOrientation="sensorLandscape"';
const ANDROID_FULLSCREEN_STYLE_ITEM = '<item name="android:windowFullscreen">true</item>';
const ANDROID_CUTOUT_STYLE_ITEM = '<item name="android:windowLayoutInDisplayCutoutMode">shortEdges</item>';
const IOS_ORIENTATION_VALUES = [
  "UIInterfaceOrientationLandscapeLeft",
  "UIInterfaceOrientationLandscapeRight",
] as const;

const collectFilesByName = (rootDir: string, fileName: string, results: string[] = []): string[] => {
  if (!existsSync(rootDir)) {
    return results;
  }

  for (const entry of readdirSync(rootDir)) {
    const entryPath = join(rootDir, entry);
    const stats = statSync(entryPath);
    if (stats.isDirectory()) {
      collectFilesByName(entryPath, fileName, results);
      continue;
    }
    if (entry === fileName) {
      results.push(entryPath);
    }
  }

  return results;
};

const preferProjectFile = (files: string[], preferredSuffix: string): string | null => {
  const normalizedSuffix = preferredSuffix.replace(/\\/g, "/");
  const preferred = files.find((filePath) => filePath.replace(/\\/g, "/").endsWith(normalizedSuffix));
  return preferred ?? files[0] ?? null;
};

const replaceOrInsertAttribute = (tagSource: string, attributePattern: RegExp, attributeSource: string): string => {
  if (attributePattern.test(tagSource)) {
    return tagSource.replace(attributePattern, attributeSource);
  }

  return tagSource.replace(/>$/, ` ${attributeSource}>`);
};

export const ensureAndroidManifestLandscape = (source: string): string => {
  const activityPattern = /<activity\b[^>]*android:name="[^"]*MainActivity"[^>]*>/;
  const activityTag = source.match(activityPattern)?.[0];

  if (!activityTag) {
    throw new Error(`Android manifest is missing the ${ANDROID_MAIN_ACTIVITY_NAME} activity.`);
  }

  const nextActivityTag = replaceOrInsertAttribute(
    activityTag,
    /android:screenOrientation="[^"]*"/,
    ANDROID_SCREEN_ORIENTATION,
  );

  return source.replace(activityTag, nextActivityTag);
};

export const ensureAndroidStylesFullscreen = (source: string): string => {
  const styleMatch = source.match(/<style\b[^>]*>[\s\S]*?<\/style>/);
  if (!styleMatch) {
    throw new Error("Android styles.xml is missing a <style> block for mobile shell fullscreen policy.");
  }

  let nextStyle = styleMatch[0];
  if (!nextStyle.includes(ANDROID_FULLSCREEN_STYLE_ITEM)) {
    nextStyle = nextStyle.replace(/<\/style>/, `    ${ANDROID_FULLSCREEN_STYLE_ITEM}\n</style>`);
  }
  if (!nextStyle.includes(ANDROID_CUTOUT_STYLE_ITEM)) {
    nextStyle = nextStyle.replace(/<\/style>/, `    ${ANDROID_CUTOUT_STYLE_ITEM}\n</style>`);
  }

  return source.replace(styleMatch[0], nextStyle);
};

const upsertPlistBoolean = (source: string, key: string, value: boolean): string => {
  const entryPattern = new RegExp(`<key>${key}<\\/key>\\s*<(true|false)\\s*\\/>`);
  const replacement = `<key>${key}</key>\n\t<${value ? "true" : "false"}/>`;
  if (entryPattern.test(source)) {
    return source.replace(entryPattern, replacement);
  }
  return source.replace(/<\/dict>/, `\t${replacement}\n</dict>`);
};

const buildPlistArray = (key: string, values: readonly string[]): string => [
  `\t<key>${key}</key>`,
  "\t<array>",
  ...values.map((value) => `\t\t<string>${value}</string>`),
  "\t</array>",
].join("\n");

const upsertPlistArray = (source: string, key: string, values: readonly string[]): string => {
  const entryPattern = new RegExp(`<key>${key}<\\/key>\\s*<array>[\\s\\S]*?<\\/array>`);
  const replacement = buildPlistArray(key, values);
  if (entryPattern.test(source)) {
    return source.replace(entryPattern, replacement);
  }
  return source.replace(/<\/dict>/, `${replacement}\n</dict>`);
};

export const ensureIosInfoPlistLandscapeFullscreen = (source: string): string => {
  let nextSource = upsertPlistArray(source, "UISupportedInterfaceOrientations", IOS_ORIENTATION_VALUES);
  nextSource = upsertPlistArray(nextSource, "UISupportedInterfaceOrientations~ipad", IOS_ORIENTATION_VALUES);
  nextSource = upsertPlistBoolean(nextSource, "UIRequiresFullScreen", true);
  nextSource = upsertPlistBoolean(nextSource, "UIStatusBarHidden", true);
  nextSource = upsertPlistBoolean(nextSource, "UIViewControllerBasedStatusBarAppearance", false);
  return nextSource;
};

export const prepareMobileShellPolicy = (
  platforms: MobilePlatform[],
  projectRoot: string = process.cwd(),
): void => {
  if (platforms.includes("android")) {
    const androidProjectDir = resolveTauriMobileProjectDir("android", projectRoot);
    const manifestPath = preferProjectFile(
      collectFilesByName(androidProjectDir, "AndroidManifest.xml"),
      "app/src/main/AndroidManifest.xml",
    );
    const stylesPath = preferProjectFile(
      collectFilesByName(androidProjectDir, "styles.xml"),
      "app/src/main/res/values/styles.xml",
    ) ?? preferProjectFile(
      collectFilesByName(androidProjectDir, "themes.xml"),
      "app/src/main/res/values/themes.xml",
    );

    if (!manifestPath || !stylesPath) {
      throw new Error("Android mobile shell policy requires generated manifest and theme/style files after tauri android init.");
    }

    writeFileSync(manifestPath, ensureAndroidManifestLandscape(readFileSync(manifestPath, "utf8")), "utf8");
    writeFileSync(stylesPath, ensureAndroidStylesFullscreen(readFileSync(stylesPath, "utf8")), "utf8");
  }

  if (platforms.includes("ios")) {
    const iosProjectDir = resolveTauriMobileProjectDir("ios", projectRoot);
    const infoPlistPaths = collectFilesByName(iosProjectDir, "Info.plist")
      .filter((filePath) => !filePath.includes(`${resolve(iosProjectDir, "Pods")}`));

    if (infoPlistPaths.length === 0) {
      throw new Error("iOS mobile shell policy requires at least one generated Info.plist after tauri ios init.");
    }

    for (const infoPlistPath of infoPlistPaths) {
      writeFileSync(infoPlistPath, ensureIosInfoPlistLandscapeFullscreen(readFileSync(infoPlistPath, "utf8")), "utf8");
    }
  }
};
