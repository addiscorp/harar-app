export function Mark({ size = 24 }: { size?: number }) {
  return <svg viewBox="0 0 32 32" width={size} height={size} role="img" aria-label="zega">
    <path d="M8 7 H24 L8 25 H24" fill="none" stroke="var(--ink)" strokeWidth="3.1" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="24" cy="7" r="4.2" fill="var(--accent)" />
    <circle cx="8" cy="25" r="4.2" fill="var(--accent)" />
  </svg>;
}
