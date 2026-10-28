// The machine's side of the unseal protocol (./messages.ts): it holds the
// person's share until the first device has it, shows pairing codes, asks to be
// unsealed with a throwaway key, and combines the answer with its own share.
// Here a software stand-in for harar and gondar (scripts/peer.ts, tests).
import { combineShares, equal, isPublicKey, keyPair, mac, randomBytes, sign, utf8ToBytes, verify, type KeyPair } from "./crypto";
import { fromB64, toB64, toHex } from "./encoding";
import {
  VERSION,
  bytesOf,
  codeKey,
  hashOf,
  pairingCode,
  type Hello,
  type PairRequest,
  type PairResponse,
  type PairedBody,
  type UnsealAnswer,
  type UnsealRequest,
  type UnsealRequestBody,
} from "./messages";
import { open, seal } from "./seal";

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

