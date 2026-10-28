// The Simien app's device keys, in the Secure Enclave: one P-256 key that
// signs and one that agrees (ECDH), both made inside the Enclave, both usable
// only after Face ID (biometry of the person enrolled now), on this device
// only. The app keeps their opaque handles; a handle opens nothing elsewhere.
//
// It also finds machines on the local network (Bonjour, _simien._tcp).
import CryptoKit
import ExpoModulesCore
import Foundation
import LocalAuthentication

public class SimienEnclaveModule: Module {
  private var browser: Browser?
  /// One Face ID covers one approval: `authenticate` evaluates a context, and
  /// the key operations that follow within its life use it without asking again.
  private var context: LAContext?
  private var contextAt = Date.distantPast
  private static let contextLife: TimeInterval = 30

  public func definition() -> ModuleDefinition {
    Name("SimienEnclave")
    Events("onService")

    Function("isAvailable") { SecureEnclave.isAvailable }

    AsyncFunction("createDevice") { (tag: String) -> [String: String] in
      guard SecureEnclave.isAvailable else { throw EnclaveError("this device has no Secure Enclave") }
      var error: Unmanaged<CFError>?
      guard
        let access = SecAccessControlCreateWithFlags(
          nil, kSecAttrAccessibleWhenUnlockedThisDeviceOnly, [.privateKeyUsage, .biometryCurrentSet], &error)
      else { throw EnclaveError("no access control: \(String(describing: error?.takeRetainedValue()))") }
      let signing = try SecureEnclave.P256.Signing.PrivateKey(accessControl: access)
      let agreement = try SecureEnclave.P256.KeyAgreement.PrivateKey(accessControl: access)
      try Handles.save(tag + ".signing", signing.dataRepresentation)
      try Handles.save(tag + ".agreement", agreement.dataRepresentation)
      return [
        "signing": b64(signing.publicKey.x963Representation),
        "agreement": b64(agreement.publicKey.x963Representation),
      ]
    }

    AsyncFunction("publicKeys") { (tag: String) -> [String: String]? in
      guard let s = Handles.load(tag + ".signing"), let a = Handles.load(tag + ".agreement") else { return nil }
      // Reading a public key needs no Face ID.
      let signing = try SecureEnclave.P256.Signing.PrivateKey(dataRepresentation: s)
      let agreement = try SecureEnclave.P256.KeyAgreement.PrivateKey(dataRepresentation: a)
      return [
        "signing": b64(signing.publicKey.x963Representation),
        "agreement": b64(agreement.publicKey.x963Representation),
      ]
    }

    AsyncFunction("authenticate") { (reason: String, promise: Promise) in
      let ctx = LAContext()
      ctx.localizedReason = reason
      ctx.evaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, localizedReason: reason) { ok, error in
        if ok {
          self.context = ctx
          self.contextAt = Date()
          promise.resolve(true)
        } else {
          promise.reject("E_AUTH", error?.localizedDescription ?? "not approved")
        }
      }
    }

    AsyncFunction("sign") { (tag: String, message: String) -> String in
      guard let handle = Handles.load(tag + ".signing") else { throw EnclaveError("no device key") }
      let key = try SecureEnclave.P256.Signing.PrivateKey(
        dataRepresentation: handle, authenticationContext: try self.liveContext())
      return b64(try key.signature(for: try unb64(message)).rawRepresentation)
    }

    AsyncFunction("agree") { (tag: String, peer: String) -> String in
      guard let handle = Handles.load(tag + ".agreement") else { throw EnclaveError("no device key") }
      let key = try SecureEnclave.P256.KeyAgreement.PrivateKey(
        dataRepresentation: handle, authenticationContext: try self.liveContext())
      let secret = try key.sharedSecretFromKeyAgreement(
        with: P256.KeyAgreement.PublicKey(x963Representation: try unb64(peer)))
      return secret.withUnsafeBytes { b64(Data($0)) }
    }

    Function("endApproval") {
      self.context?.invalidate()
      self.context = nil
    }

    Function("startBrowsing") {
      self.browser?.stop()
      self.browser = Browser { service in self.sendEvent("onService", service) }
      self.browser?.start()
    }

    Function("stopBrowsing") {
      self.browser?.stop()
      self.browser = nil
    }
  }

  private func liveContext() throws -> LAContext {
    guard let ctx = context, Date().timeIntervalSince(contextAt) < Self.contextLife else {
      throw EnclaveError("approve with Face ID first")
    }
    return ctx
  }
}

struct EnclaveError: Error, CustomStringConvertible {
  let description: String
  init(_ d: String) { description = d }
}

/// The keys' opaque handles, in the keychain, on this device only.
enum Handles {
  static let service = "gg.addis.simien.enclave"

  static func save(_ account: String, _ data: Data) throws {
    let base: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
      kSecAttrAccount as String: account,
    ]
    SecItemDelete(base as CFDictionary)
    var item = base
    item[kSecValueData as String] = data
    item[kSecAttrAccessible as String] = kSecAttrAccessibleWhenUnlockedThisDeviceOnly
    let status = SecItemAdd(item as CFDictionary, nil)
    guard status == errSecSuccess else { throw EnclaveError("keychain: \(status)") }
  }

  static func load(_ account: String) -> Data? {
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
      kSecAttrAccount as String: account,
      kSecReturnData as String: true,
    ]
    var out: CFTypeRef?
    return SecItemCopyMatching(query as CFDictionary, &out) == errSecSuccess ? out as? Data : nil
  }
}

func b64(_ d: Data) -> String {
  d.base64EncodedString().replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_")
    .replacingOccurrences(of: "=", with: "")
}

func unb64(_ s: String) throws -> Data {
  var t = s.replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
  while t.count % 4 != 0 { t += "=" }
  guard let d = Data(base64Encoded: t) else { throw EnclaveError("not base64url") }
  return d
}

/// Bonjour: each _simien._tcp service on the local network, resolved to a host and port.
final class Browser: NSObject, NetServiceBrowserDelegate, NetServiceDelegate {
  private let found: ([String: Any]) -> Void
  private let browser = NetServiceBrowser()
  private var resolving: [NetService] = []

  init(found: @escaping ([String: Any]) -> Void) {
    self.found = found
    super.init()
    browser.delegate = self
  }

  func start() { browser.searchForServices(ofType: "_simien._tcp.", inDomain: "local.") }

  func stop() {
    browser.stop()
    resolving.forEach { $0.stop() }
    resolving.removeAll()
  }

  func netServiceBrowser(_ b: NetServiceBrowser, didFind service: NetService, moreComing: Bool) {
    service.delegate = self
    resolving.append(service)
    service.resolve(withTimeout: 5)
  }

  func netServiceBrowser(_ b: NetServiceBrowser, didRemove service: NetService, moreComing: Bool) {
    found(["name": service.name, "gone": true])
  }

  func netServiceDidResolveAddress(_ service: NetService) {
    guard let host = service.hostName else { return }
    found(["name": service.name, "host": host, "port": service.port])
    resolving.removeAll { $0 === service }
  }

  func netService(_ service: NetService, didNotResolve errorDict: [String: NSNumber]) {
    resolving.removeAll { $0 === service }
  }
}
