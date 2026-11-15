# feat-android-native: player controls and remembered folders in the Android app

Branch: `feat/android-native`, off `main`.
Status: spec from zapa's words on 2026-11-15, after testing 1.1: "file picker still don't remember and it
really should, we're missing the android native controls and player integration". Asked and answered the
same day: one app (the web code inside the Android shell), not a separate app build; **native controls driving
the page's player** (not a native player, no new libraries); **Android's folder picker, remembered**;
background play in 1.1 works.
Scope: the Android app (phones and TV). The web app gains the browser's version of the same controls.

## Rules

- **No new dependency**: Android framework classes only (`android.media.session`, `DocumentsContract`).
- The page's player stays the one player. Native code only shows its state and sends it commands.
- Titles, names and pictures shown by Android come from relays, feeds and files: plain text, clipped to
  80 characters; pictures only from http(s) URLs, at most 2 MB, scaled to 512 px at most.
- Only folders zapa picked can be read: the file server answers only for documents inside a folder the app
  holds access to, read-only.

## N1: Native controls (Android) and media controls (web)

- **Android.** While there is something in the player, the app shows one media notification (Android's media
  style) and runs a media session, so the same controls show on the lock screen, in the notification shade,
  on Bluetooth / headphone buttons and to TV remotes:
  - title (the item's title), second line (its subtitle, else the playlist name), its picture;
  - **previous, play/pause, next**, and the progress bar with seeking where Android shows one;
  - remote and keyboard media keys while the app is open: play, pause, play/pause, next, previous,
    fast-forward (+30 s), rewind (−10 s), stop (pause), the same steps as the on-screen buttons.
- Each control calls the page's player (`play`, `pause`, `next`, `prev`, `seek`, `seekBy`), so the page and
  the controls never disagree.
- **Lifetime** (replaces feat-android-play §A2's "stops 3 s after"): the service and the notification stay
  while playing, loading, paused or in error; after **10 minutes** without playing they go, and so does the
  notification. An empty player (idle) ends them after **3 s**. The wake and Wi-Fi locks are held only while
  playing or loading. Swiping the app away ends everything, as before.
- The page tells Android only what changed: a new item, a new status, or a position more than **2 s** off
  where Android expects it (after a seek). Android moves the progress bar on its own in between.
- **Web** (Chrome and others with the Media Session API): the same title, second line, picture, actions and
  progress go to `navigator.mediaSession`, which gives the browser's own media notification and keys. Not
  used inside the Android app (it has the native one).
- Exit: on a phone, the lock screen shows the track with working previous / play-pause / next and seeking;
  headphone buttons work; on TV the remote's media keys work; the notification goes 10 minutes after pausing.

## N2: Remembered folders (Android)

- "Add music folder" / "Add picture folder" come back in the app and open **Android's folder picker**. The
  app keeps read access to the folder (a persisted grant), remembers it like the web app does, and rescans it
  on every start. Nothing is copied.
- Scan: the same rules as the web (sub-folders 6 deep, up to 2000 files, the same file types).
- Files reach the page through the app's own local address, `/_madstr_local/<id>`, served from the folder
  with byte ranges, so seeking inside a local track works. (Capacitor's own content server ignores the start of
  a range, so it is not used.)
- If Android takes the access away (folder deleted, grant cleared), the folder shows "No access: remove it and
  add it again". Removing a folder gives the access back to Android.
- The several-files buttons from 1.1 are no longer shown in the app. A device without a folder picker (some TV
  boxes) shows "This device has no folder picker".
- Exit: on a phone, a picked music folder and a picked picture folder are still there after closing and
  reopening the app; tracks play and seek; pictures show.

## Release

- `versionCode 3`, `versionName "1.2"`, built, signed and published on zapstore like 1.0 and 1.1.

## Milestones

- [ ] N1 native controls (Android) and media controls (web)
- [ ] N2 remembered folders (Android)
