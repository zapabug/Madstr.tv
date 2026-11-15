# feat-android-play: picking files and playing in the background in the Android app

Branch: `feat/android-play`, off `main`.
Status: spec from zapa's report on 2026-11-15, after installing 1.0 from zapstore: "Opening folder or file
picker not opening on the apk, music stops playing on background".
Scope: the Android app (phones and Android TV) only. The web app does not change.

## What zapa said (the source for everything below)

- In the APK, the folder / file picker does not open.
- Music stops when the app goes to the background.

## Why it happens (found in the code, not seen on a device: this machine cannot run an emulator)

- **Picker.** Newer Android WebViews have `showDirectoryPicker`, so the app shows "Add music folder" and
  calls it. Capacitor's file chooser (`BridgeWebChromeClient.showFilePicker`) then reads
  `intent.getType().startsWith(".")`; a folder request carries no type, so it fails and the dialog never
  opens. A plain `<input type="file">` goes through the same chooser with a type and works.
- **Background.** Capacitor does not pause the WebView. Android freezes an app that is not in the
  foreground and has no foreground service, and the music stops with it.

## Rules

- **No new dependency.** The Android side uses the Android framework only; the page uses `@capacitor/core`,
  which is already there.
- Notification text is plain text and clipped (the title comes from relays, feeds and files).

## A1 — Pick files in the app

- (Replaced by feat-android-native §N2: the app has remembered folders again.) Inside the Android app the folder picker is not offered. The music and picture sections show the
  "Add audio files" / "Add pictures" buttons (several files at once), which use the system file chooser.
- The note under them reads, in the app: "Pick several files at once. They stay until the app is closed."
  The web note is unchanged.
- Known limit: TV boxes without a system file chooser open nothing; local files on TV are not in this feat.
- Exit: in the APK both buttons open the system chooser; picked tracks play, picked pictures show.

## A2 — Keep playing in the background

- While the player is **playing or loading**, the app runs an Android media foreground service with a
  notification ("Mad⚡tr.tv", the item's title, clipped to 80 characters; tapping it opens the app). The
  service holds a partial wake lock and a Wi-Fi lock, so streams keep going with the screen off.
- (Replaced by feat-android-native §N1 lifetime.) When the player is paused, idle or in error for **3 s**, the service stops (the delay rides over
  the moment between two tracks or the video-to-audio handover).
- Android 13 and later: the notification permission is asked once, on the first play. Saying no does
  not stop the music; only the notification is hidden.
- The page player stays as it is: the next track starts from the `ended` event, which still runs while the
  app is in the background with the service up.
- Not in this feat: lock-screen / notification play-pause buttons (a media session), and video pictures in
  the background (Android hides them; their sound carries on through the audio handover).
- Exit: in the APK, music keeps playing with the app in the background and the screen off, moves on to the
  next track, and the notification goes away a few seconds after pausing.

## Release

- `versionCode 2`, `versionName "1.1"`, built, signed and published on zapstore like 1.0.

## Milestones

- [ ] A1 pick files in the app (built + machine-verified; awaiting zapa on a device)
- [ ] A2 keep playing in the background (built; published in 1.1, release dbc6dcbb…; not run on a device)
