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

## Release to TestFlight

iOS builds run on **[simien]** (the Mac mini), never on [imac]. Xcode is
`/Applications/Xcode.app`, from the App Store, signed in with Sami's Apple
account (team `6LV9UQMTRU`). Signing keys stay on [simien].

| What | Where on [simien] |
|---|---|
| The checkout | `/Users/sami/work/claude/simien-app` |
| Node, Bun, portable Ruby, CocoaPods | `/Users/sami/work/claude/tools` (nothing global, nothing at startup) |
| Their environment, sourced per shell | `/Users/sami/work/claude/tools/env.sh` |
| Archive, logs, signed `.ipa` | `/Users/sami/work/claude/simien-app/.tmp/testflight/` |

To release, in a shell on [simien]:

```sh
cd /Users/sami/work/claude/simien-app
. /Users/sami/work/claude/tools/env.sh
npm ci --no-audit --no-fund
npm run testflight
```

It needs a clean tree. It regenerates the iOS project, archives it, signs it
for the App Store with Xcode's automatic signing, and uploads it. The build
number is the commit count. No EAS: nothing leaves our hardware except the
signed build. Each step's log is in
`/Users/sami/work/claude/simien-app/.tmp/testflight/`, and on failure the
script names the log.

**Getting a commit onto [simien].** [simien] has no GitHub login, so the
checkout doesn't pull from GitHub. From a machine with the repo:

```sh
git bundle create /tmp/app.bundle main   # any scratch path
scp /tmp/app.bundle simien:work/claude/.tmp/
ssh simien 'cd /Users/sami/work/claude/simien-app && git fetch -q ../.tmp/app.bundle main && git reset -q --hard FETCH_HEAD'
```

A read-only deploy key for simienapp/app on [simien] would replace this with
`git pull`. Adding one is Sami's call.

**First time on a new Mac.**
1. Install Xcode from the App Store, open it once, and tick the iOS platform.
2. Sign in under Xcode → Settings → Accounts.
3. Put the tools in a folder of their own, as above: Node's tarball, Bun
   with `BUN_INSTALL` set to that folder, Homebrew's portable Ruby (the
   system Ruby is too old for CocoaPods), and `gem install cocoapods` with
   `GEM_HOME` in that folder.
4. Write `env.sh` with those paths, plus
   `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer`, so no sudo
   `xcode-select` is needed.

**On the phone.** App Store Connect → Simien → TestFlight → Internal Testing:
a group with Sami in it, and each processed build added to it.
