// The app's own client code (src/lib/peer) and protocol against the test peer,
// in its own process, over HTTP: pair with the code it prints, then approve
// the unseal it asks for. The device's keys are software here; on a phone
// they're the Secure Enclave's, behind the same Device interface.
import { afterAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync } from "node:fs";
import { join, resolve } from "node:path";
import { getHello, getRequests, postAnswer, postPair } from "../src/lib/peer";
import { answerUnseal, finishPairing, pairRequest, requestProblem } from "../src/protocol/messages";
import { softwareDevice } from "./device";

const port = 17443 + Math.floor(Math.random() * 1000);
const address = `127.0.0.1:${port}`;
mkdirSync(resolve(".tmp"), { recursive: true, mode: 0o700 });
const state = join(mkdtempSync(join(resolve(".tmp"), "peer-")), "peer.json");
const lines: string[] = [];
let peer: ReturnType<typeof Bun.spawn> | undefined;

async function startPeer() {
  peer = Bun.spawn(["bun", "scripts/peer.ts", "--port", String(port), "--state", state, "--no-advertise"], { stdout: "pipe" });
  const reader = (peer.stdout as ReadableStream<Uint8Array>).getReader();
  void (async () => {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) return;
      lines.push(...new TextDecoder().decode(value).split("\n").filter(Boolean));
    }
  })();
  for (let i = 0; i < 100 && !lines.some((l) => l.startsWith("listening")); i++) await Bun.sleep(50);
}
afterAll(() => peer?.kill());

const device = softwareDevice("test phone");

test("pair with the code the machine shows, then unseal it, over the local network", async () => {
  await startPeer();
  const code = lines.find((l) => l.startsWith("pairing code: "))!.slice("pairing code: ".length);
  const hello = await getHello(address);
  expect(hello.pairing).not.toBeNull();
  const request = pairRequest(hello, device, code);
  const pinned = finishPairing(request, await postPair(address, request), code);
  expect(pinned.name).toBe("simien");

  const [unseal] = await getRequests(address);
  expect(requestProblem(unseal, pinned, new Date(), new Set())).toBeNull();
  expect(await postAnswer(address, await answerUnseal(device, pinned, unseal))).toEqual({ unsealed: true });
  expect(lines.some((l) => l.startsWith("unsealed: master key"))).toBe(true);
  // Unsealed: nothing waits, and a second answer is refused.
  expect(await getRequests(address)).toEqual([]);
  await expect(postAnswer(address, await answerUnseal(device, pinned, unseal))).rejects.toThrow("already unsealed");
});

test("a wrong code pins nothing and is refused by the machine", async () => {
  const hello = await getHello(address);
  expect(hello.pairing).toBeNull(); // the code was used
  await expect(postPair(address, pairRequest({ ...hello, pairing: { nonce: "AAAAAAAAAAAAAAAAAAAAAA" } }, device, "x"))).rejects.toThrow("not pairing");
});
