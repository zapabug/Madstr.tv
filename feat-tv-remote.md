# feat-tv-remote: the TV remote, the TV layout, leaving on Back

Status: **PROPOSED** (spec written 2026-11-17 from the `/vibe-therapist` session; zapa settled the choices
below the same day). Not being built yet; it gets its own branch `feat/tv-remote` when it starts.

From zapa, 2026-11-17: "usually the problem is moving from playlist to play pause keys"; "on the tv the screen is
really wide and the pictures are not getting enclosed also the playlist icons are too big"; "qr should pop out
when logging in otherwise i can't log in [on the] tv"; "moving through make it yours every txt box is triggered
before i press ok"; "long press for cursor will fix a lot of it, new tvs have cursor pointer which would be nice";
"pressing back should exit, it's weird playing music on the tv background, but a pop up 'you sure you wanna
leave' is needed on tv to prevent accidental exit, confirming exit closes the app".

## What we saw on the real TV (2026-11-17)

Vestel Cosmos, Android TV 11, panel 1920×1080 at density 320, so the WebView page is **960×540 at 2×
density**: the app thinks it is on a small tablet and the TV doubles everything. Seen over adb with a debug
build's DevTools and a key logger, zapa driving the remote:

- **Focus gets lost and falls to the first control on the page, which is Log out**, after every screen change
  (opening People, Make it yours), after the focused card disappears (Follow), and after picking a Radio genre
  chip. The next arrow focuses Log out; one OK logs the TV out (it happened).
- **Playlist → Play/Pause:** Right from the playlist lands on whatever small button is level with the tile
  (Hide artist, a vote); Down lands on Previous. Play/Pause takes three presses that make no sense.
- **Text boxes open the keyboard as soon as focus reaches them** (Make it yours; Radio's "Find a genre"), and
  the keyboard then swallows the arrows (Down ×8 stayed in "Add a hashtag").
- **Holding OK repeats the button**: the TV sends OK again and again, with no repeat flag, until release;
  holding OK on Previous pressed it 20+ times.
- **People:** only the small Follow buttons take focus, not the cards; one row of three cards fits.
- **Radio's genre picker:** Down from the last chip ended on a board card behind the pop-up.
- **Layout:** the board headline is enormous, three cards across; pictures fill the width and are cropped
  (small GIFs blown up and blocky); playlist tiles take a fifth of the screen height, titles clipped; the
  focus ring on a tile is a thin white edge; a tile's name tooltip stays on screen after the panels hide.
- **The QR login sits in the "Log in to follow people" card, half hidden behind the player bar.** zapa got it
  scanned only by scrolling with Channel Up/Down.

### The remote's keys (seen in the page's key log and Android's log)

| Key | Arrives as | Today |
| --- | --- | --- |
| Arrows, OK | page: `Arrow*`, `Enter` | focus / press; a held OK repeats the press |
| Channel Up / Down | page: `ChannelUp` / `ChannelDown`, keyCode 33 / 34 (the Page Up / Down codes) | the page scrolls |
| Play/Pause | Android `KEYCODE_MEDIA_PLAY_PAUSE` → the app's player | works (zapa confirmed) |
| ⏪ / ⏩ (the remote's prev / next) | Android `KEYCODE_MEDIA_REWIND` / `FAST_FORWARD` | −10 s / +30 s; nothing on live radio |
| Stop | Android `KEYCODE_MEDIA_STOP` | pause |
| Back | Android `KEYCODE_BACK` | back a page; on the board the app goes to the background and the music keeps playing |

## Rules

- **TVR-R1** Everything in feat-applesauce-revamp's rules and the project `AGENTS.md` still holds: no mock
  data, nothing waits on a relay, untrusted input, no new runtime dependency (Norigin, mrowser and the like are
  learned from, not added).
- **TVR-R2** Arrows keep moving focus everywhere, including in the player (zapa: arrows are not seek keys).
- **TVR-R3** Focus is never on nothing while the app is in front, and an arrow never sends focus to the first
  control on the page as a fallback.
- **TVR-R4** **On a TV** means: the Android app running on a device whose UI mode is television
  (`UiModeManager` `UI_MODE_TYPE_TELEVISION`, which the Leanback launcher implies). The app tells the page
  (`<html data-tv>`). The TV-only parts below (scale, leave pop-up, QR pop-up) apply only there; phones, the
  web app and desktop keep what they have. The focus fixes (TV1-TV4) and the cursor (TV7) apply everywhere,
  since they are bugs or controls every remote and keyboard benefits from.
- **TVR-R5** Pure rules (where focus goes, how a key is read, how far the cursor moves) live in `src/lib/` with
  tests, as `focusNav.ts` does today.

## TV1: Focus is never lost

- **TV1-1 Start point.** Every screen and pop-up names where focus starts (`data-nav-start`). On a screen change
  focus goes there; if it is missing or disabled, the first control **in reading order that is not Log out /
  Log in**. PROPOSED start points: board → the first Listen sticker; Music / Podcasts / Radio / Watch → Play/Pause
  (or the first tile when nothing plays); People → the first category chip; Make it yours → Home; Radio's genre
  picker → its search box (which no longer opens the keyboard, TV4); the QR pop-up and the leave pop-up → their
  safe button.
- **TV1-2 A vanished focus hands over.** When the focused control disappears (a card after Follow, a chip that
  re-renders, a tile that leaves the playlist), focus moves to the control nearest where it was, inside the same
  area (`data-nav-group`) first, then anywhere on screen.
- **TV1-3 Log out and Log in never get focus by fallback**: only by an arrow press that lands on them.
- **TV1-4** Arrows inside a pop-up (`data-nav-modal`) never leave it while it is open. (Check Radio's genre
  picker: Down from the last chip reached a board card.)

## TV2: Each area has a front door and remembers

- **TV2-1 Front door.** An area (`data-nav-group`) may name its front door (`data-nav-default`). Arrowing into an
  area for the first time lands on its front door, not on whatever control is level with you. The player panel's
  front door is **Play/Pause**.
- **TV2-2 Memory.** Arrowing back into an area you left lands where you were, if it is still there; otherwise on
  its front door.
- **TV2-3** Leaving an area happens only when nothing lies further that way inside it (today's rule, R8).
- **TV2-4** The board's rows (sticker rows, the player bar) are areas too, so Down from a sticker goes to the
  next sticker row, not to Pause and back. PROPOSED: the player bar is reached with Down from the last row, or
  Up from nowhere, not in between rows.

## TV3: Remote keys

- **TV3-1 OK acts on release.** A press of OK (Enter) acts when it is let go, once. OK held for **0.6 s** or
  more does not press the control (it starts the cursor, TV7). Repeated OK key-downs while held never press
  again.
- **TV3-2 ⏪ / ⏩ are previous / next** (the remote's prev / next buttons): `KEYCODE_MEDIA_REWIND` /
  `KEYCODE_MEDIA_FAST_FORWARD` from a remote or keyboard move to the previous / next item in every mode (music,
  podcasts, radio, videos). Seeking stays on the seek bar and the double tap. This replaces the undiscussed
  −10 s / +30 s (planning.md). The lock-screen and Bluetooth seek actions are not part of this.
- **TV3-3 Channel Up / Down move the pictures**: Channel Up = what the right edge arrow does (next picture, or
  next video when a video shows), Channel Down = the left edge arrow. The page no longer scrolls on them.
- **TV3-4 Leave on Back, TV only.** Back on the board opens **"Leave Juke⚡tr?"** with **Stay** (focused first) and
  **Leave**. Leave closes the app and stops the music. Stay, or Back again, closes the pop-up. Anywhere else Back
  works as today. On phones Back on the board keeps sending the app to the background with the music playing
  (feat-phone-inline §P12).
- **TV3-5** Play/Pause and Stop keep working as today.

## TV4: Text boxes wait for OK

- **TV4-1** A text box that gets focus by an arrow shows that it has focus but does not open the keyboard.
- **TV4-2** OK on it opens the keyboard (focus into the text). Back, or Enter from the keyboard, closes the
  keyboard and leaves focus on the box; then the arrows move on as for any control.
- **TV4-3** Applies to every text box: Make it yours (feed address, hashtag, bunker link, …), Radio's search,
  login fields. Sliders keep today's rule (Left / Right change the value, Up / Down leave).

## TV5: The TV layout

- **TV5-1 Scale.** On a TV the page is laid out larger than 960×540. zapa picks on the real TV between
  **1280×720** and **1920×1080** from two test builds (OPEN until then); the chosen size goes here as a number.
- **TV5-2 Pictures whole, on black.** On a TV a picture or video always fits the screen whole (nothing cropped),
  centred on black, and is never enlarged more than **2×** its own size (PROPOSED number), the rule phones
  already use.
- **TV5-3 Tiles fit.** At the chosen scale a playlist tile's title is never clipped by its panel.
- **TV5-4 Focus you can see from the couch.** The focused control has a ring of at least **4 px** (at the chosen
  scale, PROPOSED number) in a colour that stands out on every sticker colour and on pictures.
- **TV5-5 No hanging tooltip.** A tile's name tooltip hides whenever its tile loses focus or its panel hides.
- **TV5-6 People cards take focus.** On People a card is one focus stop; OK on it follows / unfollows
  (PROPOSED). Down / Up move a row and the list scrolls so the focused card is fully in view.

## TV6: Log in with a QR pop-up (TV)

- **TV6-1** On a TV, Log in opens a full-screen pop-up with the login QR as large as fits (at least **60 %** of
  the screen height, PROPOSED number), a line saying to scan it with a signer app, and **Close** (focused first).
  Back closes it.
- **TV6-2** The pop-up closes by itself once the signer answers and the TV is logged in.
- **TV6-3** The QR is the same login the People card offers today (bunker / Nostr Connect); nothing new is sent.

## TV7: Hold OK for a cursor

- **TV7-1** Holding OK **0.6 s** turns on a pointer (an arrow drawn over the page). Holding OK again, or Back,
  turns it off. Focus mode returns with focus on the control under the pointer if it is one, otherwise where it
  was.
- **TV7-2** Arrows move the pointer: a tap moves it **24 px**; held, it moves at **300 px/s** rising to
  **1200 px/s** over **1 s** (PROPOSED numbers, tuned on the TV). It stays on screen.
- **TV7-3** OK clicks what is under the pointer, as a mouse click would.
- **TV7-4** At the screen edge, inside **48 px**, the pointer scrolls whatever scrolls there (PROPOSED number).
- **TV7-5** The pointer is drawn by the page, so it works in the Android app on any TV and in a TV's browser.
- **TV7-6 Pointer remotes.** On a TV whose remote is a pointer (it moves a real mouse pointer), the app behaves as
  with a mouse: everything clickable is clickable, and nothing is hover-only.

## Prior art (learn only)

- [mrowser](https://github.com/Agung78/mrowser) (MIT): Android TV WebView browser, D-pad cursor
  (`CursorLayout` / `CursorController`), long-press OK switches cursor and focus mode.
- [AndroidTv-Ctrl-WebView](https://github.com/jasurrr0304/AndroidTv-Ctrl-WebView): cursor toggle, edge scroll.
- [Norigin Spatial Navigation](https://github.com/NoriginMedia/Norigin-Spatial-Navigation) (MIT): front door
  (`preferredChildFocusKey`) and memory (`saveLastFocusedChild`).
- MATVT (GPL-3.0), DPTV-Cursor, remouse: system cursors through accessibility services; not reused.
- Skills read, none installed (android-tv-focus-audit, vibey 10-foot UI / Smart TV reference); their checklist is
  in TV1-TV5: reachable, predictable, first focus on every screen and dialog, visible focus, nothing hover- or
  touch-only, readable from the couch, Back always works.

## Open (decide during build)

- **OPEN** TV5-1 scale: 1280×720 or 1920×1080, zapa picks on the TV from two test builds.
- **OPEN** After a cursor click (TV7-3), stay in cursor mode or go back to focus? Default: stay.
- **OPEN** The PROPOSED numbers (2× picture limit, 4 px ring, 60 % QR, cursor step / speeds / edge) are tuned
  with zapa on the TV.
- **OPEN** Should the lock-screen / Bluetooth seek actions also become previous / next? Default: no.
- **OPEN** The web app in a TV's browser is not detected as a TV (TVR-R4); leave it so unless zapa asks.

## Milestones

Remote first (zapa). Each milestone is checked two ways: by machine (unit tests for the pure rules; a headless
Chromium at **960×540, 2× density** with real key events over DevTools, as in `AGENTS.md`), and by zapa on the
TV with the debug build. It is done only after zapa says so.

| # | Title | Exit criteria |
| --- | --- | --- |
| TV1 | Focus never lost | **TV1-EC1** On every screen change focus is on the screen's start point (headless: board, Music, Podcasts, Radio, Watch, People, Make it yours, genre picker). **TV1-EC2** Follow a card on People: focus is on a neighbouring control, not on nothing and not Log out. **TV1-EC3** Pick a genre chip: focus stays in the picker. **TV1-EC4** No arrow sequence in the headless walk lands on Log out unless it is the next control that way. **TV1-EC5** zapa walks People and Make it yours on the TV. |
| TV2 | Front door + memory | **TV2-EC1** From any playlist tile, Right (or Down) reaches Play/Pause in one press. **TV2-EC2** From Play/Pause, Left returns to the tile you came from. **TV2-EC3** Board: Down from a sticker goes to the next sticker row. **TV2-EC4** Unit tests for the front-door / memory rule. **TV2-EC5** zapa on the TV. |
| TV3 | Remote keys + leave | **TV3-EC1** Holding OK on Previous for 2 s presses it zero times; a tap presses it once. **TV3-EC2** ⏪ / ⏩ on the TV go to the previous / next item on music, a podcast and a radio station. **TV3-EC3** Channel Up / Down change the picture and do not scroll. **TV3-EC4** On the TV, Back on the board shows the pop-up with Stay focused; Leave closes the app and the music stops; Stay closes the pop-up. **TV3-EC5** On the phone Back on the board still backgrounds with music. |
| TV4 | Text boxes wait for OK | **TV4-EC1** Arrowing through Make it yours on the TV never opens the keyboard. **TV4-EC2** OK opens it; Back closes it; arrows then move on. **TV4-EC3** Same in Radio's search. |
| TV5 | TV layout | **TV5-EC1** zapa has picked the scale on the TV; the number is in TV5-1. **TV5-EC2** On the TV a picture and a small GIF show whole, on black, not past 2×. **TV5-EC3** Playlist titles are not clipped; the focus ring is seen from the couch (zapa). **TV5-EC4** The tooltip never stays after its panel hides. **TV5-EC5** People: every card reachable by arrows, the focused card fully in view. **TV5-EC6** Phones and desktop look unchanged (screenshots before / after). |
| TV6 | QR login pop-up | **TV6-EC1** On the TV, Log in shows the whole QR, scannable from the couch with zapa's signer, and he logs in. **TV6-EC2** Back and Close close it; it closes by itself after login. |
| TV7 | Hold OK for a cursor | **TV7-EC1** Hold OK 0.6 s: the pointer shows; hold again or Back: it goes. **TV7-EC2** The pointer clicks a control the arrows cannot reach, and scrolls a long list at the edge. **TV7-EC3** Unit tests for the hold timing and the movement. **TV7-EC4** zapa uses it on the TV. |
