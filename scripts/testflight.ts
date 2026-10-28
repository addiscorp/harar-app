// Builds the iOS app and uploads it to TestFlight, from a Mac with Xcode and
// the Apple account signed in (simien). Signing stays on this Mac: Xcode's
// automatic signing makes the distribution certificate and profile here.
//
//   bun scripts/testflight.ts            build, sign and upload
//   bun scripts/testflight.ts --no-upload   build and sign only (an .ipa in .tmp/)
//
// The build number is the commit count on this branch: Apple refuses a
// number it has seen, and a clean tree means the number names one commit.
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const tmp = join(root, ".tmp", "testflight");
const upload = !process.argv.includes("--no-upload");

function run(cmd: string, args: string[], o: { cwd?: string; log?: string } = {}) {
  const r = spawnSync(cmd, args, { cwd: o.cwd ?? root, encoding: "utf8", maxBuffer: 1 << 30 });
  if (o.log) writeFileSync(join(tmp, o.log), (r.stdout ?? "") + (r.stderr ?? ""));
  if (r.status !== 0) {
    const tail = ((r.stdout ?? "") + (r.stderr ?? "")).split("\n").filter((l) => /error|failed/i.test(l)).slice(-8);
    throw new Error(`${cmd} ${args[0]} failed${o.log ? ` (log: .tmp/testflight/${o.log})` : ""}\n${tail.join("\n")}`);
  }
  return r.stdout.trim();
}

if (process.platform !== "darwin") throw new Error("iOS builds need a Mac with Xcode (simien).");
mkdirSync(tmp, { recursive: true, mode: 0o700 });
if (run("git", ["status", "--porcelain", "--untracked-files=no"])) throw new Error("Commit first: the build number names a commit.");
const build = run("git", ["rev-list", "--count", "HEAD"]);
const commit = run("git", ["rev-parse", "--short", "HEAD"]);
// The team is the app config's, the one place it is set.
const team: string | undefined = JSON.parse(run("npx", ["expo", "config", "--json", "--type", "public"])).ios?.appleTeamId;
if (!team) throw new Error("app.config.ts names no ios.appleTeamId");
console.log(`Simien build ${build} (${commit})`);

// The phone's seal (CryptoKit) must agree with the machines' before it ships.
console.log("· native seal test");
run("bun", ["scripts/test-native.ts"], { log: "native.log" });

console.log("· native project");
run("npx", ["expo", "prebuild", "-p", "ios", "--clean", "--no-install"], { log: "prebuild.log" });
run("pod", ["install"], { cwd: join(root, "ios"), log: "pod.log" });
run("/usr/libexec/PlistBuddy", ["-c", `Set :CFBundleVersion ${build}`, join(root, "ios", "Simien", "Info.plist")]);

console.log("· archive");
const archive = join(tmp, "Simien.xcarchive");
run(
  "xcodebuild",
  ["-workspace", "ios/Simien.xcworkspace", "-scheme", "Simien", "-configuration", "Release",
   "-destination", "generic/platform=iOS", "-derivedDataPath", join(tmp, "dd"), "-archivePath", archive,
   `DEVELOPMENT_TEAM=${team}`, "CODE_SIGNING_ALLOWED=NO", "archive"],
  { log: "archive.log" },
);

// Signed for the App Store at export, where automatic signing applies.
console.log(upload ? "· sign and upload" : "· sign");
const options = join(tmp, "export.plist");
writeFileSync(
  options,
  `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>method</key><string>app-store-connect</string>
<key>destination</key><string>${upload ? "upload" : "export"}</string>
<key>teamID</key><string>${team}</string>
<key>signingStyle</key><string>automatic</string>
</dict></plist>
`,
);
const out = run(
  "xcodebuild",
  ["-exportArchive", "-archivePath", archive, "-exportPath", join(tmp, "export"), "-exportOptionsPlist", options, "-allowProvisioningUpdates"],
  { log: "export.log" },
);
if (upload && !/Uploaded Simien/.test(out)) throw new Error("Xcode didn't confirm the upload (log: .tmp/testflight/export.log)");
console.log(upload ? `Uploaded build ${build}: TestFlight shows it once Apple has processed it.` : `Signed: .tmp/testflight/export/Simien.ipa`);
