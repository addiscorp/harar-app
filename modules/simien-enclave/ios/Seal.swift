// The protocol's seal (src/protocol/seal.ts) in CryptoKit: ECDH P-256 →
// HKDF-SHA256 → AES-256-GCM, so the app's only encryption is the OS's.
// Byte for byte the same as the machine's: npm run test:native.
import CryptoKit
import Foundation

struct Sealed {
  /// The sender's one-time public key (x963, 65 bytes).
  let epk: Data
  /// AES-GCM nonce (12 bytes).
  let iv: Data
  /// Ciphertext and tag.
  let ct: Data
}

enum Seal {
  /// What one seal binds to: a label, and the context it was sealed for, so a
  /// sealed value can't be replayed into another.
  static func key(_ secret: SharedSecret, epk: Data, to: Data, context: Data) -> SymmetricKey {
    secret.hkdfDerivedSymmetricKey(
      using: SHA256.self, salt: context, sharedInfo: Data("simien seal v1".utf8) + epk + to, outputByteCount: 32)
  }

  /// Opens a share sealed to `to` for `context` (`agree` is ECDH with `to`'s
  /// secret key, in the Secure Enclave on a phone) and seals it to `next` for
  /// `nextContext`. The share exists only here, and is wiped before returning.
  static func reseal(
    _ sealed: Sealed, to: Data, context: Data, next: Data, nextContext: Data,
    agree: (P256.KeyAgreement.PublicKey) throws -> SharedSecret
  ) throws -> Sealed {
    let secret = try agree(P256.KeyAgreement.PublicKey(x963Representation: sealed.epk))
    let box = try AES.GCM.SealedBox(combined: sealed.iv + sealed.ct)
    var share = try AES.GCM.open(box, using: key(secret, epk: sealed.epk, to: to, context: context), authenticating: context)
    defer { share.resetBytes(in: 0..<share.count) }
    return try seal(share, to: next, context: nextContext)
  }

  static func seal(_ plaintext: Data, to: Data, context: Data) throws -> Sealed {
    let e = P256.KeyAgreement.PrivateKey()
    let epk = e.publicKey.x963Representation
    let secret = try e.sharedSecretFromKeyAgreement(with: P256.KeyAgreement.PublicKey(x963Representation: to))
    let box = try AES.GCM.seal(plaintext, using: key(secret, epk: epk, to: to, context: context), authenticating: context)
    return Sealed(epk: epk, iv: Data(box.nonce), ct: box.ciphertext + box.tag)
  }
}
