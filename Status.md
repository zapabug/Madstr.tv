# Status
project: Juke⚡tr (repo Madstr.tv)
repo: /home/jester/Projects/Madstr.tv
owner: zapa
last-worked: 2026-11-22

## Where to look
- build.md: what was built per milestone, with commits and known gaps
- planning.md: locked decisions, why, undiscussed decisions waiting for review
- feat-*.md: the spec of the feat being built; finished specs are in archive/ (feat-applesauce-revamp is the base; docs/ holds notes from the old NDK app)
- CHANGELOG.md: the release notes zapstore shows
- AGENTS.md: rules and verify commands

## Report
Feat: Two lava lamp looks and an off switch
State: Live on pleb.world/jukestr and published as Android 1.8 on zapstore (2026-11-22; zapstore showed it as pending at first), not yet confirmed by zapa. Make it yours now has a Background card: an On/Off switch for the whole lamp (for lag) and a Focused spray / Smoky choice. Focused is the old sharp sticker spray; Smoky is the new soft, toned-down version, which is the default. Turning it off removes the canvas and stops the audio tap. The drifting stars/lights behind the other menus are gone too; the corner planet stays. A Make it yours chip now sits beside Log in/out on the home header. The orange frame at the bottom now runs off the screen's edges on big screens too, so no black gaps show around it. Needs zapa to try both lamp looks and say which should be the default.
────────────────────────────────────────
Feat: Lava lamp behind the viewer's pictures
State: Live on pleb.world/jukestr and published as Android 1.7 on zapstore (2026-11-18; zapstore showed it as pending at first). zapa confirmed it working on the dev server. The lamp runs on every device the app runs on, TV included — not TV-only. It sits behind the slideshow, never behind a video, and turns off with reduced motion. A device without WebGL2 float textures (zapa's Vestel TV) shows black, as before. Needs zapa to try 1.7 on his phone (the lamp beside a picture, radio making it spray, a Wavlake song still playing, background play). 5 choices made in code wait for his review in planning.md.
────────────────────────────────────────
Feat: TV remote and TV layout
State: Done and confirmed by zapa on his TV ("all work"), shipped as Android 1.6 on zapstore and on pleb.world/jukestr: focus never gets lost, the playlist reaches Play/Pause in one press, holding OK brings up a pointer, the remote's prev/next and channel keys work, text boxes wait for OK, Back asks before leaving, a TV layout at 1280 wide, and a big QR code to log in. 26 choices made in code still wait for zapa's review in planning.md.
────────────────────────────────────────
Feat: The name Juke⚡tr, the logo and "Your Nostr Jukebox"
State: Live on pleb.world/jukestr and published as Android 1.5 on zapstore (2026-11-17; zapstore showed it as pending at first). The logo is on every app icon, the start screen, the notification and the Android TV banner; the Play button is the logo, oversized, and while something plays it shows the bolt alone; the S of Juke⚡tr is the brand mark; the home screen says "Your Nostr Jukebox". Needs zapa to install 1.5 on his phone and TV and say it works.
────────────────────────────────────────
Feat: Radio, Nostr first
State: Live on pleb.world/jukestr and in Android 1.5. Radio opens empty and plays nothing until you turn on genres (any word, like bitcoin) and countries, one, many or all; it loads at most 300 stations and plays them 30 at a time, shuffle staying within those; live shows from zap.stream join when tagged with a word. Up saves a station, down hides it. Needs zapa to try it, to check it plays in the Android app, and to talk about how the sticker strip should sit in the bezel.
────────────────────────────────────────
Feat: Podcasts from Nostr reaching further back
State: Live on the web and in Android 1.5. Older posts now get their length measured, the music the list leaves out counts toward fetching older posts, and under 30 episodes the app keeps reaching back. Needs zapa to open Podcasts logged in and say whether the old episodes show up.
────────────────────────────────────────
Feat: Phone layouts, Open signer, Make it yours, the Jukestr 3000 look
State: Built and shaped with zapa on his phone, live on pleb.world/jukestr and in Android 1.5. Phones get their own upright and sideways layouts, the app is full screen with a back swipe that goes back, Amber logs in from the app and the web, your sources have their own page, and the playlist and player are one orange toy machine.
────────────────────────────────────────
Feat: RSS
State: Built and live. Feeds are read by the app's own small XML reader (the same episodes as the browser on six real feeds, safe against hostile ones), with tests for it and for the feed proxy's guard. Needs zapa to add a feed or two and say they play.
────────────────────────────────────────
Feat: Web app on pleb.world/jukestr
State: Live with its RSS proxy; the old pleb.world/madstr address is gone. Needs zapa to delete the old madstr-tv project in the Vercel dashboard.
────────────────────────────────────────
Feat: Android app on zapstore (1.0 to 1.7)
State: Published under zapa; 1.5 is the first named Juke⚡tr, 1.6 the TV remote, 1.7 the lava lamp. zapa confirmed background play (1.1) and the TV remote (1.6, "all work"). Lock-screen controls, remembered folders and the sideways view are not yet confirmed on a device. Needs zapa to back up the release signing key.
────────────────────────────────────────
Feat: Votes, hiding, the device cache, double tap to seek, played items hidden, shuffle, the remote pass, the Applesauce base
State: Built, machine-verified and live; none confirmed by zapa yet. A list of choices made in code is waiting for his review in planning.md.
