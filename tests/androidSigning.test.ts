import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, describe, expect, it } from "bun:test";

import {
  ANDROID_RELEASE_KEY_ALIAS_ENV,
  ANDROID_RELEASE_KEYSTORE_BASE64_ENV,
  ANDROID_RELEASE_KEYSTORE_FILE_NAME,
  ANDROID_RELEASE_KEYSTORE_PASSWORD_ENV,
  ANDROID_RELEASE_KEYSTORE_PROPERTIES_FILE_NAME,
  createAndroidKeystorePropertiesSource,
  ensureAndroidGradleReleaseSigning,
  prepareAndroidReleaseSigning,
  resolveAndroidReleaseSigningConfig,
} from "../scripts/lib/androidSigning";

const tempDirs: string[] = [];

const createTempDir = async (prefix: string): Promise<string> => {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
};

const SAMPLE_BUILD_GRADLE = `plugins {
    id("com.android.application")
}

android {
    buildTypes {
        getByName("debug") {
            isDebuggable = true
        }
        getByName("release") {
            isMinifyEnabled = true
        }
    }
}
`;

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("android release signing helpers", () => {
  it("requires upload-keystore signing env vars for Android release builds", () => {
    expect(() => resolveAndroidReleaseSigningConfig({})).toThrow(
      /ANDROID_RELEASE_KEYSTORE_BASE64, ANDROID_RELEASE_KEYSTORE_PASSWORD, ANDROID_RELEASE_KEY_ALIAS/,
    );
  });

  it("writes Android keystore.properties with the expected upload-keystore fields", () => {
    const config = resolveAndroidReleaseSigningConfig({
      [ANDROID_RELEASE_KEYSTORE_BASE64_ENV]: Buffer.from("fake-keystore", "utf8").toString("base64"),
      [ANDROID_RELEASE_KEYSTORE_PASSWORD_ENV]: "store-password",
      [ANDROID_RELEASE_KEY_ALIAS_ENV]: "upload",
    });

    expect(createAndroidKeystorePropertiesSource(config)).toBe([
      "password=store-password",
      "storePassword=store-password",
      "keyPassword=store-password",
      "keyAlias=upload",
      `storeFile=${ANDROID_RELEASE_KEYSTORE_FILE_NAME}`,
      "",
    ].join("\n"));
  });

  it("patches the generated Android Gradle config for release signing", () => {
    const patched = ensureAndroidGradleReleaseSigning(SAMPLE_BUILD_GRADLE);

    expect(patched).toContain("import java.io.FileInputStream");
    expect(patched).toContain("import java.util.Properties");
    expect(patched).toContain('create("release")');
    expect(patched).toContain('keyAlias = keystoreProperties["keyAlias"] as String');
    expect(patched).toContain('storeFile = rootProject.file(keystoreProperties["storeFile"] as String)');
    expect(patched).toContain('signingConfig = signingConfigs.getByName("release")');
    expect(ensureAndroidGradleReleaseSigning(patched)).toBe(patched);
  });

  it("writes the upload keystore and patches the generated Android project", async () => {
    const projectRoot = await createTempDir("dingdong-android-signing-");
    const androidProjectDir = join(projectRoot, "src-tauri", "gen", "android");
    const appDir = join(androidProjectDir, "app");

    await mkdir(appDir, { recursive: true });
    await writeFile(join(appDir, "build.gradle.kts"), SAMPLE_BUILD_GRADLE, "utf8");

    prepareAndroidReleaseSigning(projectRoot, {
      [ANDROID_RELEASE_KEYSTORE_BASE64_ENV]: Buffer.from("fake-keystore", "utf8").toString("base64"),
      [ANDROID_RELEASE_KEYSTORE_PASSWORD_ENV]: "store-password",
      [ANDROID_RELEASE_KEY_ALIAS_ENV]: "upload",
    });

    await expect(readFile(join(androidProjectDir, ANDROID_RELEASE_KEYSTORE_PROPERTIES_FILE_NAME), "utf8")).resolves.toContain(
      "keyAlias=upload",
    );
    await expect(readFile(join(androidProjectDir, ANDROID_RELEASE_KEYSTORE_FILE_NAME), "utf8")).resolves.toBe(
      "fake-keystore",
    );
    await expect(readFile(join(appDir, "build.gradle.kts"), "utf8")).resolves.toContain(
      'signingConfig = signingConfigs.getByName("release")',
    );
  });
});