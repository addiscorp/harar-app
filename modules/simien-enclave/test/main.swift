// npm run test:native: Seal.swift's reseal, with a software key standing in
// for the Secure Enclave's, on what scripts/test-native.ts gives it.
// Reads a JSON case from argv[1] and prints the resealed share as JSON.
import CryptoKit
import Foundation

func bytes(_ s: String) -> Data {
  var t = s.replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
  while t.count % 4 != 0 { t += "=" }
  return Data(base64Encoded: t)!
}

func text(_ d: Data) -> String {
  d.base64EncodedString().replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_")
    .replacingOccurrences(of: "=", with: "")
}

let c = try JSONSerialization.jsonObject(with: Data(contentsOf: URL(fileURLWithPath: CommandLine.arguments[1]))) as! [String: Any]
let s = c["sealed"] as! [String: String]
let key = try P256.KeyAgreement.PrivateKey(rawRepresentation: bytes(c["device"] as! String))
do {
  let out = try Seal.reseal(
    Sealed(epk: bytes(s["epk"]!), iv: bytes(s["iv"]!), ct: bytes(s["ct"]!)),
    to: key.publicKey.x963Representation, context: bytes(c["context"] as! String),
    next: bytes(c["to"] as! String), nextContext: bytes(c["nextContext"] as! String)
  ) { try key.sharedSecretFromKeyAgreement(with: $0) }
  print(String(data: try JSONSerialization.data(withJSONObject: ["epk": text(out.epk), "iv": text(out.iv), "ct": text(out.ct)]), encoding: .utf8)!)
} catch {
  print("{\"error\":\"\(error)\"}")
}
