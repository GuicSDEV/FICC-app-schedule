#!/usr/bin/env node
/**
 * Sets the app version shown in the stores (e.g. 1.2.0) on Android and iOS at once, and bumps the
 * build number both stores require to grow with every upload.
 *
 *   pnpm --filter @ficc/mobile version:set 1.2.0
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const version = process.argv[2];
if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
  console.error("Use: version:set <major.minor.patch>, e.g. 1.2.0");
  process.exit(1);
}

const gradlePath = join(root, "android/app/build.gradle");
const gradle = readFileSync(gradlePath, "utf8");
const build = Number(/versionCode (\d+)/.exec(gradle)?.[1] ?? "0") + 1;
writeFileSync(
  gradlePath,
  gradle
    .replace(/versionCode \d+/, `versionCode ${build}`)
    .replace(/versionName "[^"]*"/, `versionName "${version}"`),
);

const pbxPath = join(root, "ios/App/App.xcodeproj/project.pbxproj");
writeFileSync(
  pbxPath,
  readFileSync(pbxPath, "utf8")
    .replace(/MARKETING_VERSION = [^;]+;/g, `MARKETING_VERSION = ${version};`)
    .replace(/CURRENT_PROJECT_VERSION = [^;]+;/g, `CURRENT_PROJECT_VERSION = ${build};`),
);

const pkgPath = join(root, "package.json");
const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
pkg.version = version;
writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);

console.log(`FICC Tênis ${version} (build ${build}) on Android and iOS.`);
