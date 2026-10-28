// The app's seal is CryptoKit's (modules/simien-enclave/ios/Seal.swift) and
// the machine's is noble's (src/protocol/seal.ts): this proves they agree, on a
// Mac with Xcode. The machine seals a share to a device; Swift opens it and
// seals it to a throwaway key; the machine opens that and gets the same share.
//
//   bun scripts/test-native.ts
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { equal, keyPair, randomBytes } from "../src/protocol/crypto";
import { toB64 } from "../src/protocol/encoding";
import { open, seal, type Sealed } from "../src/protocol/seal";

const root = join(import.meta.dir, "..");
mkdirSync(join(root, ".tmp"), { recursive: true, mode: 0o700 });
const dir = mkdtempSync(join(root, ".tmp", "native-"));
const bin = join(dir, "reseal");
const built = spawnSync(
  "xcrun",
  ["swiftc", "-O", "-o", bin, join(root, "modules/simien-enclave/ios/Seal.swift"), join(root, "modules/simien-enclave/test/reseal.swift")],
  { stdio: "inherit" },
);
if (built.status !== 0) throw new Error("swiftc failed");

function reseal(c: { device: Uint8Array; sealed: Sealed; context: Uint8Array; to: Uint8Array; nextContext: Uint8Array }) {
  const file = join(dir, "case.json");
  writeFileSync(file, JSON.stringify({ device: toB64(c.device), sealed: c.sealed, context: toB64(c.context), to: toB64(c.to), nextContext: toB64(c.nextContext) }));
  const run = spawnSync(bin, [file], { encoding: "utf8" });
  if (run.status !== 0) throw new Error(`reseal exited ${run.status}: ${run.stderr}`);
  return JSON.parse(run.stdout) as Sealed | { error: string };
}

let failed = 0;
const check = (name: string, ok: boolean) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}`);
  if (!ok) failed++;
};

for (let i = 0; i < 20; i++) {
  const device = keyPair();
  const throwaway = keyPair();
  const share = randomBytes(32);
  const context = randomBytes(32);
  const nextContext = randomBytes(32);
  const sealed = seal(device.publicKey, share, context);
  const out = reseal({ device: device.secretKey, sealed, context, to: throwaway.publicKey, nextContext });
  if ("error" in out) {
    check(`case ${i}: CryptoKit opens noble's seal (${out.error})`, false);
    continue;
  }
  if (i === 0) {
    check("CryptoKit opens noble's seal and seals again", true);
    check("noble opens CryptoKit's seal: the same share", equal(open(throwaway.secretKey, out, nextContext), share));
    let refused = false;
    try {
      open(throwaway.secretKey, out, context);
    } catch {
      refused = true;
    }
    check("CryptoKit's seal is bound to its context", refused);
    const wrong = reseal({ device: device.secretKey, sealed, context: nextContext, to: throwaway.publicKey, nextContext });
    check("CryptoKit refuses a share sealed for another context", "error" in wrong);
    const other = reseal({ device: keyPair().secretKey, sealed, context, to: throwaway.publicKey, nextContext });
    check("CryptoKit refuses a share sealed to another device", "error" in other);
  } else if (!equal(open(throwaway.secretKey, out, nextContext), share)) check(`case ${i}: the same share`, false);
}
check("20 random shares round-trip", failed === 0);
process.exit(failed ? 1 : 0);
