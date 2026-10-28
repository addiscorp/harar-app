import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import { Button } from "../../src/components/Button";
import { Card } from "../../src/components/Card";
import { Screen } from "../../src/components/Screen";
import { StatusPill } from "../../src/components/StatusPill";
import { Type } from "../../src/components/Type";
import { useTheme } from "../../src/contexts/ThemeContext";
import { useToast } from "../../src/contexts/ToastContext";
import { forgetMachine, loadMachines, saveMachine, type Machine } from "../../src/lib/machines";
import { getHello, postPair } from "../../src/lib/peer";
import { browse, enclaveDevice, type FoundService } from "../../src/native/enclave";
import { finishPairing, pairRequest } from "../../src/protocol/messages";
import { fonts } from "../../src/theme/fonts";

/** Machines found on this network (Bonjour), the ones paired, and pairing:
 *  the address, then the code the machine shows. */
export default function Machines() {
  const { colors } = useTheme();
  const toast = useToast();
  const [machines, setMachines] = useState<Machine[]>([]);
  const [found, setFound] = useState<Record<string, FoundService>>({});
  const [address, setAddress] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  useFocusEffect(useCallback(() => void loadMachines().then(setMachines), []));

  useEffect(
    () =>
      browse((s) =>
        setFound((all) => {
          const next = { ...all };
          if (s.gone) delete next[s.name];
          else next[s.name] = s;
          return next;
        }),
      ),
    [],
  );

  const pair = async () => {
    setBusy(true);
    try {
      const hello = await getHello(address);
      const device = await enclaveDevice("this iPhone");
      const request = pairRequest(hello, device, code);
      const pinned = finishPairing(request, await postPair(address, request), code);
      setMachines(await saveMachine({ ...pinned, address: address.trim() }));
      setCode("");
      toast(`Paired with ${pinned.name}.`);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Pairing failed.", "error");
    } finally {
      setBusy(false);
    }
  };

  const input = {
    minHeight: 48,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderRadius: 4,
    borderColor: colors.rule,
    backgroundColor: colors.panel,
    color: colors.ink,
    fontFamily: fonts.code,
  };
  const heading = { fontFamily: fonts.display, fontSize: 22, lineHeight: 32 };
  return (
    <Screen title="Machines" subtitle="Paired over this network only; nothing goes through the internet.">
      {machines.map((m) => (
        <Card key={m.machine}>
          <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <Type accessibilityRole="header" style={heading}>{m.name}</Type>
            <StatusPill label="Paired" tone="good" />
          </View>
          <Type style={{ color: colors.inkSoft, fontFamily: fonts.code, fontSize: 12 }}>
            {m.address} · {m.services.join(", ")} · key {m.machine.slice(0, 12)}…
          </Type>
          <Button secondary label="Forget" onPress={() => void forgetMachine(m.machine).then(setMachines)} style={{ alignSelf: "flex-start" }} />
        </Card>
      ))}
      <Card>
        <Type accessibilityRole="header" style={heading}>Pair a machine</Type>
        {Object.values(found).length ? (
          <View style={{ gap: 8 }}>
            <Type style={{ color: colors.inkSoft }}>On this network:</Type>
            {Object.values(found).map((s) => (
              <Pressable
                key={s.name}
                accessibilityRole="button"
                onPress={() => setAddress(`${s.host?.replace(/\.$/, "")}:${s.port}`)}
                style={{ padding: 12, borderWidth: 1, borderRadius: 4, borderColor: colors.rule }}
              >
                <Type style={{ fontFamily: fonts.semibold }}>{s.name}</Type>
              </Pressable>
            ))}
          </View>
        ) : null}
        <TextInput
          accessibilityLabel="Address"
          placeholder="simien.local:7443"
          placeholderTextColor={colors.inkFaint}
          autoCapitalize="none"
          autoCorrect={false}
          value={address}
          onChangeText={setAddress}
          style={input}
        />
        <TextInput
          accessibilityLabel="Pairing code"
          placeholder="Code shown on the machine"
          placeholderTextColor={colors.inkFaint}
          autoCapitalize="characters"
          autoCorrect={false}
          value={code}
          onChangeText={setCode}
          style={input}
        />
        <Button
          label={busy ? "Pairing…" : "Pair"}
          disabled={busy || !address.trim() || !code.trim()}
          onPress={() => void pair()}
          style={{ alignSelf: "flex-start" }}
        />
      </Card>
    </Screen>
  );
}
