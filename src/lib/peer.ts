// Talking to a machine on the local network. Plain HTTP on the LAN: nothing
// here is trusted for being on the network; every answer is checked by the
// protocol (signatures, the pairing code, the pinned machine key).
import type { Hello, PairRequest, PairResponse, UnsealAnswer, UnsealRequest } from "../protocol/messages";

const TIMEOUT_MS = 8000;

/** A machine's address as the person or Bonjour gave it: host[:port]. */
export function baseUrl(address: string): string {
  const a = address.trim().replace(/^https?:\/\//, "").replace(/\/+$/, "");
  if (!/^[A-Za-z0-9.\-]+(:\d{1,5})?$/.test(a)) throw new Error("An address is a host name or IP, with an optional :port.");
  return `http://${a.includes(":") ? a : `${a}:7443`}`;
}

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal, headers: { "content-type": "application/json" } });
    const body = await res.json().catch(() => null);
    if (!res.ok) throw new Error((body as { error?: string } | null)?.error ?? `The machine answered ${res.status}.`);
    return body as T;
  } catch (e) {
    if ((e as Error).name === "AbortError") throw new Error("The machine didn't answer. Is it on this network?");
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

export const getHello = (address: string) => call<Hello>(`${baseUrl(address)}/simien/v1/hello`);
export const postPair = (address: string, r: PairRequest) =>
  call<PairResponse>(`${baseUrl(address)}/simien/v1/pair`, { method: "POST", body: JSON.stringify(r) });
export const getRequests = (address: string) => call<UnsealRequest[]>(`${baseUrl(address)}/simien/v1/requests`);
export const postAnswer = (address: string, a: UnsealAnswer) =>
  call<{ unsealed: boolean }>(`${baseUrl(address)}/simien/v1/answer`, { method: "POST", body: JSON.stringify(a) });
