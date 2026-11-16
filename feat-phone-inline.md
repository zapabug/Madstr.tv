# feat-phone-inline: phone controls back to two compact rows

Branch: `feat/phone-inline`, off `main`.
Status: from zapa, 2026-11-16: "I was intentionally trying to collapse it into inline as it was prior to me
making a custom media player buttons styling, which on mobile takes too much screen space"; "ideally two rows
of cards should display".

## P1: Phone portrait (screens up to 640 px wide)

- The media controls go back to two compact rows (zapa: "put the disc card over 2 rows and move the buttons to
  the right a bit"; then "too big, and the speed on the bottom didn't look bad at all"):
  - left, over both rows: a **small disc card** (46 px disc, no title: the playlist header already names what
    plays), with **Hide artist** on its corner;
  - right, row 1: the **seek bar**, full width;
  - right, row 2: **previous / play / next**, then **up vote, down vote** and the **SPEED** post-it.
- The playlist header stays on one line (Board, the title cut short, Shuffle); its "· N in the playlist" count
  is left out on phones.
- The swap animation stays on the disc (it spins in); the old card does not fly out on phones.
- The playlist gets the height back: **at least two full rows of tiles** at 360×780, 393×852 and 412×915.
- Desktop, TV and the Android app's sideways view are unchanged.
- Exit: at the three sizes, two rows of tiles show and every control is in the two rows; at 1280×720 the
  panel is as before.

## P2: Bigger controls, sized to the phone's width

zapa, 2026-11-16: "the control bar can be bigger on mobile, I had a wrong representation of screen resolution".
- Same two rows and order as P1, only bigger. Sizes follow the screen's width (measured at 393 px; smaller on
  narrower phones, at most 10 % bigger on wider ones), so the bottom row always fits:
  disc **60 px**, play **50 px**, previous / next **40 px**, thumbs **36 px**, Hide artist **26 px**, seek bar
  **40 px** tall, the SPEED post-it's text a size up.
- Two full rows of tiles still show at 360×780, 393×852 and 412×915.
- Exit: at the three sizes nothing in the panel overflows its width or clips, and two rows of tiles show.

## P3: Phone held sideways: no playlist

zapa, 2026-11-16: "on a PHONE the [TV layout sideways] would be too crowded so instead flipping phone horizontal
would only display the minimal buttons and seek bar"; "so no play list on MOBILE HORIZONTAL VIEW". This replaces
feat-taste-cache §T7's "sideways same as TV" for phones.
- A phone held sideways (a touch screen, landscape, at most **500 px** tall; in the browser and the app alike;
  never a TV or desktop): the picture fills the screen. The playlist is not shown; it is for holding the phone
  upright.
- The controls are the compact bar of §P1/§P2 (disc card, seek bar, previous / play / next, thumbs, SPEED), across
  the bottom over the picture. They fade after the usual 15 s without input and a touch brings them back.
- The mode chip (VIDEOS) and the now-playing caption are not shown sideways; the picture arrows are (§P13).
- Exit: at 852×393 and 915×412 (touch) no playlist shows, the bar fits the width, and it hides and returns; at
  393×852 the playlist is back; at 1280×720 (mouse) nothing changes.

## P4: Phone upright: playlist and controls in 40 % of the screen

zapa, 2026-11-16: "use only 1/3 of screen for the playlist and controls", then "it can be taller" (the whole
bottom part, not bigger buttons). On a phone held upright the bottom panel (playlist and the control bar) takes
**40 %** of the screen's height; the picture has the rest. This replaces §P1's "at least two full rows of tiles": the playlist shows what fits and scrolls.
- Exit: at 360×780, 393×852 and 412×915 the panel is 40 % of the height, the whole control bar shows and
  the playlist scrolls.

## P5: Phone upright and sideways get their own bar

zapa, 2026-11-16: "on portrait remove the time and replace with thumbs buttons"; "so we need to have two
separate setting[s]". Sideways keeps §P3 as it is (times either side of the seek bar; thumbs centred on the
bottom row). Upright:
- row 1: **thumbs up, the seek bar, thumbs down**; the times are not shown;
- row 2: **previous / play / next**, centred, then the speed note at the right end: a sticker in line with
  them, showing only the number (**×1**), not the word SPEED (zapa: "remove the speed label, just the x number";
  "just a sticker as it is, aligned with the play next buttons");
- the disc card with Hide artist stays on the left over both rows.
- Exit: at 360×780, 393×852 and 412×915 nothing in the bar overflows the panel; at 852×393 the sideways bar
  is unchanged.

## P6: The Android app is full screen

zapa, 2026-11-16: "the gesture handle hide it, two taps to exit"; then "top bar is still seen". In the Android
app the phone's status bar and gesture handle are both hidden, so neither sits over the app's top line or the
controls. A swipe from the top or bottom edge shows them for a moment; a second swipe up goes home, as Android
does for full-screen apps. They hide again when the app comes back to the front. The web app is unchanged.
- Exit: in the app, upright and sideways, no status bar or handle shows; one swipe shows them, a second leaves.

## P7: Playlist header on phones

zapa, 2026-11-16: "back to the board button make it same size as shuffle, the shuffle just the symbol here so
that title can be seen; make title a ticker if too big to display".
- On phones (up to 640 px wide): **Board** is the size of the Shuffle button; **Shuffle** shows only its icon
  (its name stays for screen readers and the tooltip).
- The title, everywhere: when it does not fit it slides leftward to its end (about 30 px a second), waits, and
  starts again from the front; it never runs back left to right (zapa). When it fits it stands still. With reduced motion it is cut short as before.
- Exit: at 393×852 a long title runs and a short one stands still; Board and Shuffle are the same height.

## P8: Smaller, square playlist tiles on phones

zapa, 2026-11-16: "the playlist cards make it a bit smaller, I'm trying to fit two rows in view; text can hide
partially the profile image"; then "the size was good, you made it rectangle, I want it more square".
- On phones (up to 640 px wide) the tiles are smaller and nearly square: **four across**, the picture **46 px**,
  and the title sits over the bottom of the picture on the tile's own colour.
- Exit: at 448×997 (zapa's Pixel 8 Pro) two full rows of tiles show and the tiles are about as wide as tall.

## P9: A short playlist takes less room

zapa, 2026-11-16: "if there's no two rows worth of playlist items, flex box it". On phones held upright, when the
playlist has four tiles or fewer (one row, four across), the bottom panel drops the empty second row and the
picture takes that room. The panel is as tall as that one row really is (tiles grow with the phone's text
size), so no tile is cut off. With five or more it is the full 40 % of §P4.
- Exit: at 448×997 with one to four tiles the panel is one row shorter; with five or more it is 40 %.

## P10: VIDEOS near the edge

zapa, 2026-11-16: "the videos button move it closer to the edge of screen". On phones the mode chip (VIDEOS) sits
**12 px** from the right edge of the picture, below the next-picture arrow.

## P11: Pictures fit the phone's screen

zapa, 2026-11-16: "handle the images better so it fits in the screen". On phones (upright or sideways) a picture
in the slideshow is shown whole, fitted to the picture area on black, so text in memes and screenshots is not cut
off. TV and desktop keep the full-bleed crop.

## P12: Back is back, not exit

zapa, 2026-11-16: "handle back swipe as the back button, not exit from the app". In the Android app the back
swipe (or button) goes back a page, like the browser's back; with nothing to go back to it goes to the board. On
the board it sends the app to the background, so the music keeps playing; it does not close the app.
- Exit: from the player, back returns to the board; on the board, back leaves the app with the music playing.

## P13: Picture arrows without the panel

zapa, 2026-11-16: "make the chevrons accessible without opening the playlist etc items"; then "the chevrons on
portrait are a bit annoying if always visible". On phones, touching a previous / next picture arrow changes the
picture without bringing the playlist and the bar back. Sideways the arrows stay on screen, dimmed, when the
controls fade; upright they fade with the controls but can still be tapped where they were (the picture's left
and right edges). A remote's keys and a mouse still bring them
back as before; TV and desktop are unchanged.
- Exit: on a phone with the controls faded, a tap on an arrow (or where it was, upright) changes the picture and
  the panel stays away.

## P14: The post ticker under the clock

zapa, 2026-11-16: "on mobile the post ticker move it below the time and madstr". On a phone held upright the top
line has two rows: the clock and Mad⚡tr.tv, then the post ticker across the full width under them. Both rows sit on
the one dark band, over the top of the picture (zapa: "keep the whole darker line for consistency"). Sideways,
TV and desktop keep one row.

## P15: No Hide artist sideways

zapa, 2026-11-16: "on landscape add a little 15px padding or similar so that pressing previous does not
'unfollow'"; then "actually better would be to remove the hide profile from [landscape]". Sideways, the Hide
artist sticker is not shown on the disc card, so a press on previous cannot hide the artist. Upright keeps it.

## P16: No hover tips on touch screens

zapa, 2026-11-16: "remove the tool tips or similar, the on hover effect". On touch screens a tap on a playlist tile
no longer shows the full-title tip or leaves the tile lifted. A remote's focus and a mouse keep both.

## P17: Board becomes Home

zapa, 2026-11-16: "route board become Home, make the H a svg house"; then "replace the arrow with the house, use
the H". The buttons that go back to the board show a small house (an SVG in the text's colour) where the back
arrow was, then the word **Home**. Screen readers hear "Home". The board's
route and its name in the code stay as they are.

## P18: Buttons are rounded rectangles

zapa, 2026-11-16: "make all buttons square or rectangular with rounded edges unless they are stickers"; then "the
player control buttons were supposed to stay round". Every button that was a pill is now a rectangle with rounded
corners (12 px): the chips, Open, Home, Shuffle, Log in / out, VIDEOS. The player's previous / play / next and the
thumbs stay round. Post-it stickers, tiles, avatars, the disc, the seek bar and hashtag labels keep their shapes.
(A palette rotation for the buttons was tried and withdrawn, 2026-11-16: zapa will name the colours.)
- The icons just fit their buttons (zapa: "the shuffle icon is too small for its button, same with the home svg"):
  on phones the shuffle icon is 24 px in its 36 px button and the house 22 px; elsewhere the house is 1.5× the text.

## P19: Make it yours: your sources get their own page

zapa, 2026-11-16: "we need a new button called set up or user area for the your sources, this will make it more
intuitive"; "one user area: shows what to follow, back to home button and next to it the sources button or user
settings"; "the your sources button and make it yours are the same"; "I would add a user emoji and the name make
it yours".
- The follow page (`#/people/follow`, behind Log in) has **Home** in its header and, next to it, **Make it yours**
  with a person icon. It opens Make it yours (`#/people/sources`): the feeds, folders, pictures, hashtags and
  hidden songs / artists that used to sit at the bottom of the board. That page has Home in its header.
- The board's People sticker (Follow more creators) hints at it (zapa: "the people card at home screen need to
  hint at user area as well, where it says one press"): its note says **make it yours** instead of "one press",
  its line "Follow creators, and make it yours: your feeds, folders and hashtags.", and the People lane's
  subtitle "who you follow + your sources".
- The board keeps only the stickers; it gets no new button. Texts that pointed to "Your sources on the home
  screen" point to Make it yours.
- Every page opened from the board (follow, Make it yours) starts at its top, not at the board's scroll position
  (zapa: "clicking this tab opens to the middle of follows instead of top page").
- Exit: on the follow page Make it yours opens every source control; Home goes back to the board.

## P20: Button colours, named by zapa

zapa, 2026-11-16: "home button teal, make it yours pink, log out purple"; then "don't add new colors, use the
previous palette to closest match, so log in would stay the same". From the existing palette: **Home** mint (the
green-teal, `--mint`), **Make it yours** pink (`--pinkp`); **Log in / Log out** stay lilac (`--lilac`, the
purple). The other buttons keep their colours until zapa names them.

## P21: Open signer

zapa, 2026-11-16: "where it says browser extension or no browser extension, it should instead say open signer, it
will trigger window.nostr or Amber directly, no need for relays, local signing"; the plugin for it is OK'd
("hazard is well trusted").
- The login's first button is **Open signer** everywhere. It uses, in this order, what the device has:
  1. `window.nostr` (a NIP-07 extension, or a signer app's own browser);
  2. in the Android app: the signer app on the phone (Amber or another NIP-55 signer), directly, with no relay
     (Applesauce `AndroidNativeSigner` + `capacitor-plugin-nostr-signer` 0.2.0, pinned);
  3. in a phone's browser or the PWA: NIP-55's web link (zapa: "a web app and ours, which has a PWA, can").
     The login leaves for Amber and comes back on a callback address with the public key (no relay, no
     clipboard), on the page it left. Later signatures (follow, like) come back on the clipboard (Applesauce
     `AmberClipboardSigner`), so the page does not reload for each one (zapa: "playback is not an issue since
     it's just a login action").
- With none of these (a desktop with no extension) the button is shown greyed out as **No signer found**; the QR
  code and the bunker link still work.
- The login is remembered like the others: the signer app's package and your public key (no secret) are kept on
  the device and the next start uses the same signer. Log out forgets them.
- Exit: in the app, Open signer opens Amber, and after approving you are logged in; a follow is signed by Amber
  without any relay round trip for signing.

## P22: No seek bar on the board's bar

zapa, 2026-11-16: "this is when at rest or home while something is playing, remove the seek bar from this view".
The slim player bar along the bottom of the board and the plain pages (the Dock) shows previous / play / next,
the title and its status line, and no seek bar, whether something is queued or not, on every screen. Seeking is
in the player's own panel.

## P23: The profile picture is not see-through

zapa, 2026-11-16: "the size and placement of profile image in landscape is good, although profile should not have
any transparency; I edited it manually to try and hide the planet". When logged in, your profile picture in the
top corner is fully opaque on every screen. The orange planet stays behind it at exactly its size, so its halo
glows around the picture with no rim showing (zapa: "the planet needs to match profile image so that its orange
halo effect stays"). The picture is **oversized on purpose** (zapa: "the oversized was intended"): a **400 px**
circle from the planet's corner (14 % in), on every screen. It used to get that size by accident (an image keeps
its file's pixel size), so it is now set outright, and the planet behind it is the same 400 px circle. Its orange halo is
bigger and brighter than the plain planet's (zapa: "make the glow bigger and a bit more noticeable"): 200 px blur,
45 px spread, the orange at 45 % (was 140 px, 20 px, 25 %). Logged out, the plain planet keeps its dimmed look (on phones 40 %). On a phone
held upright it sits **40 px lower and 40 px further left** than before (zapa: "down and left about 40 px"):
top −10 px, right −70 px, 300 px wide; held sideways the same 40 px (zapa: "do for both"): top −140 px,
right −40 px. TV and desktop keep their place.

## P24: Jukestr 3000: the player's look

zapa, 2026-11-16, choosing from the "Player Bezels" mock-ups: "I really like the Jukestr 3000, specially the toy
racer rainbow slider, the childish bezel, but I prefer the buttons from Jukestr 1 as they are less glossy, more
natural looking; let's apply keeping the constraints of our app and sizes".
- **Bezel** (the player panel, every screen): an orange plastic frame (6 px, light to dark orange) in a black
  outline with a hard black shadow, around a purple window with a soft shine at the top; corners 28 px. On phones
  the frame takes the room of the panel's padding, so the bar keeps its size.
- **Buttons** (previous / play / next, the thumbs, the board's bar too): still round, now domed and matte, lit from
  the top left: lilac for previous / next, butter for play, mint for thumbs up, pink for thumbs down, butter when
  voted. They sink when pressed.
- **Seek bar** (the player's): candy stripes (pink, butter, mint, sky) up to where the song is, lilac after; the
  knob is a small orange planet.
- Layout, sizes and the post-it stickers are unchanged. The name itself is not changed by this.

## P25: The player's feel everywhere

zapa, 2026-11-16: "we gotta apply uniformly throughout, even on home view, keeping the buttons as we worked
through it today but just adding the uniform feel of the player".
- The board's bar (the Dock) and the playlist panel wear the player's bezel (§P24): orange plastic frame, black
  outline, hard shadow, purple window. The Dock sits 8 px in from the sides and 2 px above the bottom, framed like the player, with
  28 px corners on top and 12 px at the bottom (zapa: "the player needs to come lower a tad and be less rounded on
  the bottom").
- Every other button keeps its shape and colour from today (rounded rectangles; Home mint, Make it yours pink,
  Log in lilac, the mint add buttons) and gets the player buttons' feel: a domed, matte light from the top, the
  same drop-under shadow, sinking when pressed. Disabled buttons stay flat and dashed; stickers, tiles and the
  creator chips keep their own look.

## P26: One machine on the player screen

zapa, 2026-11-16: "tie them together on the views where they connect so it feels like a single component". On the
player screen the playlist and the player share ONE bezel: the bottom area is the orange plastic body (black
outline, hard shadow, 6 px in from the screen's edges), and the two panels are purple windows set into it,
divided by a 5–6 px strip of the same plastic. Like every bezel its corners are tighter at the bottom (zapa: "the
bottom less round throughout"): the body 28 px on top and 12 px at the bottom, the windows 22 px and 8 px. On phones the player screen's body
and the board's bar run off the screen's sides (4 px) and bottom (16 px), so the plastic fills to the edges
(zapa: "needs to be overflowing out of screen to fill the areas on the phone"); their padding keeps the controls
where they were. Upright they stack, on TV / desktop they sit side by side, sideways
the player is alone in it. The board's bar keeps its own bezel.

## P27: A Saturn on the seek bar

zapa, 2026-11-16: "the seek bar, can you make a Jetsons-looking thing like you did on the artifact". The player's
seek knob is a little ringed Saturn, as on the toy ray-gun mock-up: an orange planet with a cream ring outlined in
black, 40 × 28 px, its shadow under it. The candy stripes end at its centre.


## P28: The name is Juke⚡tr, and the web app moves to pleb.world/jukestr

zapa, 2026-11-16: the app is called **JUKESTR** (spelled with an E), and "keep the lightning for the s": it is written
**Juke⚡tr**, the bolt standing in for the S as it did in Mad⚡tr.tv. The ".tv" goes. Where the bolt does not fit (the
home screen's short name, the logo's label for screen readers) it is **Jukestr**.
- Everywhere the name shows: the header logo, the brand in the player's top line, the page title and preview,
  the install name (web and Android), the name shown when a signer is asked to connect, and the zapstore listing.
- zapa: "update our plebworld to serve the pleb.world/jukestr instead of madstr". The web app is built under
  `/jukestr/` and copied into pleb.world's `public/jukestr/`; pleb.world's sticker says Juke⚡tr and opens
  `/jukestr/`. The RSS proxy stays at `/api/rss`. zapa: "i assume no one is using it yet", so `/madstr/` is
  removed, with no redirect.
- Unchanged, so nobody loses anything: the Android app id (`com.madstr.tvapp`, so 1.x updates install over it), and
  every saved setting and login on the device (their keys keep the `madstr` prefix). The web app's offline cache
  is renamed `jukestr-…` and clears the old `madstr-…` ones.
