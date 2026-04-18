import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { resolveTauriMobileProjectDir } from "./nativePackaging";

export const ANDROID_RELEASE_KEYSTORE_BASE64_ENV = "ANDROID_RELEASE_KEYSTORE_BASE64";
export const ANDROID_RELEASE_KEYSTORE_PASSWORD_ENV = "ANDROID_RELEASE_KEYSTORE_PASSWORD";
export const ANDROID_RELEASE_KEY_ALIAS_ENV = "ANDROID_RELEASE_KEY_ALIAS";
export const ANDROID_RELEASE_KEY_PASSWORD_ENV = "ANDROID_RELEASE_KEY_PASSWORD";

export const ANDROID_RELEASE_KEYSTORE_FILE_NAME = "ci-upload-keystore.jks";
export const ANDROID_RELEASE_KEYSTORE_PROPERTIES_FILE_NAME = "keystore.properties";

const FILE_INPUT_STREAM_IMPORT = "import java.io.FileInputStream";
const PROPERTIES_IMPORT = "import java.util.Properties";
const RELEASE_SIGNING_CONFIG_LINE = 'signingConfig = signingConfigs.getByName("release")';

const REQUIRED_ANDROID_SIGNING_ENVS = [
  ANDROID_RELEASE_KEYSTORE_BASE64_ENV,
  ANDROID_RELEASE_KEYSTORE_PASSWORD_ENV,
  ANDROID_RELEASE_KEY_ALIAS_ENV,
] as const;

export interface AndroidReleaseSigningConfig {
  keyAlias: string;
  keyPassword: string;
  keystoreBytes: Buffer;
  storeFileName: string;
  storePassword: string;
}

const prependImport = (source: string, importLine: string): string => (
  source.includes(importLine) ? source : `${importLine}\n${source}`
);

export const resolveAndroidReleaseSigningConfig = (
  env: Record<string, string | undefined> = process.env,
): AndroidReleaseSigningConfig => {
  const missingEnvs = REQUIRED_ANDROID_SIGNING_ENVS.filter((name) => !env[name]);

  if (missingEnvs.length > 0) {
    throw new Error(
      [
        "Android release signing requires GitHub secrets or env vars for:",
        missingEnvs.join(", "),
        "These values configure the upload keystore used for CI signing, not the Play App Signing key.",
      ].join(" "),
    );
  }

  const keystoreBytes = Buffer.from(env[ANDROID_RELEASE_KEYSTORE_BASE64_ENV]!, "base64");
  if (keystoreBytes.length === 0) {
    throw new Error(`${ANDROID_RELEASE_KEYSTORE_BASE64_ENV} did not decode into a keystore file.`);
  }

  return {
    keyAlias: env[ANDROID_RELEASE_KEY_ALIAS_ENV]!,
    keyPassword: env[ANDROID_RELEASE_KEY_PASSWORD_ENV] ?? env[ANDROID_RELEASE_KEYSTORE_PASSWORD_ENV]!,
    keystoreBytes,
    storeFileName: ANDROID_RELEASE_KEYSTORE_FILE_NAME,
    storePassword: env[ANDROID_RELEASE_KEYSTORE_PASSWORD_ENV]!,
  };
};

export const createAndroidKeystorePropertiesSource = (
  config: AndroidReleaseSigningConfig,
): string => [
  `password=${config.storePassword}`,
  `storePassword=${config.storePassword}`,
  `keyPassword=${config.keyPassword}`,
  `keyAlias=${config.keyAlias}`,
  `storeFile=${config.storeFileName}`,
  "",
].join("\n");

export const ensureAndroidGradleReleaseSigning = (source: string): string => {
  let nextSource = prependImport(prependImport(source, PROPERTIES_IMPORT), FILE_INPUT_STREAM_IMPORT);

  if (!nextSource.includes("android {")) {
    throw new Error("Android Gradle config is missing the android block needed for release signing.");
  }

  if (!nextSource.includes('create("release") {')) {
    const buildTypesMatch = /\n(\s*)buildTypes\s*\{/.exec(nextSource);
    if (!buildTypesMatch) {
      throw new Error("Android Gradle config is missing the buildTypes block needed for release signing.");
    }

    const indent = buildTypesMatch[1] ?? "    ";
    const signingConfigBlock = [
      `${indent}signingConfigs {`,
      `${indent}    create("release") {`,
      `${indent}        val keystorePropertiesFile = rootProject.file("keystore.properties")`,
      `${indent}        val keystoreProperties = Properties()`,
      `${indent}        if (keystorePropertiesFile.exists()) {`,
      `${indent}            keystoreProperties.load(FileInputStream(keystorePropertiesFile))`,
      `${indent}        }`,
      `${indent}        keyAlias = keystoreProperties["keyAlias"] as String`,
      `${indent}        keyPassword = (keystoreProperties["keyPassword"] ?: keystoreProperties["password"]) as String`,
      `${indent}        storeFile = rootProject.file(keystoreProperties["storeFile"] as String)`,
      `${indent}        storePassword = (keystoreProperties["storePassword"] ?: keystoreProperties["password"]) as String`,
      `${indent}    }`,
      `${indent}}`,
    ].join("\n");

    nextSource = nextSource.replace(/\n\s*buildTypes\s*\{/, `\n${signingConfigBlock}\n\n${indent}buildTypes {`);
  }

  if (!nextSource.includes(RELEASE_SIGNING_CONFIG_LINE)) {
    nextSource = nextSource.replace(
      /(\n(\s*)getByName\("release"\)\s*\{\n)/,
      (_match, header, indent: string) => `${header}${indent}    ${RELEASE_SIGNING_CONFIG_LINE}\n`,
    );
  }

  return nextSource;
};

export const prepareAndroidReleaseSigning = (
  projectRoot: string = process.cwd(),
  env: Record<string, string | undefined> = process.env,
): void => {
  const config = resolveAndroidReleaseSigningConfig(env);
  const androidProjectDir = resolveTauriMobileProjectDir("android", projectRoot);
  const buildGradlePath = resolve(androidProjectDir, "app", "build.gradle.kts");

  if (!existsSync(buildGradlePath)) {
    throw new Error(
      `Android release signing requires the generated Gradle project at ${buildGradlePath}. Run tauri android init before building.`,
    );
  }

  mkdirSync(androidProjectDir, { recursive: true });
  writeFileSync(resolve(androidProjectDir, ANDROID_RELEASE_KEYSTORE_FILE_NAME), config.keystoreBytes);
  writeFileSync(
    resolve(androidProjectDir, ANDROID_RELEASE_KEYSTORE_PROPERTIES_FILE_NAME),
    createAndroidKeystorePropertiesSource(config),
    "utf8",
  );

  const buildGradleSource = readFileSync(buildGradlePath, "utf8");
  writeFileSync(buildGradlePath, ensureAndroidGradleReleaseSigning(buildGradleSource), "utf8");
};