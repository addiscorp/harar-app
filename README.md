# Simien

The person's control panel for their machines, on their iPhone. First job:
**unsealing**. A service that holds keys (harar, then gondar) starts sealed,
and the running instance asks to be unsealed. The phone checks the request,
you approve it with Face ID, and the phone hands that instance alone your
share of its master key.

Everything happens on the local network. No internet server is involved:
machines are found with Bonjour (`_simien._tcp`) and spoken to directly.

## How it's protected

- **Keys in the Secure Enclave.** The phone's signing and key-agreement keys
  are made inside the Secure Enclave (`modules/simien-enclave`). They can
  only be used after Face ID, and they never leave the device.
- **Pairing.** The machine shows a one-time code of 100 bits, so a recorded
  pairing can't be brute-forced offline, and pairing closes after 5 wrong
  tries. Both sides prove they know the code. The phone pins only a machine
  key that the code vouched for.
- **Unsealing.** A request is signed by the pinned machine key, valid for
  minutes, answered once, and names the instance's throwaway key. The phone
  seals your share to that key alone, and signs the answer.
- **Two shares.** The master key is made from two shares: the machine's,
  sealed in its chip, and yours, held by the phone. A stolen phone opens
  nothing, and neither does a stolen server.
- **The network is never trusted.** The network is plain HTTP on the LAN,
  and nothing relies on it: every message is signed, and every share is
  sealed.

The protocol is `src/protocol` (P-256, HKDF-SHA256, AES-256-GCM, using the
audited @noble libraries). harar implements the same messages.

## Try it

```sh
mkdir -p .tmp && chmod 700 .tmp && export TMPDIR="$PWD/.tmp"
npm ci --no-audit --no-fund
npm test                 # the protocol, and the client against the test peer
npm run peer             # a sealed test machine on this network; prints a pairing code
npm run ios -- --device  # build to your iPhone (Xcode; your Apple ID signs it)
```

`npm run peer` stands in for harar until harar speaks this protocol. Its
state, both shares included, is plain JSON in `.tmp/peer.json`: it is for
trying the app, never a vault. On the phone, open Machines, pick the peer
(or type `<this Mac's name>.local:7443`), and enter the code. Restart the
peer, and Approvals shows its unseal request.

The Secure Enclave exists only on a real iPhone. The simulator, the web
build and Expo Go say so, and never fake it.
