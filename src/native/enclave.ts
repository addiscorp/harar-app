// The Secure Enclave module (modules/simien-enclave) as a protocol Device.
// It exists only in a native build on an iPhone; on the web, in Expo Go or in
// the simulator there is no Enclave, and the app says so instead of faking one.
import { requireOptionalNativeModule, type EventSubscription } from "expo-modules-core";
import { fromB64, toB64 } from "../protocol/encoding";
import type { Device } from "../protocol/messages";

interface Native {
  isAvailable(): boolean;
  createDevice(tag: string): Promise<{ signing: string; agreement: string }>;
  publicKeys(tag: string): Promise<{ signing: string; agreement: string } | null>;
  authenticate(reason: string): Promise<boolean>;
  sign(tag: string, message: string): Promise<string>;
  agree(tag: string, peer: string): Promise<string>;
  endApproval(): void;
  startBrowsing(): void;
  stopBrowsing(): void;
  addListener(event: "onService", listener: (s: FoundService) => void): EventSubscription;
}

export interface FoundService {
  name: string;
  host?: string;
  port?: number;
  gone?: boolean;
}

const native = requireOptionalNativeModule<Native>("SimienEnclave");

export const enclaveAvailable = () => Boolean(native?.isAvailable());

const TAG = "device-v1";

/** This phone's device: its keys, made on first use. */
export async function enclaveDevice(name: string): Promise<Device> {
  if (!native || !native.isAvailable()) throw new Error("This needs an iPhone with a Secure Enclave (not the simulator).");
  const keys = (await native.publicKeys(TAG)) ?? (await native.createDevice(TAG));
  return {
    name,
    signingKey: fromB64(keys.signing),
    agreementKey: fromB64(keys.agreement),
    sign: async (m) => fromB64(await native.sign(TAG, toB64(m))),
    agree: async (p) => fromB64(await native.agree(TAG, toB64(p))),
  };
}

/** One Face ID for one approval; the key operations after it use it. */
export async function approveWithFaceId(reason: string, run: () => Promise<void>) {
  if (!native) throw new Error("No Secure Enclave here.");
  await native.authenticate(reason);
  try {
    await run();
  } finally {
    native.endApproval();
  }
}

/** Machines advertising _simien._tcp on the local network. */
export function browse(found: (s: FoundService) => void): () => void {
  if (!native) return () => {};
  const sub = native.addListener("onService", found);
  native.startBrowsing();
  return () => {
    sub.remove();
    native.stopBrowsing();
  };
}
