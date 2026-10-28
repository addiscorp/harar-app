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
//
// This file is the device's side and what both sides share; the machine's
// side is ./machine.ts. The device never handles a share in the clear: its
// keys reseal it (Device.reseal), on a phone inside CryptoKit.
import { concatBytes, equal, isPublicKey, mac, randomBytes, sha256, utf8ToBytes, verify } from "./crypto";
import { canonical, fromB64, toB64, toHex } from "./encoding";
import { hkdf } from "@noble/hashes/hkdf.js";
import type { Sealed } from "./seal";

export type { Sealed };

export const VERSION = 1;
/** The longest an unseal request may be valid: minutes, never hours. */
export const MAX_REQUEST_MS = 10 * 60 * 1000;
export const SERVICE_TYPE = "_simien._tcp";

/** A signed message: its body as canonical JSON is what was signed. */
export interface Signed<T> {
  body: T;
  sig: string;
}

export const bytesOf = (body: unknown) => utf8ToBytes(canonical(body));
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
  /** Opens a share sealed to this device for `context` and seals it to `to`
   *  for `newContext`, without the share ever leaving the device's keys. */
  reseal(sealed: Sealed, context: Uint8Array, to: Uint8Array, newContext: Uint8Array): Promise<Sealed>;
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

export function codeKey(code: string, nonce: string): Uint8Array {
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
  const request = hashOf(r.body);
  const body: UnsealAnswerBody = {
    v: VERSION,
    type: "unseal-answer",
    request: toHex(request),
    device: toB64(device.signingKey),
    share: await device.reseal(pinned.share, fromHex(pinned.context), fromB64(r.body.throwaway), request),
  };
  return { body, sig: toB64(await device.sign(bytesOf(body))) };
}

export function fromHex(hex: string): Uint8Array {
  if (!/^([0-9a-f]{2})*$/.test(hex)) throw new Error("not hex");
  return Uint8Array.from(hex.match(/../g) ?? [], (h) => parseInt(h, 16));
}

export { concatBytes };
