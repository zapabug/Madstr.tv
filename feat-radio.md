# feat-radio: internet radio, Nostr first

Status: **PROPOSED** (2026-11-16), waiting for zapa's go. Not built.
From zapa: "yes radio would be really cool"; asked how to find stations: **genre stickers** and **country**;
thumbs: **up saves, down hides**; screen: **the picture show**, the station's logo as the disc; sources: "what
would a Nostr-first approach be".

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

- **Genre stickers**: the commonest genres among stations with an https stream, as little coloured stickers
  (like the People category chips). Picking one asks the relays for that genre (`#c`).
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

## RA4: Thumbs on a station

- **Up vote saves** the station to Your stations on this device. Nostr first: logged in, it is also a public
  like (NIP-25, kind 7, `a` tag to the station event), as with music. A second press takes both back.
- **Down vote hides** the station on this device, with Bring back under Your sources → Hidden, and moves on.
- No Hide artist post-it on stations: nearly all of them come from one importer account.

## Open (decide during build)

- Which genres are the stickers: the commonest few, cleaned of words that say nothing ("music", "radio",
  "fm", "estación"). The count and the list go to planning.md.
- How many stations one genre ask brings back (a page, more as you scroll).

## Later, not in this feat

- Live shows on Nostr (NIP-53 live events, e.g. zap.stream) with audio-only streams, as a **Live now** row.
- Making your own station event (kind 31237) from Madstr.

## Milestones

- [ ] RA1 Radio card on the board
- [ ] RA2 genre stickers, country, follows first, Your stations
- [ ] RA3 playing a live station (LIVE sticker, no seek, skip when silent, picture show)
- [ ] RA4 up saves (+ like when logged in), down hides
