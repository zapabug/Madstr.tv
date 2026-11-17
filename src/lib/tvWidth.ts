// How wide the page is laid out on a TV (spec feat-tv-remote TV5-1). A TV gives a WebView 960×540 and doubles
// everything; the app lays the page out wider instead. zapa picks 1280 or 1920 on the TV from two test builds
// (VITE_TV_WIDTH=1920 pnpm build for the second); 1280 until then. Anything else falls back to 1280.
export const TV_WIDTHS = [1280, 1920] as const;

export function tvWidth(raw: unknown): number {
  const n = Number(raw);
  return (TV_WIDTHS as readonly number[]).includes(n) ? n : TV_WIDTHS[0];
}
