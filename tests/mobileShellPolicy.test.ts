import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, describe, expect, it } from "bun:test";

import {
  ensureAndroidManifestLandscape,
  ensureAndroidStylesFullscreen,
  ensureIosInfoPlistLandscapeFullscreen,
  prepareMobileShellPolicy,
} from "../scripts/lib/mobileShellPolicy";

const tempDirs: string[] = [];

const createTempDir = async (prefix: string): Promise<string> => {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
};

const SAMPLE_ANDROID_MANIFEST = `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
  <application>
    <activity android:name="app.tauri.MainActivity" android:exported="true">
    </activity>
  </application>
</manifest>
`;

const SAMPLE_ANDROID_STYLES = `<?xml version="1.0" encoding="utf-8"?>
<resources>
  <style name="AppTheme" parent="Theme.MaterialComponents.DayNight.NoActionBar">
  </style>
</resources>
`;

const SAMPLE_INFO_PLIST = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>CFBundleName</key>
	<string>DingDongBro</string>
</dict>
</plist>
`;

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("mobile shell policy helpers", () => {
  it("patches Android manifest and styles for landscape fullscreen mobile shells", () => {
    const manifest = ensureAndroidManifestLandscape(SAMPLE_ANDROID_MANIFEST);
    const styles = ensureAndroidStylesFullscreen(SAMPLE_ANDROID_STYLES);

    expect(manifest).toContain('android:screenOrientation="sensorLandscape"');
    expect(styles).toContain('<item name="android:windowFullscreen">true</item>');
    expect(styles).toContain('<item name="android:windowLayoutInDisplayCutoutMode">shortEdges</item>');
  });

  it("patches iOS Info.plist for landscape fullscreen mobile shells", () => {
    const infoPlist = ensureIosInfoPlistLandscapeFullscreen(SAMPLE_INFO_PLIST);

    expect(infoPlist).toContain("UISupportedInterfaceOrientations");
    expect(infoPlist).toContain("UIInterfaceOrientationLandscapeLeft");
    expect(infoPlist).toContain("UIInterfaceOrientationLandscapeRight");
    expect(infoPlist).toContain("UIRequiresFullScreen");
    expect(infoPlist).toContain("UIStatusBarHidden");
  });

  it("rewrites generated Android and iOS projects in place", async () => {
    const projectRoot = await createTempDir("dingdong-mobile-policy-");
    const androidValuesDir = join(projectRoot, "src-tauri", "gen", "android", "app", "src", "main", "res", "values");
    const androidManifestDir = join(projectRoot, "src-tauri", "gen", "android", "app", "src", "main");
    const iosAppDir = join(projectRoot, "src-tauri", "gen", "apple", "DingDongBro", "DingDongBro_iOS");

    await mkdir(androidValuesDir, { recursive: true });
    await mkdir(androidManifestDir, { recursive: true });
    await mkdir(iosAppDir, { recursive: true });
    await writeFile(join(androidManifestDir, "AndroidManifest.xml"), SAMPLE_ANDROID_MANIFEST, "utf8");
    await writeFile(join(androidValuesDir, "styles.xml"), SAMPLE_ANDROID_STYLES, "utf8");
    await writeFile(join(iosAppDir, "Info.plist"), SAMPLE_INFO_PLIST, "utf8");

    prepareMobileShellPolicy(["android", "ios"], projectRoot);

    await expect(readFile(join(androidManifestDir, "AndroidManifest.xml"), "utf8")).resolves.toContain(
      'android:screenOrientation="sensorLandscape"',
    );
    await expect(readFile(join(androidValuesDir, "styles.xml"), "utf8")).resolves.toContain(
      '<item name="android:windowFullscreen">true</item>',
    );
    await expect(readFile(join(iosAppDir, "Info.plist"), "utf8")).resolves.toContain(
      "UIRequiresFullScreen",
    );
  });
});
