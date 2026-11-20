/**
 * Page titles light up word by word, from soft grey and slightly blurred to
 * full ink (Apple's text reveal). The whole title stays one text node for
 * screen readers via aria-label; the word spans are presentational.
 */
export function LightWords({ text }: { text: string }) {
  const words = text.split(/(\s+)/);
  let n = 0;
  return (
    <span aria-label={text} role="text">
      {words.map((w, i) =>
        /^\s+$/.test(w) ? (
          w
        ) : (
          <span key={i} aria-hidden className="light-word" style={{ ["--i" as string]: n++ }}>
            {w}
          </span>
        ),
      )}
    </span>
  );
}
