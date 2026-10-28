// Sealing a share to a public key: ECDH P-256 → HKDF-SHA256 → AES-256-GCM.
// The machine's side (and tests) only. The app never imports this: on a phone
// the same seal is CryptoKit's, in modules/simien-enclave/ios/Seal.swift, and
// the two must agree byte for byte (npm run test:native).
// The ECDH secret is the bare x-coordinate (32 bytes, what CryptoKit's
// sharedSecretFromKeyAgreement gives).
import { p256 } from "@noble/curves/nist.js";
import { gcm } from "@noble/ciphers/aes.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { concatBytes, randomBytes, utf8ToBytes } from "@noble/hashes/utils.js";
import { keyPair } from "./crypto";
import { fromB64, toB64 } from "./encoding";

export interface Sealed {
  /** The sender's one-time public key (base64url). */
  epk: string;
  /** AES-GCM nonce (base64url, 12 bytes). */
  iv: string;
  /** Ciphertext and tag (base64url). */
  ct: string;
}

function agree(secretKey: Uint8Array, publicKey: Uint8Array): Uint8Array {
  return p256.getSharedSecret(secretKey, publicKey, true).slice(1);
}

/** What one seal binds to: a label, and the context it was sealed for (a
 *  request's hash), so a sealed value can't be replayed into another. */
function sealKey(secret: Uint8Array, ephemeral: Uint8Array, to: Uint8Array, context: Uint8Array): Uint8Array {
  return hkdf(sha256, secret, context, concatBytes(utf8ToBytes("simien seal v1"), ephemeral, to), 32);
}

/** Encrypts `plaintext` so only the holder of `to`'s secret key can open it,
 *  and only for `context`. */
export function seal(to: Uint8Array, plaintext: Uint8Array, context: Uint8Array): Sealed {
  const e = keyPair();
  const secret = agree(e.secretKey, to);
  const key = sealKey(secret, e.publicKey, to, context);
  const iv = randomBytes(12);
  const ct = gcm(key, iv, context).encrypt(plaintext);
  key.fill(0);
  secret.fill(0);
  e.secretKey.fill(0);
  return { epk: toB64(e.publicKey), iv: toB64(iv), ct: toB64(ct) };
}

export function open(secretKey: Uint8Array, sealed: Sealed, context: Uint8Array): Uint8Array {
  const to = p256.getPublicKey(secretKey, false);
  const secret = agree(secretKey, fromB64(sealed.epk));
  const key = sealKey(secret, fromB64(sealed.epk), to, context);
  secret.fill(0);
  try {
    return gcm(key, fromB64(sealed.iv), context).decrypt(fromB64(sealed.ct));
  } finally {
    key.fill(0);
  }
}
