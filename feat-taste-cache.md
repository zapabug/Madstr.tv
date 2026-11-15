# feat-taste-cache: bigger faces, votes and hiding, and a cache that fills the lists

Branch: `feat/taste-cache`, off `main`.
Status: spec from zapa's words on 2026-11-15, with a screenshot of the Music view: "the profile cards / the id
from the image posted and the now playing id on the media controls are too small; also the ability to up/down
vote music, and hide songs/artists; I'm also finding the lack of a refresh or restart data stream from nostr;
how to get more media and use the cache better; also looking for performance improvements".
Asked and answered the same day:
- votes: **up votes public, down votes private**;
- hiding songs and artists: **on this device**;
- more media: **keep music and videos on the device**, **reach back in time**, **more relays** (a refresh
  button was offered and not picked);
- performance: "will be fixed by cache".
Scope: web app and Android app (same code).

## Rules

- **No new dependency.** The device cache uses `idb`, already a dependency (own audio).
- Cached events are read back as untrusted, exactly like relay events: same converters, same checks.
- An up vote is published only when someone is logged in, and only on a press. Nothing else is published.
- Nothing waits on the cache: the app renders at once, and the cache fills in as it loads.

## T1: Bigger faces

- The face of whoever posted the picture on screen (bottom left of the picture): **56 px** (was 32).
- The face of whoever made what is playing (top of the media controls): **96 px** (was 40; zapa asked for it
  bigger again after 72), 64 px on phones.
- Exit: both read clearly at TV distance, and the media controls still fit their panel at a phone's width.

## T2: Votes and hiding

zapa, 2026-11-15, after trying the first version: "hide song and downvote do the same job, no need for
duplicate buttons". So a down vote **is** hiding the song.

The media controls, top to bottom (zapa, 2026-11-15): the **author's face, bigger (96 px, 64 on phones), with
the thumbs either side overlapping its edges** (up vote left, down vote right) and **Hide artist** as a small
post-it (28 px) stuck on its bottom-right corner, crossed with a red diagonal line; **previous / play / next**;
a little **speed** post-it, just bigger than the number and made oversized with the word "SPEED" (fast
stickers add horse power); the **seek bar** across the full width under it.
- **Up vote** (thumb up). Logged in, and the item is from Nostr: publishes a public like (NIP-25 reaction,
  kind 7, content `+`, tags `e` (+ `a` for an addressable track), `p`, `k`) to the content relays. Logged
  out, or not from Nostr: kept on this device only. The button stays lit while voted; pressing it again takes
  the vote back (a published like is withdrawn with a NIP-09 deletion, kind 5).
- **Down vote** (thumb down). Never published. The song leaves every list on this device and the player moves
  to the next item; a like it had is withdrawn.
- **Hide artist** (Nostr items only): everything that account posted leaves every list (Music, Podcasts,
  videos) on this device, and the player moves on.
- Down-voted songs and hidden artists are listed under **Your sources → Hidden**, each with **Bring back**.
- Stored in `localStorage` (`madstr:taste`): at most 2000 up votes and 2000 down-voted songs, the oldest
  dropped first; hidden artists are not capped.
- The signer is asked for kinds 7 and 5 up front alongside 3, so Amber can remember them.
- Exit: an up vote logged in shows as a kind 7 event on a relay; down vote and hide artist change the lists
  and come back with Bring back; all of it survives a reload.

## T3: Keep music, videos, profiles and follow lists on the device

- **Metadata only** (zapa, 2026-11-15: "a metadata cache"): the posts' text and tags are kept, never the audio,
  video or picture files themselves.
- Nostr events the app uses are kept on the device (IndexedDB, `MadstrEventCache`), and put back into the
  app's event store at start, so lists, faces and names show straight away and the relays only add to them:
  - music and podcast posts (what the audio converter accepts): newest **3000**;
  - video posts (what the video converter accepts): newest **1500**;
  - profiles (kind 0, newest per person): **3000** people;
  - follow lists (kind 3) of the account whose follows feed the board (the TV's, or yours).
  Pictures keep their own cache (2000, unchanged).
- Lengths read from audio files (the music / podcast split) are kept too, newest **5000**.
- A list shows everything in the store that matches it, not only the newest page the relays sent.
- New events are written in batches every 3 s; the caps are applied when the app starts.
- Exit: a reload with the network cut still shows Music, videos and faces from the last visit; the board
  shows lists before the relays answer.

## T4: Reach back in time for music and videos

- zapa, 2026-11-15: "refetch for every 30 we drop". While a Music, Podcasts or video list is open, the app
  asks the relays for one older batch of that list's kind when the list opens, and **one more for every 30
  items the list drops**: items left out because they played this session, are hidden, or fall outside the
  list's length rule (Music 2-9 minutes, podcasts longer, short videos under 30 s).
- One batch at a time; it stops when the cached count reaches its cap (T3) or the relays have nothing older.
  Pictures keep their own walk (every 20 s), unchanged.
- Where each walk got to is remembered on the device, so the next visit carries on instead of starting again;
  one walk per follow list (the last **4**), so the TV's list before a login lands does not overwrite yours.
  "Reached the start" lasts one visit: an empty answer may have been a slow relay, so the next visit asks again.
- Exit: playing through a list (or hiding from it) brings older items in; the next visit continues further back.

## T5: More relays

- Content relays added after a probe on 2026-11-15 (each answered, and each held music posts):
  `relay.wavlake.com`, `theforest.nostr1.com`, `nostr.bitcoiner.social`, `relay.nostr.net`.
- Exit: `pnpm relays` passes with the new relays.

## T6: Seeking by double tap and the remote

zapa, 2026-11-15: "remove the -10s +30s buttons and handle double tap without disabling fullscreen; on the
remote there are usually buttons for this".
- The −10 s and +30 s buttons go from the media controls, and from the slim player bar on the board (seek bar
  and remote keys there).
- On the picture area (the video, or the slideshow behind music): a **double tap on the left half goes back
  10 s, on the right half forward 30 s**, with a short "−10 s" / "+30 s" sign on that side. A double tap does
  not bring the panel back when the picture fills the screen.
- A single tap keeps its job (on a video, play / pause; anywhere, the panel comes back), done once no second
  tap has come within **300 ms**, so a double tap never also pauses or wakes.
- Remote and keyboard: the rewind / fast-forward media keys already do −10 s / +30 s (feat-android-native
  §N1 in the app, the browser's media keys on the web); the chevrons on the edges stay previous / next.
- Exit: in the full picture, a double tap on either side seeks and the panel stays away; a single tap on a
  video pauses it and the panel comes back.

## T7: Phone turned sideways

zapa, 2026-11-15: "on mobile tilting the screen hides the bottom panels, interacting only shows the seek bar and
prev play next buttons; to manage the playlist they tilt portrait".
- A phone in landscape (landscape and at most **500 px** tall): the picture (video or slideshow) takes the
  whole screen; the playlist and the rest of the controls are not shown.
- Turning the phone sideways hides the controls at once. A touch brings back only **previous / play / next and
  the seek bar**, over the bottom of the picture; they go again after the usual 25 s without input.
- Turning it upright brings back the normal screen with the playlist.
- Exit: at 860×400 the picture fills the screen; a tap shows only the transport and seek bar; at 400×860 the
  normal layout returns.

## Milestones

- [ ] T1 bigger faces (built + machine-verified)
- [ ] T2 votes and hiding (rebuilt after zapa's try: down vote = hide song)
- [ ] T3 device cache (built + machine-verified)
- [ ] T4 reach back in time (built + machine-verified)
- [ ] T5 more relays (built; probe passes for the new relays)
- [ ] T6 double tap to seek; −10 s / +30 s buttons removed
- [ ] T7 phone turned sideways: full picture, transport and seek bar only
