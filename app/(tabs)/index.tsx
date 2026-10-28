import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { View } from "react-native";
import { Button } from "../../src/components/Button";
import { Card } from "../../src/components/Card";
import { Screen } from "../../src/components/Screen";
import { StatusPill } from "../../src/components/StatusPill";
import { Type } from "../../src/components/Type";
import { useTheme } from "../../src/contexts/ThemeContext";
import { useToast } from "../../src/contexts/ToastContext";
import { answeredIds, loadMachines, markAnswered, type Machine } from "../../src/lib/machines";
import { getRequests, postAnswer } from "../../src/lib/peer";
import { approveWithFaceId, enclaveDevice } from "../../src/native/enclave";
import { answerUnseal, requestProblem, type UnsealRequest } from "../../src/protocol/messages";
import { fonts } from "../../src/theme/fonts";

interface Pending {
  machine: Machine;
  request: UnsealRequest;
}

const POLL_MS = 3000;

/** Requests from paired machines, checked before they are shown: a request
 *  that fails the protocol's checks is never offered, only reported. */
export default function Approvals() {
  const { colors } = useTheme();
  const toast = useToast();
  const [pending, setPending] = useState<Pending[]>([]);
  const [refused, setRefused] = useState<string[]>([]);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const all = await loadMachines();
    setMachines(all);
    const answered = await answeredIds();
    const now = new Date();
    const next: Pending[] = [];
    const problems: string[] = [];
    await Promise.all(
      all.map(async (machine) => {
        try {
          for (const request of await getRequests(machine.address)) {
            const problem = requestProblem(request, machine, now, answered);
            if (problem) {
              if (problem !== "already answered") problems.push(`${machine.name}: ${problem}`);
            } else next.push({ machine, request });
          }
        } catch {
          // Not on this network right now: nothing to show for it.
        }
      }),
    );
    setPending(next);
    setRefused(problems);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refresh();
      const timer = setInterval(() => void refresh(), POLL_MS);
      return () => clearInterval(timer);
    }, [refresh]),
  );

  const approve = async ({ machine, request }: Pending) => {
    setBusy(request.body.id);
    try {
      const device = await enclaveDevice("this iPhone");
      await approveWithFaceId(`Unseal ${request.body.service} on ${machine.name}`, async () => {
        const answer = await answerUnseal(device, machine, request);
        await postAnswer(machine.address, answer);
      });
      await markAnswered(request.body.id);
      toast(`${request.body.service} on ${machine.name} is unsealed.`, "info");
      await refresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Not approved.", "error");
    } finally {
      setBusy(null);
    }
  };

  const heading = { fontFamily: fonts.display, fontSize: 22, lineHeight: 32 };
  const detail = { color: colors.inkSoft, fontFamily: fonts.code, fontSize: 12 };
  return (
    <Screen title="Approvals" subtitle="Machines on this network that are waiting for you.">
      {refused.map((r) => (
        <Card key={r}>
          <StatusPill label="Refused" tone="warn" />
          <Type>{r}</Type>
        </Card>
      ))}
      {pending.length === 0 ? (
        <Card>
          <Type style={{ color: colors.inkSoft }}>
            {machines.length ? "Nothing is waiting." : "Pair a machine first, from Machines."}
          </Type>
        </Card>
      ) : (
        pending.map((p) => {
          const b = p.request.body;
          return (
            <Card key={b.id}>
              <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                <Type accessibilityRole="header" style={heading}>
                  Unseal {b.service} on {p.machine.name}
                </Type>
                <StatusPill label="Verified" tone="good" />
              </View>
              <Type style={detail}>version {b.version} · binary {b.binary}</Type>
              <Type style={detail}>started {new Date(b.started).toLocaleString()} · boot {b.boot}</Type>
              <Type style={detail}>expires {new Date(b.expires).toLocaleTimeString()}</Type>
              <Button
                label={busy === b.id ? "Approving…" : "Approve with Face ID"}
                disabled={busy !== null}
                onPress={() => void approve(p)}
                style={{ alignSelf: "flex-start" }}
              />
            </Card>
          );
        })
      )}
    </Screen>
  );
}
