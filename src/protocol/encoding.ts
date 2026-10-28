// Bytes on the wire are base64url without padding; what is signed or hashed
// is canonical JSON: keys sorted, no whitespace, so both sides hash the same
// bytes for the same message whatever order they built it in.

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const LOOKUP = new Map([...ALPHABET].map((c, i) => [c, i]));

export function toB64(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    out += ALPHABET[(n >> 18) & 63] + ALPHABET[(n >> 12) & 63];
    if (i + 1 < bytes.length) out += ALPHABET[(n >> 6) & 63];
    if (i + 2 < bytes.length) out += ALPHABET[n & 63];
  }
  return out;
}

export function fromB64(text: string): Uint8Array {
  if (text.length % 4 === 1) throw new Error("not base64url");
  const out = new Uint8Array(Math.floor((text.length * 3) / 4));
  let bits = 0;
  let value = 0;
  let o = 0;
  for (const c of text) {
    const v = LOOKUP.get(c);
    if (v === undefined) throw new Error("not base64url");
    value = (value << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[o++] = (value >> bits) & 0xff;
    }
  }
  return out;
}

export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

/** Canonical JSON. Only plain data: a value JSON can't carry exactly
 *  (undefined, NaN, a function) is an error, never silently dropped. */
export function canonical(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("canonical JSON has no non-finite numbers");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (typeof value === "object") {
    const keys = Object.keys(value as object).sort();
    return `{${keys
      .map((k) => {
        const v = (value as Record<string, unknown>)[k];
        if (v === undefined) throw new Error(`canonical JSON: ${k} is undefined`);
        return `${JSON.stringify(k)}:${canonical(v)}`;
      })
      .join(",")}}`;
  }
  throw new Error(`canonical JSON can't carry a ${typeof value}`);
}

export type { Json };
