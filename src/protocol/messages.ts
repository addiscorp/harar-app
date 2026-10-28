// The Simien unseal protocol, v1: between a person's device (the Simien app,
// keys in its Secure Enclave) and a service that starts sealed (harar, then
// gondar), over the local network only. Nothing in it trusts the network:
// every message is signed, and every share is sealed to one key.
//
// Pairing, once per device and machine:
//   the machine shows a one-time code (100 bits, so a recorded pairing can't
//   be brute-forced offline); the device sends its public keys with a proof it
//   knows the code; the machine answers, signed and with its own proof, with
//   the person's share sealed to the device. The device pins the machine key
//   the code vouched for.
// Unsealing, after each start:
//   the running instance makes a throwaway key and asks, signed by the machine
//   key; the person approves; the device opens its share (Face ID) and seals it
//   to that throwaway key alone, signed by the device. The machine combines it
//   with its own share into the master key, in memory.
import {
  combineShares,
  concatBytes,
  equal,
  isPublicKey,
  keyPair,
  mac,
  open,
  openWithSecret,
  randomBytes,
  seal,
  sha256,
  sign,
  utf8ToBytes,
  verify,
  type KeyPair,
  type Sealed,
} from "./crypto";
import { canonical, fromB64, toB64, toHex } from "./encoding";
import { hkdf } from "@noble/hashes/hkdf.js";

export const VERSION = 1;
/** The longest an unseal request may be valid: minutes, never hours. */
export const MAX_REQUEST_MS = 10 * 60 * 1000;
export const SERVICE_TYPE = "_simien._tcp";

/** A signed message: its body as canonical JSON is what was signed. */
export interface Signed<T> {
  body: T;
  sig: string;
}

const bytesOf = (body: unknown) => utf8ToBytes(canonical(body));
export const hashOf = (body: unknown) => sha256(bytesOf(body));

/** What the person's device can do with its keys, wherever they live: the
 *  Secure Enclave on a phone (behind Face ID), software in tests. */
export interface Device {
  name: string;
  /** Its signing public key (uncompressed P-256). */
  signingKey: Uint8Array;
  /** Its key-agreement public key, for shares sealed to it. */
  agreementKey: Uint8Array;
  sign(message: Uint8Array): Promise<Uint8Array>;
  /** ECDH with `publicKey`: the shared x-coordinate. */
  agree(publicKey: Uint8Array): Promise<Uint8Array>;
}

// ---------- pairing ----------

const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTVWXYZ0123456789"; // 32: no I, L, O, U

/** A pairing code: 20 symbols of 5 bits, shown as four groups of five. */
export function pairingCode(): string {
  const bytes = randomBytes(20);
  const symbols = Array.from(bytes, (b) => CODE_ALPHABET[b & 31]).join("");
  return symbols.match(/.{5}/g)!.join("-");
}

/** The code as typed: case, spaces and dashes don't matter. */
export function normalCode(code: string): string {
  return code.toUpperCase().replace(/[\s-]/g, "");
}

function codeKey(code: string, nonce: string): Uint8Array {
  return hkdf(sha256, utf8ToBytes(normalCode(code)), fromB64(nonce), utf8ToBytes("simien pairing v1"), 32);
}

/** What a machine says about itself before pairing; nothing in it is trusted
 *  until the code vouches for it. */
export interface Hello {
  v: number;
  name: string;
  machine: string;
  services: string[];
  /** Set while the machine is showing a code. */
  pairing: { nonce: string } | null;
}

export interface PairBody {
  v: number;
  type: "pair";
  machine: string;
  nonce: string;
  device: { name: string; signing: string; agreement: string };
}

export interface PairRequest {
  body: PairBody;
  proof: string;
}

export interface PairedBody {
  v: number;
  type: "paired";
  machine: string;
  name: string;
  services: string[];
  device: string;
  request: string;
  share: Sealed;
}

export interface PairResponse extends Signed<PairedBody> {
  proof: string;
}

export function pairRequest(hello: Hello, device: Device, code: string): PairRequest {
  if (!hello.pairing) throw new Error(`${hello.name} isn't pairing; show a code on it first`);
  const body: PairBody = {
    v: VERSION,
    type: "pair",
    machine: hello.machine,
    nonce: hello.pairing.nonce,
    device: { name: device.name, signing: toB64(device.signingKey), agreement: toB64(device.agreementKey) },
  };
  return { body, proof: toB64(mac(codeKey(code, body.nonce), bytesOf(body))) };
}

/** A machine's side: the person's share, the code it showed, its key. */
export interface MachineState {
  name: string;
  services: string[];
  key: KeyPair;
  /** The machine's share: in the chip on a real machine. */
  machineShare: Uint8Array;
  /** The person's share: given to each device at pairing, then not kept. */
  personShare: Uint8Array | null;
  /** A check value of the master key, to know a share was the right one. */
  check: Uint8Array;
  devices: { name: string; signing: string }[];
  pairing: { code: string; nonce: string; attempts: number } | null;
}

export const PAIRING_ATTEMPTS = 5;

const checkOf = (master: Uint8Array) => mac(master, utf8ToBytes("simien master check v1"));

export function newMachine(name: string, services: string[]): MachineState {
  const machineShare = randomBytes(32);
  const personShare = randomBytes(32);
  const master = combineShares(machineShare, personShare);
  const check = checkOf(master);
  master.fill(0);
  return { name, services, key: keyPair(), machineShare, personShare, check, devices: [], pairing: null };
}

export function hello(m: MachineState): Hello {
  return {
    v: VERSION,
    name: m.name,
    machine: toB64(m.key.publicKey),
    services: m.services,
    pairing: m.pairing ? { nonce: m.pairing.nonce } : null,
  };
}

export function startPairing(m: MachineState): string {
  if (!m.personShare) throw new Error("the person's share is gone: pair a new device from one already paired");
  const code = pairingCode();
  m.pairing = { code, nonce: toB64(randomBytes(16)), attempts: 0 };
  return code;
}

/** The machine checks a pairing: the right code, within the attempts, once. */
export function acceptPairing(m: MachineState, r: PairRequest): PairResponse {
  const p = m.pairing;
  if (!p) throw new Error("not pairing");
  if (++p.attempts > PAIRING_ATTEMPTS) {
    m.pairing = null;
    throw new Error("too many attempts: pairing closed");
  }
  const key = codeKey(p.code, p.nonce);
  if (
    r.body.v !== VERSION ||
    r.body.type !== "pair" ||
    r.body.machine !== toB64(m.key.publicKey) ||
    r.body.nonce !== p.nonce ||
    !equal(mac(key, bytesOf(r.body)), fromB64(r.proof))
  )
    throw new Error("the code doesn't match");
  const signing = fromB64(r.body.device.signing);
  const agreement = fromB64(r.body.device.agreement);
  if (!isPublicKey(signing) || !isPublicKey(agreement)) throw new Error("not a device key");
  if (!m.personShare) throw new Error("the person's share is gone");
  m.pairing = null;
  const request = hashOf(r.body);
  const body: PairedBody = {
    v: VERSION,
    type: "paired",
    machine: toB64(m.key.publicKey),
    name: m.name,
    services: m.services,
    device: r.body.device.signing,
    request: toHex(request),
    share: seal(agreement, m.personShare, request),
  };
  m.devices.push({ name: r.body.device.name, signing: r.body.device.signing });
  return { body, sig: toB64(sign(m.key.secretKey, bytesOf(body))), proof: toB64(mac(key, bytesOf(body))) };
}

/** What a device keeps for a machine it paired with. */
export interface Pinned {
  name: string;
  machine: string;
  services: string[];
  /** The person's share, sealed to this device's agreement key. */
  share: Sealed;
  /** What the share was sealed for (the pairing request's hash). */
  context: string;
}

/** The device checks the machine's answer: signed by the key it named, and
 *  vouched for by the code; only then is the machine pinned. */
export function finishPairing(r: PairRequest, response: PairResponse, code: string): Pinned {
  const b = response.body;
  const key = codeKey(code, r.body.nonce);
  if (!equal(mac(key, bytesOf(b)), fromB64(response.proof))) throw new Error("the machine doesn't know the code");
  if (b.v !== VERSION || b.type !== "paired" || b.machine !== r.body.machine || b.device !== r.body.device.signing)
    throw new Error("not an answer to this pairing");
  if (b.request !== toHex(hashOf(r.body))) throw new Error("not an answer to this pairing");
  if (!verify(fromB64(b.machine), bytesOf(b), fromB64(response.sig))) throw new Error("the machine's signature is wrong");
  return { name: b.name, machine: b.machine, services: b.services, share: b.share, context: b.request };
}

// ---------- unsealing ----------

export interface UnsealRequestBody {
  v: number;
  type: "unseal-request";
  id: string;
  /** Which service is asking: harar, gondar. */
  service: string;
  machine: string;
  version: string;
  /** The running binary's hash, as the OS reported it (cdhash, fs-verity). */
  binary: string;
  boot: string;
  started: string;
  config: string;
  /** This instance's throwaway key: the share is sealed to it alone. */
  throwaway: string;
  expires: string;
}

export type UnsealRequest = Signed<UnsealRequestBody>;

/** The running instance's side: its throwaway key stays in its memory. */
export function unsealRequest(
  m: MachineState,
  o: { service: string; version: string; binary: string; boot: string; config: string; started: Date; now: Date },
): { request: UnsealRequest; throwaway: KeyPair } {
  const throwaway = keyPair();
  const body: UnsealRequestBody = {
    v: VERSION,
    type: "unseal-request",
    id: toB64(randomBytes(16)),
    service: o.service,
    machine: toB64(m.key.publicKey),
    version: o.version,
    binary: o.binary,
    boot: o.boot,
    started: o.started.toISOString(),
    config: o.config,
    throwaway: toB64(throwaway.publicKey),
    expires: new Date(o.now.getTime() + 5 * 60 * 1000).toISOString(),
  };
  return { request: { body, sig: toB64(sign(m.key.secretKey, bytesOf(body))) }, throwaway };
}

/** Why the device must not offer `r` for approval, or null. `answered` is
 *  every request id it has answered: one answer per request, ever. */
export function requestProblem(r: UnsealRequest, pinned: Pinned, now: Date, answered: ReadonlySet<string>): string | null {
  const b = r.body;
  if (b.v !== VERSION || b.type !== "unseal-request") return "not an unseal request";
  if (b.machine !== pinned.machine) return `not from ${pinned.name}`;
  if (!verify(fromB64(pinned.machine), bytesOf(b), fromB64(r.sig))) return `the signature isn't ${pinned.name}'s`;
  if (!pinned.services.includes(b.service)) return `${pinned.name} has no ${b.service}`;
  const expires = Date.parse(b.expires);
  if (!Number.isFinite(expires) || expires <= now.getTime()) return "expired";
  if (expires - now.getTime() > MAX_REQUEST_MS) return "valid for too long";
  if (!isPublicKey(fromB64(b.throwaway))) return "no throwaway key";
  if (answered.has(b.id)) return "already answered";
  return null;
}

export interface UnsealAnswerBody {
  v: number;
  type: "unseal-answer";
  request: string;
  device: string;
  share: Sealed;
}

export type UnsealAnswer = Signed<UnsealAnswerBody>;

/** The person said yes: the device opens its share and seals it to the
 *  requesting instance alone. Call only after requestProblem said null. */
export async function answerUnseal(device: Device, pinned: Pinned, r: UnsealRequest): Promise<UnsealAnswer> {
  const secret = await device.agree(fromB64(pinned.share.epk));
  const share = openWithSecret(secret, device.agreementKey, pinned.share, fromHex(pinned.context));
  secret.fill(0);
  try {
    const request = hashOf(r.body);
    const body: UnsealAnswerBody = {
      v: VERSION,
      type: "unseal-answer",
      request: toHex(request),
      device: toB64(device.signingKey),
      share: seal(fromB64(r.body.throwaway), share, request),
    };
    return { body, sig: toB64(await device.sign(bytesOf(body))) };
  } finally {
    share.fill(0);
  }
}

/** The instance checks the answer and makes its master key: from a paired
 *  device, for this request, and the right share. */
export function acceptUnseal(m: MachineState, r: UnsealRequest, throwaway: KeyPair, a: UnsealAnswer): Uint8Array {
  const b = a.body;
  if (b.v !== VERSION || b.type !== "unseal-answer") throw new Error("not an unseal answer");
  const request = hashOf(r.body);
  if (b.request !== toHex(request)) throw new Error("not an answer to this request");
  if (!m.devices.some((d) => d.signing === b.device)) throw new Error("not a paired device");
  if (!verify(fromB64(b.device), bytesOf(b), fromB64(a.sig))) throw new Error("the device's signature is wrong");
  const share = open(throwaway.secretKey, b.share, request);
  const master = combineShares(m.machineShare, share);
  share.fill(0);
  if (!equal(checkOf(master), m.check)) {
    master.fill(0);
    throw new Error("the share doesn't make this vault's key");
  }
  return master;
}

export function fromHex(hex: string): Uint8Array {
  if (!/^([0-9a-f]{2})*$/.test(hex)) throw new Error("not hex");
  return Uint8Array.from(hex.match(/../g) ?? [], (h) => parseInt(h, 16));
}

export { concatBytes };
