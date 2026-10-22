import { tokenClass, type Token } from "@/lib/highlight";

/** Renders one tokenized line. Shared by the editor and static previews. */
export function TokenLine({ tokens }: { tokens: Token[] }) {
  // A zero-width space keeps empty lines at full line height.
  if (tokens.length === 0) return <>{"​"}</>;
  return (
    <>
      {tokens.map((t, i) => (
        <span key={i} className={tokenClass[t.type]}>
          {t.text}
        </span>
      ))}
    </>
  );
}
