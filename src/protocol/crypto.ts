// The few primitives the protocol uses, on P-256 so an iPhone's Secure Enclave
// (CryptoKit's SecureEnclave.P256) can hold the device's keys:
//   sign / verify: ECDSA P-256 over SHA-256, the signature as r ‖ s (64 bytes);
//   seal / open:   ECDH P-256 → HKDF-SHA256 → AES-256-GCM, to a public key.
// Public keys travel as uncompressed points (65 bytes, CryptoKit's
// x963Representation); the ECDH secret is the bare x-coordinate (32 bytes,
// what CryptoKit's sharedSecretFromKeyAgreement returns).
import { p256 } from "@noble/curves/nist.js";
import { gcm } from "@noble/ciphers/aes.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { hmac } from "@noble/hashes/hmac.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { concatBytes, randomBytes, utf8ToBytes } from "@noble/hashes/utils.js";
import { fromB64, toB64 } from "./encoding";

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

/** ECDH's shared x-coordinate, as CryptoKit gives it. */
export function agree(secretKey: Uint8Array, publicKey: Uint8Array): Uint8Array {
  return p256.getSharedSecret(secretKey, publicKey, true).slice(1);
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

/** What one seal binds to: a label, and the context it was sealed for (a
 *  request's hash), so a sealed value can't be replayed into another. */
function sealKey(secret: Uint8Array, ephemeral: Uint8Array, to: Uint8Array, context: Uint8Array): Uint8Array {
  return hkdf(sha256, secret, context, concatBytes(utf8ToBytes("simien seal v1"), ephemeral, to), 32);
}

export interface Sealed {
  /** The sender's one-time public key (base64url). */
  epk: string;
  /** AES-GCM nonce (base64url, 12 bytes). */
  iv: string;
  /** Ciphertext and tag (base64url). */
  ct: string;
}

/** Encrypts `plaintext` so only the holder of `to`'s secret key can open it,
 *  and only for `context`. */
export function seal(to: Uint8Array, plaintext: Uint8Array, context: Uint8Array): Sealed {
  const e = keyPair();
  const key = sealKey(agree(e.secretKey, to), e.publicKey, to, context);
  const iv = randomBytes(12);
  const ct = gcm(key, iv, context).encrypt(plaintext);
  key.fill(0);
  e.secretKey.fill(0);
  return { epk: toB64(e.publicKey), iv: toB64(iv), ct: toB64(ct) };
}

/** Opens a seal, given the ECDH secret with its `epk` (computed by whoever
 *  holds the recipient's key: software here, the Secure Enclave on a phone). */
export function openWithSecret(secret: Uint8Array, to: Uint8Array, sealed: Sealed, context: Uint8Array): Uint8Array {
  const key = sealKey(secret, fromB64(sealed.epk), to, context);
  try {
    return gcm(key, fromB64(sealed.iv), context).decrypt(fromB64(sealed.ct));
  } finally {
    key.fill(0);
  }
}

export function open(secretKey: Uint8Array, sealed: Sealed, context: Uint8Array): Uint8Array {
  const to = p256.getPublicKey(secretKey, false);
  const secret = agree(secretKey, fromB64(sealed.epk));
  try {
    return openWithSecret(secret, to, sealed, context);
  } finally {
    secret.fill(0);
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
