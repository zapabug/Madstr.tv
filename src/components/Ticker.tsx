// The permanent words on the screen: a ticker that comes out of the M of Mad⚡tr.tv (top right)
// and runs left, showing the first sentence of the post the current picture came from. Only the
// words have a background (flat, as wide as the letters); it starts again whenever the picture
// changes. With reduced motion it stands still instead of scrolling.
export function Ticker({ text }: { text: string }) {
  if (!text) return null;
  // Longer sentences scroll a little longer so the speed stays readable.
  const seconds = Math.max(14, Math.round(text.length * 0.2) + 10);
  return (
    <div className="ticker" aria-label={`Picture post: ${text}`}>
      <span key={text} className="ticker-run" style={{ animationDuration: `${seconds}s` }} aria-hidden="true">
        <span className="ticker-text">{text}</span>
      </span>
    </div>
  );
}
