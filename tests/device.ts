import { keyPair, sign } from "../src/protocol/crypto";
import type { Device } from "../src/protocol/messages";
import { open, seal } from "../src/protocol/seal";

/** A device whose keys are software: the Secure Enclave's stand-in in tests. */
export function softwareDevice(name = "Sami's iPhone"): Device & { signs: number } {
  const s = keyPair();
  const k = keyPair();
  const d = {
    name,
    signingKey: s.publicKey,
    agreementKey: k.publicKey,
    signs: 0,
    async sign(m: Uint8Array) {
      d.signs++;
      return sign(s.secretKey, m);
    },
    async reseal(sealed: Parameters<Device["reseal"]>[0], context: Uint8Array, to: Uint8Array, newContext: Uint8Array) {
      const share = open(k.secretKey, sealed, context);
      try {
        return seal(to, share, newContext);
      } finally {
        share.fill(0);
      }
    },
  };
  return d;
}
