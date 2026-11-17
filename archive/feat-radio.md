# feat-radio: internet radio, Nostr first

Status: **GO** (zapa, 2026-11-16: "how about the other tasks i acept the new dependncy"): being built on `feat/radio`; hls.js accepted.
From zapa: "yes radio would be really cool"; asked how to find stations: **genre stickers** and **country**;
thumbs: **up saves, down hides**; screen: **the picture show**, the station's logo as the disc; sources: "what
would a Nostr-first approach be" (answered below: stations from Nostr). 2026-11-16: "the exact stickers genre
picker by user" (you pick which genres are your stickers); "yes zap.stream" (live shows are in this feat).

## Nostr first: where the stations come from

Probed 2026-11-16:
- Internet radio stations already live on Nostr as **kind 31237** events, published by WaveFunc
  (github.com/zeSchlausKwab/wavefunc, wavefunc.live). Not a merged NIP, but it is in use.
- `wss://relay.wavefunc.live` holds **11,736** stations, **6,968** with an https stream, in 204 countries.
  Most come from one account that imports the public Radio Browser directory; a few were made by hand,
  including Omarchy Radio.
- Each event has a `d` tag, `name`, genres as `["c", <genre>, "genre"]`, `countryCode`, `location`,
  `thumbnail` (logo) and `website`. The streams are in the content JSON (`streams[].url`, `primary`), and
  sometimes in `stream` tags too.
- The relay answers genre filters (`#c`) and name search (NIP-50 `search`). Country is not a filterable tag.

So Radio needs no directory outside Nostr: no Radio Browser, no SomaFM.

## Rules

- Station events are untrusted, like every relay event. The parser lives in `src/lib/radio.ts` with tests built
  from real events: names clipped, links https only, a station with no https stream is left out.
- Nothing waits on a relay. The device cache (feat-taste-cache §T3) also keeps stations (metadata only).
- No new dependency.

## RA1: Radio on the board

- **Listen** gets a third card, **Radio**, next to Music and Podcasts. Its picture is the logo of the station
  that plays next.

## RA2: Finding stations

- **Genre stickers, picked by you** (zapa): a **+ genres** sticker opens a genre picker (the genres the stations
  carry, commonest first, with a search box); the genres you pick become your stickers, in your order, kept on
  this device. Until you pick any, the picker opens by itself the first time Radio opens. Pressing a sticker
  asks the relays for that genre (`#c`). Stickers are little coloured stickers like the People category chips.
- **Country**: a country picker (yours first, from the device's language setting). Stations are filtered by
  their `countryCode` in the app.
- Stations posted by **people you follow** come first, whatever the genre or country.
- **Your stations** (the ones you saved with an up vote) is the first sticker.
- The relays asked: `relay.wavefunc.live` plus the content relays.

## RA3: Playing a station

- The playlist is the stations, as tiles with their logo. Previous / next move through them.
- A station is live: **no seek bar and no speed**. In their place a **LIVE** sticker, and how long you have
  been listening.
- The now-playing card shows the station's **logo as the disc** and its name. Behind it is the **picture show**
  from your follows, as with music.
- A station that does not start within **10 s**, or stops, says "Station not answering" and the player moves
  to the next one.
- Double tap on the picture does nothing on a live station (there is nothing to seek).
- Android app: the same, with the lock-screen and notification controls (play / pause, next, previous).

## RA3b: Live shows from zap.stream (Nostr live events)

- Probed 2026-11-16: **28** NIP-53 live events (kind 30311, `status` live) on the relays, many tagged `music` or
  `radio` (Noderunners Radio, NoGood Radio, The Lot Radio, ZapClub, MIRA Business FM, The Road to ZamRock).
- Radio's first row is **Live now**: live events from people you follow, then those tagged `music` or `radio`.
  They play like a station (LIVE sticker, picture show, skip when silent); the event's `image` is the disc and
  its `title` the name. An event that is no longer `live` leaves the row.
- Their streams are **HLS** (`.m3u8`). The Android app plays HLS natively. Desktop Chromium did not play them
  in a probe, so the web app needs **hls.js** (a new dependency: **needs zapa's OK**), loaded only when an HLS
  stream starts. Without it, Live now is shown in the Android app only.

## RA4: Thumbs on a station

- **Up vote saves** the station to Your stations on this device. Nostr first: logged in, it is also a public
  like (NIP-25, kind 7, `a` tag to the station event), as with music. A second press takes both back.
- **Down vote hides** the station on this device, with Bring back under Your sources → Hidden, and moves on.
- No Hide artist post-it on stations: nearly all of them come from one importer account.

## Open (decide during build)

- The genre picker leaves out words that say nothing ("music", "radio", "fm", "estación"); the list goes to
  planning.md.
- How many stations one genre ask brings back (a page, more as you scroll).

## Later, not in this feat

- Making your own station event (kind 31237) from Madstr.

## Found while building (2026-11-16, probed again)

- `relay.wavefunc.live` refuses any request with `limit` over **500**. One ask (a genre, the newest stations, the
  stations of people you follow) is one page of at most 500.
- Station events come in two shapes: the importer's (`countryCode`, `location`, `l` language, streams only in the
  content JSON) and hand-made ones (a `stream` tag with the url, sometimes `country` instead of `countryCode`). Both
  are read; the content JSON first, then `stream` tags. The primary stream wins, then the first https one.
- In 500 stations, about half have only `http://` streams (left out, as the rules say), and about 5 % are HLS
  (`.m3u8`): those also go through hls.js on the web.
- The genre list: the genres of the newest 500 stations (one ask, made when Radio opens), commonest first, less the
  words that say nothing; the picker's search box also takes any genre typed in, asked of the relay as it is
  (lower case).
- Live events (kind 30311): the `streaming` url (https), the `title`, the `image`, `t` tags. Some say `live` for days
  with no stream; NIP-53 treats a live event not updated for an hour as ended, so Live now keeps only those updated
  in the last **hour** with an https stream. "Tagged music or radio" counts a `t` tag of `music` or `radio` (also
  written `internal:music`).

## How it plays (decided during build, for zapa's review)

- A station or live show is a **live** item: the player keeps no resume position for it, does not mark it played
  (it stays in the list after you listen), and plays at 1×.
- "Does not start within 10 s, or stops": 10 s from asking it to play without sound, or 10 s stuck waiting once it
  played, or the stream ends. Then "Station not answering" and the next one. If every station in the list fails,
  the player stops with that text.
- The playlist's order: Live now, then stations from people you follow, then the sticker's stations. The country
  filter applies to stations, not to Live now (live events carry no country).
- Your stations (up votes) are kept on this device as the station's name, logo, stream and genres (at most 500), so
  the sticker works before any relay answers.
- More than one page per genre ("more as you scroll") is left for later; one ask brings up to 500.

## RA5: Genre first, pick one or many, 30 at a time (zapa, 2026-11-17)

zapa: "radio stations is working wrong … they are selected by genre first never prefilled genre and coutry or similar
tags like bitcoin lets try to keep it under 300 station load another 30 or w,e only shuffle on the current 30", and
"the genre card and countrys make them either select all select one etc other wise is hard to browse". This replaces
RA2's one-sticker-at-a-time and the Live now / follows rows at the top (RA3b's order).

- **Nothing is prefilled.** Radio opens with nothing selected and nothing playing; the picker opens by itself until
  you have genres. The list says "Pick a genre, a word like bitcoin, or Your stations."
- **Genres are stickers you select, one or many.** The bar holds **Your stations**, **All genres**, your genre
  stickers, **+ genres**, then **All countries**, your country stickers, **+ countries**. Pressing a sticker turns it
  on or off; several can be on at once. All genres turns every genre on (and the single ones off); All countries
  is on when no single country is. The picker has the same choices, plus **Clear**, and a ✕ beside each sticker
  takes it off the bar. The sticker row scrolls sideways with a little slider under it (its scroll bar cannot be
  reached on a phone or with a remote); the playlist header no longer says "Radio · N in the playlist" (zapa, everywhere).
- **A genre can be any word** (bitcoin, jazz, salsa): Radio asks the station relay for it as a genre (`#c`) and as a
  text search of names and descriptions (NIP-50, only on relay.wavefunc.live, which answers it). Probed 2026-11-17:
  "bitcoin" is the genre of 1 station and in the text of 3 (Good Morning Bitcoin, Roger Radio, Valencianismo).
- **Live shows** join a list when they are tagged with one of the words on (Noderunners Radio is tagged bitcoin),
  or, with All genres, when they are music or radio shows. They come first in it; the country does not apply to them.
- **Countries** filter the stations (by their `countryCode`), one or many; none = every country.
- **Under 300.** One selection loads at most **300** stations (each word asks for its share: 300 split between the
  words, at least 30 each). Stations posted by people you follow come first within it.
- **30 at a time.** The playlist holds the first **30**; when the last of them plays, or you press **+30 more**, the
  next 30 join. **Shuffle** mixes only what is in the playlist; the next 30 join after it, shuffled among themselves.

## Milestones

Built and machine-verified on 2026-11-16, awaiting zapa's test (the final [x] is his):
- [ ] RA1 Radio card on the board (built: 2b6a1d4)
- [ ] RA2 genre stickers, country, follows first, Your stations (built: 54fb93d)
- [ ] RA3 playing a live station (LIVE sticker, no seek, skip when silent, picture show) (built: 8120aef)
- [ ] RA3b Live now: zap.stream live events (HLS; hls.js 1.7.4, zapa OK'd) (built: 8120aef)
- [ ] RA4 up saves (+ like when logged in), down hides (built: 594a9f7)
- [ ] RA5 genre first, many genres and countries at once, under 300, 30 at a time (zapa, 2026-11-17)
