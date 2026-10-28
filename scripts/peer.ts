// A test peer for the app: a machine that starts sealed, on the local network,
// speaking the unseal protocol (src/protocol) the way harar will. It is for
// trying the app, never a vault: its state, keys and both shares included,
// sits in plain JSON in .tmp/peer.json.
//
//   bun scripts/peer.ts [--port 7443] [--name simien] [--pair] [--state <file>] [--no-advertise]
//
// Each start is a sealed start: it asks to be unsealed and waits. The first
// start, or --pair, also shows a pairing code. It advertises itself as
// _simien._tcp with macOS's dns-sd, so the app finds it on the network.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { fromB64, toB64, toHex } from "../src/protocol/encoding";
import {
  SERVICE_TYPE,
  acceptPairing,
  acceptUnseal,
  hello,
  newMachine,
  startPairing,
  unsealRequest,
  type MachineState,
  type PairRequest,
  type UnsealAnswer,
} from "../src/protocol/messages";

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const port = Number(flag("--port") ?? 7443);
const name = flag("--name") ?? "simien";
const file = flag("--state") ?? join(import.meta.dir, "..", ".tmp", "peer.json");

function load(): MachineState {
  if (!existsSync(file)) return newMachine(name, ["harar"]);
  const s = JSON.parse(readFileSync(file, "utf8"));
  return {
    ...s,
    key: { secretKey: fromB64(s.key.secretKey), publicKey: fromB64(s.key.publicKey) },
    machineShare: fromB64(s.machineShare),
    personShare: s.personShare ? fromB64(s.personShare) : null,
    check: fromB64(s.check),
    pairing: null,
  };
}

function save(m: MachineState) {
  mkdirSync(join(file, ".."), { recursive: true, mode: 0o700 });
  writeFileSync(
    file,
    JSON.stringify({
      ...m,
      key: { secretKey: toB64(m.key.secretKey), publicKey: toB64(m.key.publicKey) },
      machineShare: toB64(m.machineShare),
      personShare: m.personShare ? toB64(m.personShare) : null,
      check: toB64(m.check),
      pairing: null,
    }),
    { mode: 0o600 },
  );
}

const m = load();
save(m);
const started = new Date();
const binary = `sha256:${createHash("sha256").update(readFileSync(import.meta.path)).digest("hex").slice(0, 16)}`;
let pending = unsealRequest(m, {
  service: "harar",
  version: "0.0.0-peer",
  binary,
  boot: "peer-boot",
  config: toHex(new Uint8Array(4)),
  started,
  now: new Date(),
});
let unsealed = false;

if (!m.devices.length || args.includes("--pair")) {
  const code = startPairing(m);
  console.log(`pairing code: ${code}`);
}
console.log(`${name}: sealed, waiting for an unseal (request ${pending.request.body.id})`);

const json = (body: unknown, status = 200) => Response.json(body, { status });

Bun.serve({
  port,
  hostname: "0.0.0.0",
  async fetch(req) {
    const path = new URL(req.url).pathname;
    try {
      if (req.method === "GET" && path === "/simien/v1/hello") return json(hello(m));
      if (req.method === "POST" && path === "/simien/v1/pair") {
        const response = acceptPairing(m, (await req.json()) as PairRequest);
        save(m);
        console.log(`paired: ${m.devices.at(-1)!.name}`);
        return json(response);
      }
      if (req.method === "GET" && path === "/simien/v1/requests") {
        // A request lives minutes: an expired one is replaced, as a waiting
        // instance would ask again.
        if (!unsealed && Date.parse(pending.request.body.expires) <= Date.now())
          pending = unsealRequest(m, { service: "harar", version: "0.0.0-peer", binary, boot: "peer-boot", config: "00000000", started, now: new Date() });
        return json(unsealed ? [] : [pending.request]);
      }
      if (req.method === "POST" && path === "/simien/v1/answer") {
        if (unsealed) return json({ error: "already unsealed" }, 409);
        const master = acceptUnseal(m, pending.request, pending.throwaway, (await req.json()) as UnsealAnswer);
        unsealed = true;
        pending.throwaway.secretKey.fill(0);
        console.log(`unsealed: master key ${toHex(master).slice(0, 8)}… (check matched)`);
        master.fill(0);
        return json({ unsealed: true });
      }
      return json({ error: "not found" }, 404);
    } catch (e) {
      console.log(`refused: ${(e as Error).message}`);
      return json({ error: (e as Error).message }, 400);
    }
  },
});

// Advertise on the local network; dns-sd stops with this process.
const advert = args.includes("--no-advertise")
  ? null
  : spawn("dns-sd", ["-R", name, SERVICE_TYPE, "local", String(port), "v=1"], { stdio: "ignore" });
const stop = () => {
  advert?.kill();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
console.log(`listening on :${port}, advertised as ${name}.${SERVICE_TYPE}`);
