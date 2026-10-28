// The machines this phone has paired with, and the requests it has answered.
// Kept in the keychain (expo-secure-store): the pinned machine keys decide
// whom the phone believes, and the sealed shares open only with this phone's
// Secure Enclave.
import { getSecureItem, setSecureItem } from "./secureStorage";
import type { Pinned } from "../protocol/messages";

export interface Machine extends Pinned {
  /** Where it was last found: host:port. */
  address: string;
}

const MACHINES = "simien.machines.v1";
const ANSWERED = "simien.answered.v1";

export async function loadMachines(): Promise<Machine[]> {
  const raw = await getSecureItem(MACHINES);
  return raw ? (JSON.parse(raw) as Machine[]) : [];
}

export async function saveMachine(m: Machine): Promise<Machine[]> {
  const all = (await loadMachines()).filter((x) => x.machine !== m.machine);
  all.push(m);
  await setSecureItem(MACHINES, JSON.stringify(all));
  return all;
}

export async function forgetMachine(machine: string): Promise<Machine[]> {
  const all = (await loadMachines()).filter((x) => x.machine !== machine);
  await setSecureItem(MACHINES, JSON.stringify(all));
  return all;
}

/** Request ids answered, newest last; a short history is enough, since a
 *  request is valid for minutes. */
export async function answeredIds(): Promise<Set<string>> {
  const raw = await getSecureItem(ANSWERED);
  return new Set(raw ? (JSON.parse(raw) as string[]) : []);
}

export async function markAnswered(id: string): Promise<void> {
  const ids = [...(await answeredIds()), id].slice(-200);
  await setSecureItem(ANSWERED, JSON.stringify(ids));
}
