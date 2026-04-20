import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { resolveTauriMobileProjectDir, type MobilePlatform } from "./nativePackaging";

const ANDROID_MAIN_ACTIVITY_NAME = "MainActivity";
const ANDROID_SCREEN_ORIENTATION = 'android:screenOrientation="sensorLandscape"';
const ANDROID_CUTOUT_STYLE_ITEM = '<item name="android:windowLayoutInDisplayCutoutMode">shortEdges</item>';
const IOS_ORIENTATION_VALUES = [
  "UIInterfaceOrientationLandscapeLeft",
  "UIInterfaceOrientationLandscapeRight",
] as const;
const ANDROID_FULLSCREEN_STYLE_ITEM_PATTERN = /\s*<item name="android:windowFullscreen">[^<]*<\/item>\s*/g;
const ANDROID_IMMERSIVE_MARKER = "hide(WindowInsetsCompat.Type.systemBars())";

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

const ensureImportsAfterPackage = (source: string, imports: readonly string[]): string => {
  const presentImports = imports.filter((entry) => source.includes(`${entry}\n`) || source.includes(`${entry}\r\n`));
  const missingImports = imports.filter((entry) => !presentImports.includes(entry));

  if (missingImports.length === 0) {
    return source;
  }

  const lines = source.split(/\r?\n/);
  const lastImportIndex = lines.reduce((acc, line, index) => (line.startsWith("import ") ? index : acc), -1);
  const packageIndex = lines.findIndex((line) => line.startsWith("package "));
  const insertAt = lastImportIndex >= 0 ? lastImportIndex + 1 : packageIndex >= 0 ? packageIndex + 1 : 0;

  const importsToInsert = [
    ...(insertAt > 0 && lines[insertAt - 1] !== "" ? [""] : []),
    ...missingImports,
    "",
  ];

  lines.splice(insertAt, 0, ...importsToInsert);
  return lines.join("\n").replace(/\n{3,}/g, "\n\n");
};

const escapeAndroidStringValue = (value: string): string => value
  .replace(/\\/g, "\\\\")
  .replace(/'/g, "\\'")
  .replace(/"/g, '\\"')
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;");

const upsertAndroidString = (source: string, key: string, value: string): string => {
  const escapedValue = escapeAndroidStringValue(value);
  const entryPattern = new RegExp(`<string\\s+name="${key}">[\\s\\S]*?<\\/string>`);
  const replacement = `  <string name="${key}">${escapedValue}</string>`;

  if (entryPattern.test(source)) {
    return source.replace(entryPattern, replacement);
  }

  return source.replace(/<\/resources>/, `${replacement}\n</resources>`);
};

const insertBeforeClosingBrace = (source: string, blockSource: string): string => {
  const lastBraceIndex = source.lastIndexOf("}");
  if (lastBraceIndex === -1) {
    throw new Error("Android MainActivity source is missing a class closing brace.");
  }

  return `${source.slice(0, lastBraceIndex).trimEnd()}\n\n${blockSource}\n${source.slice(lastBraceIndex)}`;
};

const ensureKotlinMainActivityImmersiveFullscreen = (source: string): string => {
  if (source.includes(ANDROID_IMMERSIVE_MARKER)) {
    return ensureImportsAfterPackage(source, [
      "import android.os.Bundle",
      "import androidx.core.view.WindowCompat",
      "import androidx.core.view.WindowInsetsCompat",
      "import androidx.core.view.WindowInsetsControllerCompat",
    ]);
  }

  let nextSource = ensureImportsAfterPackage(source, [
    "import android.os.Bundle",
    "import androidx.core.view.WindowCompat",
    "import androidx.core.view.WindowInsetsCompat",
    "import androidx.core.view.WindowInsetsControllerCompat",
  ]);

  const helperSource = [
    "  private fun applyImmersiveFullscreen() {",
    "    WindowCompat.getInsetsController(window, window.decorView).apply {",
    "      systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE",
    "      hide(WindowInsetsCompat.Type.systemBars())",
    "    }",
    "  }",
  ].join("\n");

  if (nextSource.includes("override fun onCreate(savedInstanceState: Bundle?)")) {
    nextSource = nextSource.replace(
      "super.onCreate(savedInstanceState)",
      "super.onCreate(savedInstanceState)\n    applyImmersiveFullscreen()",
    );
    return nextSource.includes("private fun applyImmersiveFullscreen()")
      ? nextSource
      : insertBeforeClosingBrace(nextSource, helperSource);
  }

  const classWithBodyPattern = /class\s+MainActivity\s*:\s*TauriActivity\(\)\s*\{/;
  if (classWithBodyPattern.test(nextSource)) {
    return insertBeforeClosingBrace(nextSource, [
      "  override fun onCreate(savedInstanceState: Bundle?) {",
      "    super.onCreate(savedInstanceState)",
      "    applyImmersiveFullscreen()",
      "  }",
      "",
      helperSource,
    ].join("\n"));
  }

  return nextSource.replace(
    /class\s+MainActivity\s*:\s*TauriActivity\(\)\s*$/m,
    [
      "class MainActivity : TauriActivity() {",
      "  override fun onCreate(savedInstanceState: Bundle?) {",
      "    super.onCreate(savedInstanceState)",
      "    applyImmersiveFullscreen()",
      "  }",
      "",
      helperSource,
      "}",
    ].join("\n"),
  );
};

const ensureJavaMainActivityImmersiveFullscreen = (source: string): string => {
  if (source.includes(ANDROID_IMMERSIVE_MARKER)) {
    return ensureImportsAfterPackage(source, [
      "import android.os.Bundle;",
      "import androidx.core.view.WindowCompat;",
      "import androidx.core.view.WindowInsetsCompat;",
      "import androidx.core.view.WindowInsetsControllerCompat;",
    ]);
  }

  let nextSource = ensureImportsAfterPackage(source, [
    "import android.os.Bundle;",
    "import androidx.core.view.WindowCompat;",
    "import androidx.core.view.WindowInsetsCompat;",
    "import androidx.core.view.WindowInsetsControllerCompat;",
  ]);

  const helperSource = [
    "  private void applyImmersiveFullscreen() {",
    "    WindowInsetsControllerCompat windowInsetsController =",
    "      WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());",
    "    windowInsetsController.setSystemBarsBehavior(",
    "      WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE",
    "    );",
    "    windowInsetsController.hide(WindowInsetsCompat.Type.systemBars());",
    "  }",
  ].join("\n");

  if (nextSource.includes("protected void onCreate(Bundle savedInstanceState)")) {
    nextSource = nextSource.replace(
      "super.onCreate(savedInstanceState);",
      "super.onCreate(savedInstanceState);\n    applyImmersiveFullscreen();",
    );
    return nextSource.includes("private void applyImmersiveFullscreen()")
      ? nextSource
      : insertBeforeClosingBrace(nextSource, helperSource);
  }

  const classWithBodyPattern = /class\s+MainActivity\s+extends\s+TauriActivity\s*\{/;
  if (classWithBodyPattern.test(nextSource)) {
    return insertBeforeClosingBrace(nextSource, [
      "  @Override",
      "  protected void onCreate(Bundle savedInstanceState) {",
      "    super.onCreate(savedInstanceState);",
      "    applyImmersiveFullscreen();",
      "  }",
      "",
      helperSource,
    ].join("\n"));
  }

  return nextSource.replace(
    /class\s+MainActivity\s+extends\s+TauriActivity\s*$/m,
    [
      "public class MainActivity extends TauriActivity {",
      "  @Override",
      "  protected void onCreate(Bundle savedInstanceState) {",
      "    super.onCreate(savedInstanceState);",
      "    applyImmersiveFullscreen();",
      "  }",
      "",
      helperSource,
      "}",
    ].join("\n"),
  );
};

const upsertPlistString = (source: string, key: string, value: string): string => {
  const entryPattern = new RegExp(`<key>${key}<\\/key>\\s*<string>[\\s\\S]*?<\\/string>`);
  const replacement = `<key>${key}</key>\n\t<string>${value}</string>`;
  if (entryPattern.test(source)) {
    return source.replace(entryPattern, replacement);
  }
  return source.replace(/<\/dict>/, `\t${replacement}\n</dict>`);
};

const readConfiguredDisplayName = (
  projectRoot: string,
  platform?: MobilePlatform,
): string => {
  const configDir = resolve(projectRoot, "src-tauri");
  const configPath = resolve(configDir, "tauri.conf.json");
  const config = JSON.parse(readFileSync(configPath, "utf8")) as { productName?: unknown };

  if (typeof config.productName !== "string" || config.productName.trim().length === 0) {
    throw new Error("Tauri mobile shell policy requires a non-empty top-level productName in src-tauri/tauri.conf.json.");
  }

  if (!platform) {
    return config.productName;
  }

  const platformConfigPath = resolve(configDir, `tauri.${platform}.conf.json`);
  if (!existsSync(platformConfigPath)) {
    return config.productName;
  }

  const platformConfig = JSON.parse(readFileSync(platformConfigPath, "utf8")) as { productName?: unknown };
  if (typeof platformConfig.productName === "string" && platformConfig.productName.trim().length > 0) {
    return platformConfig.productName;
  }

  return config.productName;
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

  let nextStyle = styleMatch[0].replace(ANDROID_FULLSCREEN_STYLE_ITEM_PATTERN, "\n");
  if (!nextStyle.includes(ANDROID_CUTOUT_STYLE_ITEM)) {
    nextStyle = nextStyle.replace(/<\/style>/, `    ${ANDROID_CUTOUT_STYLE_ITEM}\n</style>`);
  }

  return source.replace(styleMatch[0], nextStyle);
};

export const ensureAndroidStringsDisplayName = (source: string, displayName: string): string => {
  let nextSource = upsertAndroidString(source, "app_name", displayName);
  nextSource = upsertAndroidString(nextSource, "main_activity_title", displayName);
  return nextSource;
};

export const ensureAndroidMainActivityImmersiveFullscreen = (source: string): string => {
  if (source.includes("class MainActivity :")) {
    return ensureKotlinMainActivityImmersiveFullscreen(source);
  }

  if (source.includes("class MainActivity extends")) {
    return ensureJavaMainActivityImmersiveFullscreen(source);
  }

  throw new Error("Android MainActivity source does not match the expected Kotlin or Java Tauri activity template.");
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

export const ensureIosInfoPlistLandscapeFullscreen = (source: string, displayName: string): string => {
  let nextSource = upsertPlistArray(source, "UISupportedInterfaceOrientations", IOS_ORIENTATION_VALUES);
  nextSource = upsertPlistArray(nextSource, "UISupportedInterfaceOrientations~ipad", IOS_ORIENTATION_VALUES);
  nextSource = upsertPlistBoolean(nextSource, "UIRequiresFullScreen", true);
  nextSource = upsertPlistBoolean(nextSource, "UIStatusBarHidden", true);
  nextSource = upsertPlistBoolean(nextSource, "UIViewControllerBasedStatusBarAppearance", false);
  nextSource = upsertPlistString(nextSource, "CFBundleDisplayName", displayName);
  nextSource = upsertPlistString(nextSource, "CFBundleName", displayName);
  return nextSource;
};

export const prepareMobileShellPolicy = (
  platforms: MobilePlatform[],
  projectRoot: string = process.cwd(),
): void => {
  if (platforms.includes("android")) {
    const displayName = readConfiguredDisplayName(projectRoot, "android");
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
    const stringsPath = preferProjectFile(
      collectFilesByName(androidProjectDir, "strings.xml"),
      "app/src/main/res/values/strings.xml",
    );
    const mainActivityPath = preferProjectFile(
      collectFilesByName(androidProjectDir, "MainActivity.kt"),
      "app/src/main/java/MainActivity.kt",
    ) ?? preferProjectFile(
      collectFilesByName(androidProjectDir, "MainActivity.java"),
      "app/src/main/java/MainActivity.java",
    );

    if (!manifestPath || !stylesPath || !stringsPath || !mainActivityPath) {
      throw new Error("Android mobile shell policy requires generated manifest, theme/style, strings, and MainActivity files after tauri android init.");
    }

    writeFileSync(manifestPath, ensureAndroidManifestLandscape(readFileSync(manifestPath, "utf8")), "utf8");
    writeFileSync(stylesPath, ensureAndroidStylesFullscreen(readFileSync(stylesPath, "utf8")), "utf8");
    writeFileSync(stringsPath, ensureAndroidStringsDisplayName(readFileSync(stringsPath, "utf8"), displayName), "utf8");
    writeFileSync(mainActivityPath, ensureAndroidMainActivityImmersiveFullscreen(readFileSync(mainActivityPath, "utf8")), "utf8");
  }

  if (platforms.includes("ios")) {
    const displayName = readConfiguredDisplayName(projectRoot, "ios");
    const iosProjectDir = resolveTauriMobileProjectDir("ios", projectRoot);
    const infoPlistPaths = collectFilesByName(iosProjectDir, "Info.plist")
      .filter((filePath) => !filePath.includes(`${resolve(iosProjectDir, "Pods")}`));

    if (infoPlistPaths.length === 0) {
      throw new Error("iOS mobile shell policy requires at least one generated Info.plist after tauri ios init.");
    }

    for (const infoPlistPath of infoPlistPaths) {
      writeFileSync(
        infoPlistPath,
        ensureIosInfoPlistLandscapeFullscreen(readFileSync(infoPlistPath, "utf8"), displayName),
        "utf8",
      );
    }
  }
};
