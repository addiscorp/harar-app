// The protocol's randomness comes from crypto.getRandomValues, which React
// Native lacks; expo-crypto gives the OS's secure generator.
import { getRandomValues } from "expo-crypto";

const g = globalThis as { crypto?: { getRandomValues?: unknown } };
if (!g.crypto) g.crypto = { getRandomValues };
else if (!g.crypto.getRandomValues) g.crypto.getRandomValues = getRandomValues;
