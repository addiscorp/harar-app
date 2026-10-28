// The primitives both sides use, on P-256 so an iPhone's Secure Enclave
// (CryptoKit's SecureEnclave.P256) can hold the device's keys: ECDSA P-256 over
// SHA-256 (the signature as r ‖ s, 64 bytes), HMAC and HKDF. None of it
// encrypts: sealing a share is the machine's (./seal.ts) and, on a phone,
// CryptoKit's. Public keys travel as uncompressed points (65 bytes, CryptoKit's
// x963Representation).
import { p256 } from "@noble/curves/nist.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { hmac } from "@noble/hashes/hmac.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { concatBytes, randomBytes, utf8ToBytes } from "@noble/hashes/utils.js";

export { sha256, randomBytes, utf8ToBytes, concatBytes };

/** A software key pair: the machine side of the protocol, and tests. */
export interface KeyPair {
  secretKey: Uint8Array;
  publicKey: Uint8Array;
}

export function keyPair(): KeyPair {
  const secretKey = p256.utils.randomSecretKey();
  return { secretKey, publicKey: p256.getPublicKey(secretKey, false) };
}

export function sign(secretKey: Uint8Array, message: Uint8Array): Uint8Array {
  return p256.sign(message, secretKey, { prehash: true });
}

/** CryptoKit doesn't normalise S, so a high S is accepted: ECDSA's malleability
 *  doesn't matter here, where a signature is never used as an identifier. */
export function verify(publicKey: Uint8Array, message: Uint8Array, signature: Uint8Array): boolean {
  try {
    return p256.verify(signature, message, publicKey, { prehash: true, lowS: false });
  } catch {
    return false;
  }
}

/** Whether `bytes` is a valid uncompressed P-256 public key. */
export function isPublicKey(bytes: Uint8Array): boolean {
  if (bytes.length !== 65 || bytes[0] !== 4) return false;
  try {
    p256.Point.fromBytes(bytes).assertValidity();
    return true;
  } catch {
    return false;
  }
}

export function mac(key: Uint8Array, message: Uint8Array): Uint8Array {
  return hmac(sha256, key, message);
}

/** Compares in constant time for equal lengths. */
export function equal(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a[i] ^ b[i];
  return d === 0;
}

/** The vault's master key from its two shares: the machine's (sealed in its
 *  chip) and the person's (held by their device). Neither alone gives it. */
export function combineShares(machineShare: Uint8Array, personShare: Uint8Array): Uint8Array {
  if (machineShare.length !== 32 || personShare.length !== 32) throw new Error("a share is 32 bytes");
  return hkdf(sha256, concatBytes(machineShare, personShare), undefined, utf8ToBytes("simien master key v1"), 32);
}
