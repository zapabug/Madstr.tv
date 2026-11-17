// Back closes the top pop-up first (spec feat-tv-remote TV6-1). A pop-up that Back should close registers its
// close here while it is open; the Android app's Back calls window.jukeBack() before going back a page or asking
// to leave, and stops if a pop-up was closed.
const closers: (() => void)[] = [];

export function onBack(close: () => void): () => void {
  closers.push(close);
  return () => {
    const i = closers.lastIndexOf(close);
    if (i >= 0) closers.splice(i, 1);
  };
}

// 'closed' when a pop-up was closed, 'none' when there was none.
export function back(): 'closed' | 'none' {
  const close = closers.pop();
  if (!close) return 'none';
  close();
  return 'closed';
}

declare global {
  interface Window { jukeBack?: () => 'closed' | 'none' }
}
if (typeof window !== 'undefined') window.jukeBack = back;
