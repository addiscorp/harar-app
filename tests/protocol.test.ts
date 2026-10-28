import { expect, test } from "bun:test";
import { combineShares, keyPair, sign } from "../src/protocol/crypto";
import { canonical, fromB64, toB64 } from "../src/protocol/encoding";
import {
  PAIRING_ATTEMPTS,
  acceptPairing,
  acceptUnseal,
  hello,
  newMachine,
  startPairing,
  unsealRequest,
  type MachineState,
} from "../src/protocol/machine";
import { answerUnseal, finishPairing, pairRequest, requestProblem } from "../src/protocol/messages";
import { softwareDevice } from "./device";

const now = new Date("2026-10-27T14:00:00Z");
const start = (m: MachineState) =>
  unsealRequest(m, { service: "harar", version: "0.3.1", binary: "cdhash:ab12", boot: "boot-1", config: "c0ffee", started: now, now });

function paired() {
  const m = newMachine("simien", ["harar", "gondar"]);
  const device = softwareDevice();
  const code = startPairing(m);
  const r = pairRequest(hello(m), device, code);
  const pinned = finishPairing(r, acceptPairing(m, r), code);
  return { m, device, pinned };
}

test("canonical JSON: one spelling whatever the key order, and nothing silently dropped", () => {
  expect(canonical({ b: 1, a: [true, null, "x"] })).toBe(canonical({ a: [true, null, "x"], b: 1 }));
  expect(() => canonical({ a: undefined })).toThrow("undefined");
  expect(() => canonical({ a: NaN })).toThrow();
  const bytes = Uint8Array.from({ length: 50 }, (_, i) => i * 5);
  expect(fromB64(toB64(bytes))).toEqual(bytes);
});

test("paired, then unsealed: the master key is made only from the machine's share and the device's", async () => {
  const { m, device, pinned } = paired();
  const personShare = m.personShare!;
  const expected = combineShares(m.machineShare, personShare);
  const { request, throwaway } = start(m);
  expect(requestProblem(request, pinned, now, new Set())).toBeNull();
  const answer = await answerUnseal(device, pinned, request);
  expect(device.signs).toBe(1);
  expect(acceptUnseal(m, request, throwaway, answer)).toEqual(expected);
  // The answer opens for that instance alone: another throwaway can't.
  expect(() => acceptUnseal(m, request, keyPair(), answer)).toThrow();
});

test("pairing: a wrong code is refused, the attempts are capped, and a code is used once", () => {
  const m = newMachine("simien", ["harar"]);
  const code = startPairing(m);
  const device = softwareDevice();
  const wrong = pairRequest(hello(m), device, "AAAAA-AAAAA-AAAAA-AAAAA");
  for (let i = 1; i < PAIRING_ATTEMPTS; i++) expect(() => acceptPairing(m, wrong)).toThrow("doesn't match");
  // The code typed loosely still works, within the attempts.
  const right = pairRequest(hello(m), device, code.toLowerCase().replace(/-/g, " "));
  expect(() => acceptPairing(m, right)).not.toThrow();
  expect(() => acceptPairing(m, right)).toThrow("not pairing");
  // Past the cap the pairing closes, even for the right code.
  const m2 = newMachine("simien", ["harar"]);
  const code2 = startPairing(m2);
  const wrong2 = pairRequest(hello(m2), device, "AAAAA-AAAAA-AAAAA-AAAAA");
  for (let i = 0; i < PAIRING_ATTEMPTS; i++) expect(() => acceptPairing(m2, wrong2)).toThrow();
  expect(() => acceptPairing(m2, pairRequest({ ...hello(m2), pairing: { nonce: "AAAA" } }, device, code2))).toThrow();
});

test("pairing: the device pins only a machine the code vouches for", () => {
  const m = newMachine("simien", ["harar"]);
  const code = startPairing(m);
  const device = softwareDevice();
  const r = pairRequest(hello(m), device, code);
  const response = acceptPairing(m, r);
  // Someone on the network without the code answers instead: no pin.
  expect(() => finishPairing(r, { ...response, proof: toB64(new Uint8Array(32)) }, code)).toThrow("doesn't know the code");
  // A changed answer (another machine key, another share) breaks the proof.
  const evil = keyPair();
  expect(() => finishPairing(r, { ...response, body: { ...response.body, machine: toB64(evil.publicKey) } }, code)).toThrow();
  expect(finishPairing(r, response, code).machine).toBe(toB64(m.key.publicKey));
});

test("the device offers only a fresh request, signed by the pinned machine, never twice", () => {
  const { m, pinned } = paired();
  const { request } = start(m);
  const evil = newMachine("simien", ["harar"]);
  const forged = start(evil).request;
  expect(requestProblem(forged, pinned, now, new Set())).toBe("not from simien");
  expect(requestProblem({ ...forged, body: { ...forged.body, machine: pinned.machine } }, pinned, now, new Set())).toBe(
    "the signature isn't simien's",
  );
  expect(requestProblem(request, pinned, new Date(now.getTime() + 6 * 60_000), new Set())).toBe("expired");
  expect(requestProblem(request, pinned, now, new Set([request.body.id]))).toBe("already answered");
  expect(requestProblem({ ...request, body: { ...request.body, service: "mystery" } }, pinned, now, new Set())).not.toBeNull();
});

test("the instance accepts only a paired device's answer, to its own request", async () => {
  const { m, device, pinned } = paired();
  const { request, throwaway } = start(m);
  const other = start(m);
  const answer = await answerUnseal(device, pinned, request);
  expect(() => acceptUnseal(m, other.request, other.throwaway, answer)).toThrow("not an answer to this request");
  // A stranger's device, even with a valid signature of its own.
  const stranger = softwareDevice("stranger");
  const forged = { ...answer, body: { ...answer.body, device: toB64(stranger.signingKey) } };
  forged.sig = toB64(await stranger.sign(new TextEncoder().encode(canonical(forged.body))));
  expect(() => acceptUnseal(m, request, throwaway, forged)).toThrow("not a paired device");
  // A paired device's key, but the body changed after signing.
  expect(() => acceptUnseal(m, request, throwaway, { ...answer, body: { ...answer.body, request: "00" } })).toThrow();
});

test("a wrong share never becomes a master key", async () => {
  const { m, device, pinned } = paired();
  const { request, throwaway } = start(m);
  // The machine's share changed (another vault): the check catches it.
  const answer = await answerUnseal(device, pinned, request);
  const other = { ...m, machineShare: new Uint8Array(32).fill(7) };
  expect(() => acceptUnseal(other, request, throwaway, answer)).toThrow("doesn't make this vault's key");
});
