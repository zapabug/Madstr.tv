# Changelog

Release notes for the Android app on zapstore (`zapstore.yaml` → `release_notes`). The web app at
pleb.world/jukestr gets the same changes as they are deployed.

## [1.7] - 2026-11-18

A lava lamp behind the pictures.

- **The lava lamp**: the black space around a picture in the viewer is now a lava lamp — blobs of wax drift on
  their own slow pace, and on every beat of what is playing a spray of colour shoots in from the edge, swirls
  into the wax and stays, so the colours keep mixing and changing with the music. It runs on every device the
  app runs on, TV included; a device that cannot draw it (no WebGL2 float textures) keeps the black stage, as
  before.
- **The music never breaks for the lamp**: the sound is read where the host allows it (CORS); a track whose
  host does not allow it still plays as today, the lamp then just drifts with no sprays. Reduced motion turns
  the lamp off.

## [1.6] - 2026-11-17

Juke⚡tr on the TV, with the remote that came with it.

- **The remote never gets lost**: every screen starts on a sensible button, and focus never lands on Log out by
  itself.
- **Playlist to Play/Pause in one press**, and Left brings you back to where you were.
- **Hold OK for a pointer** the arrows move, for anything the arrows cannot reach. Holding OK no longer repeats
  a button.
- **The remote's keys**: prev / next skip tracks, Channel Up / Down change the picture.
- **Text boxes wait for OK**, so the TV keyboard no longer pops up on its own.
- **Back asks before leaving** on a TV, and leaving stops the music.
- **A TV layout**: laid out for the TV instead of doubled up, pictures shown whole, a focus ring you can see from
  the couch, People cards you can move between.
- **Log in on a TV with a big QR code** to scan with your phone's signer.

## [1.5] - 2026-11-17

The app is now called **Juke⚡tr**: your Nostr jukebox.

- **New name and logo**: the magenta play triangle with the lemon bolt, on the home screen, the launcher, the
  start screen and the notification. The Play button is the logo; while something plays it shows the bolt alone.
- **Radio**: internet radio stations from Nostr and live shows from zap.stream. Turn on genres (any word, like
  jazz or bitcoin) and countries, one, many or all; up to 300 stations, played 30 at a time. Up vote saves a
  station to Your stations, down vote hides it.
- **Phone layouts**: their own upright and sideways layouts, a full-screen app, and a back swipe that goes back
  a page instead of leaving.
- **Log in with Amber** (or another signer app) straight from the app.
- **Make it yours**: your feeds, folders, hashtags and hidden items on a page of their own.
- **The Jukestr 3000 look**: the playlist and the player as one orange toy machine, domed buttons, a rainbow seek
  bar with a little Saturn.
- **Podcasts from Nostr reach further back**: older episodes are found, not only the newest.
- RSS feeds are read more safely, and the stars on the home screen drift again.

## [1.4] - 2026-11-16

- Phone controls in two compact rows.
- A phone held sideways shows the TV layout.

## [1.3] - 2026-11-15

- Bigger faces, up and down votes, hiding artists.
- Music and videos seen are kept on the device, so lists show at once.
- Double tap the picture to jump back or forward.

## [1.2] - 2026-11-15

- Lock-screen and notification controls (play / pause, next, previous; headphones and TV remotes too).
- Music folders are remembered; your local music mixes into Music.
- Music is 2 to 9 minutes long; longer is a podcast.

## [1.1] - 2026-11-15

- Keeps playing in the background.
- Pick music files from the device.

## [1.0] - 2026-11-15

- First release for Android phones and Android TV: music, podcasts, videos and a picture show from Nostr, RSS and
  your own files, driven with a remote.
