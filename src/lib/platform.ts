// Is the page running inside the Android app (Capacitor)? Pure: the window is passed in, so it is tested
// without a browser. Capacitor's bridge sets window.Capacitor before the page's scripts run.
type CapWindow = { Capacitor?: { isNativePlatform?: () => boolean } };

export function isNativeApp(win: unknown = typeof window === 'undefined' ? undefined : window): boolean {
  try {
    return (win as CapWindow | undefined)?.Capacitor?.isNativePlatform?.() === true;
  } catch {
    return false;
  }
}

// The folder picker is offered only where it works: not in the Android app, whose WebView has
// showDirectoryPicker but cannot open it (spec feat-android-play §A1).
export function folderPickerUsable(win: unknown): boolean {
  if (isNativeApp(win)) return false;
  return typeof (win as { showDirectoryPicker?: unknown } | undefined)?.showDirectoryPicker === 'function';
}
