# feat-lava-lamp: a lava lamp behind the viewer's pictures that keeps the music's rhythm

Status: **shipped** (spec written 2026-11-18 from the design boards; zapa said "create a spec then implement";
zapa confirmed it working on the dev server 2026-11-18).

From zapa, 2026-11-17/18, over the mock-up boards A–H (canvas "Lava & Neon"): the winamp idea came back for "the
screen when pictures don't fill it"; "something that would match our app, low key"; "the lava does not react to
music, it either moves fast or slow"; then on board G (fluid lava, after the Powder Toy napplet's gases) "you nailed
it", drop the flames and tubes, "the spray as our rhythm", gas "randomly placed from the edges of the screen" that
reacts with the lava balls, no glossy look; on board H (gas on the beat) "that is amazing, i wish the spray never
faded and kinda acted like a lava lamp with colors mixing and changing based on rhythm … lets try it for real on dev".

## What it is

In the viewer, the black space around a picture (pictures are shown whole, centred) becomes a lava lamp: blobs of
wax drift on their own slow pace, and on every beat of what is playing a spray of colour shoots in from the
screen's edge, swirls into the wax and stays, so the lamp's colours keep mixing and changing with the music.

## Rules

- **LL-R1** Everything in feat-applesauce-revamp's rules and the project `AGENTS.md` still holds: no mock data, no
  new runtime dependency (the fluid is our own code after Jos Stam's "stable fluids"; the Powder Toy napplet, GPL-3.0,
  is learned from, not used), nothing waits on a relay.
- **LL-R2** The music never breaks for the lamp. The sound is read with `captureStream()` on the playing `<audio>`,
  which leaves the element playing exactly as before (background play, the lock screen and the TV's media keys are
  untouched); the lamp never routes the music through Web Audio.
- **LL-R3** A web page may only read a sound from another site when that site allows it (CORS). A track whose host
  does not allow it still plays as today; the lamp then just drifts with no sprays.
- **LL-R4** The lava's own movement never follows the music; only the sprays do.
- **LL-R5** On every device the app runs on — it is an every-device app, TV included (zapa, 2026-11-18: "again
  why is it tv only … it would look nice on other devices aswell") — but only behind the slideshow (never
  behind a video), and not with `prefers-reduced-motion: reduce`. A device without WebGL2 float textures
  shows black, as today.

## LL1: reading the sound when the host allows it

- **LL1-1** Before loading an item into the hidden `<audio>`, the player sets `crossOrigin="anonymous"` for an
  http(s) URL on another origin unless that host is remembered as not allowing it. Same-origin, `blob:` and
  `data:` URLs, the viewer's `<video>` and hls.js streams are left as they are.
- **LL1-2** If an item tried with `crossOrigin` fails before it ever played, the player loads it again at once
  without `crossOrigin`; this retry is not a failure (it never skips the item). If the retry plays, the host is
  remembered as not allowing it; if it fails too, the normal error path runs (skip, as today).
- **LL1-3** An item that plays with `crossOrigin` remembers its host as allowing it.
- **LL1-4** The memory is per host, in localStorage `madstr:readable-hosts`, at most 300 hosts (the oldest
  dropped). Pure rules in `src/lib/readableHosts.ts` with tests.
- Probed 2026-11-18 (real events from wavlake, nos.lol, primal, wavefunc): radio 47 of 49 answering streams allow
  it; music hosts archive.org, audio.nostr.build, blossom.jumble.social and renaissancemachine.ai allow it,
  storage.googleapis.com (Wavlake's files) does not.

## LL2: the rhythm

- **LL2-1** A sound tap (`src/lib/soundTap.ts`) reads the playing `<audio>` through `captureStream()` into an
  `AnalyserNode` (FFT 2048, smoothing 0.55) whose output goes nowhere audible (a gain of 0). It re-captures on
  every `playing`, suspends while the page is hidden, and resumes on the next key or tap.
- **LL2-2** From the spectrum, three bands, each scaled to its own recent peak (decay 0.2 /s, floor 0.08):
  bass bins 2–12, mid 12–93, treble 93–372. A **beat** is the bass rising above its running average × 1.2 + 0.03,
  at most one per 0.28 s. Pure, in `src/lib/rhythm.ts`, with tests.
- **LL2-3** The colour of a spray follows the sound: mostly bass, magenta / pink / orange; mostly mids, orange /
  lemon / lilac; mostly treble, sky / mint; turn by turn within the group.

## LL3: the lamp

- **LL3-1** A canvas fills the viewer's picture area behind the slideshow (`.slides` is transparent where the lamp
  is), drawn at 576 × 324 and scaled up. The flow is 160 × 90 cells, 20 pressure steps a frame. The wax is 384 × 216
  in Focused and 256 × 144 (bigger, softer shapes) in Smoky.
- **LL3-2** The wax: three heaters at the bottom puff warm wax on the lava's own clock (slow, 0.55); warm wax rises,
  cools (0.1 /s, faster near the top), sinks and is warmed again at the bottom. With no music the heaters puff the
  lamp's base colours (orange, pink, mint, lilac).
- **LL3-3** The sprays: on every beat a spray shoots in from a random spot on the edge (left 40 %, right 40 %,
  top 10 %, bottom 10 %), aimed inward ± 34°, lasting 0.45 s, strength 0.4 + 0.9 × loudness; a big beat may add a
  second. A spray is warm wax of its colour: it pushes the flow, mixes into the wax it meets, and stays. The heaters
  then puff the last three spray colours, so the lamp's colours move with the music. This is **Focused**.
- **LL3-3s** In **Smoky**, half the sprays still come from an edge (± 54° sway) and half start anywhere in the wax,
  aimed any way. Four kinds roll their own life, width, push and ± 20 % variation: gust (0.7 s, width 0.0045,
  push 90), puff (0.6 s, 0.0085, outward from a point, 115), whip (0.5 s, 0.0022, 150), shimmer (0.35 s, 0.0016,
  70). A beat over 0.8 with bass over 0.5 blooms a puff, other beats gust; mids over 0.6 dart whips at least 0.3 s
  apart, treble over 0.45 scatters one or two shimmers at least 0.14 s apart, bass over 0.6 stirs a gust or puff at
  least 0.4 s apart. Each spray paints a core colour and a partner hue at its rim, so neighbours melt; the heaters
  breathe with bass and mid (zapa's dropped libs, 2026-11-22).
- **LL3-4** It never fills up: the wax fades very slowly (0.01 /s) until the lamp holds its budget (a quarter of the
  screen's worth of wax), then the oldest wax melts away faster in proportion to the excess.
- **LL3-5** Focused: the Jukestr 3000 sticker — thin wax glows softly, thick wax is a shape with a black outline, a
  hard shadow down-right and a lighter band where it is warm, over the purple glow. Colours are muted toward the
  purple (22 %) so the picture stays the star.
- **LL3-5s** Smoky: the whole backdrop drifts and breathes with the sound, the wax is one soft blurred glow (no
  outline, no shadow), hues stay mid-tone (capped at 0.68, 35 % toward the purple) so overlapping sprays never
  wash out to white (zapa, 2026-11-22: "avoid light colors … feels overwhelming").

## LL5: settings (zapa, 2026-11-22)

- **LL5-1** Make it yours has two controls: **Background animation** On/Off, and **Spray style** Focused/Smoky.
  Off stops the canvas, the audio tap and the animation entirely: the black stage, as before any lamp.
- **LL5-2** Default is On + Smoky (the look zapa was viewing). The choice lives in localStorage `madstr:lava`;
  pure validation lives in `src/lib/lavaSettings.ts` with tests, and unknown values fall back to the default.
- **LL5-3** Reduced motion and video still win: no lamp with `prefers-reduced-motion: reduce`, never behind a video.
- **LL5-4** The two drifting star/light layers behind the menus are gone (zapa, 2026-11-22: "the background from
  other menus has some stars/lights with movement … remove it"). The corner planet stays.
- **LL5-5** A compact **Make it yours** chip sits beside Log in / Log out in the home header, so the Background
  card is one press from home (zapa, 2026-11-22). It is a focus-nav fallback only elsewhere, never a start point.

## LL4: on a device

- **LL4-1** Machine check: `pnpm test && pnpm lint && pnpm build`; in headless Chromium the canvas draws (not
  blank) and a playing same-origin tone gives beats and sprays.
- **LL4-2** zapa's check: the lamp shows beside a picture on the dev server; radio makes it spray in time; a
  Wavlake song still plays (no sprays); background play still works. On the Vestel TV: black, as before (its
  WebView has no WebGL2, measured 2026-11-18; `captureStream()` exists there).
