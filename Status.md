# Status
project: Juke⚡tr (repo Madstr.tv)
repo: /home/jester/Projects/Madstr.tv
owner: zapa
last-worked: 2026-11-17

## Where to look
- build.md: what was built per milestone, with commits and known gaps
- planning.md: locked decisions, why, undiscussed decisions waiting for review
- feat-*.md: the specs (feat-applesauce-revamp is the base; docs/ holds notes from the old NDK app)
- CHANGELOG.md: the release notes zapstore shows
- AGENTS.md: rules and verify commands

## Report
Feat: The name Juke⚡tr, the logo and "Your Nostr Jukebox"
State: Built and merged, not yet deployed or released. The logo is on every app icon, the start screen and the notification; the Play button is the logo, oversized, and while something plays it shows the bolt alone; the S of Juke⚡tr is the logo's bolt; the home screen says "Your Nostr Jukebox". The readme and the zapstore notes describe the app as it is now. Needs zapa to say when to deploy the web app and release Android 1.5.
────────────────────────────────────────
Feat: Radio, Nostr first
State: Built; its first form is live on pleb.world/jukestr, the reworked one is merged but not deployed. Radio opens empty and plays nothing until you turn on genres (any word, like bitcoin) and countries, one, many or all; it loads at most 300 stations and plays them 30 at a time, shuffle staying within those; live shows from zap.stream join when tagged with a word. Up saves a station, down hides it. Needs zapa to try it, to check it plays in the Android app, and to talk about how the sticker strip should sit in the bezel.
────────────────────────────────────────
Feat: Podcasts from Nostr reaching further back
State: Built and merged, not deployed. Older posts now get their length measured, the music the list leaves out counts toward fetching older posts, and under 30 episodes the app keeps reaching back. Needs zapa to open Podcasts logged in and say whether the old episodes show up.
────────────────────────────────────────
Feat: Phone layouts, Open signer, Make it yours, the Jukestr 3000 look
State: Built and shaped with zapa on his phone, live on pleb.world/jukestr, not yet in an Android release. Phones get their own upright and sideways layouts, the app is full screen with a back swipe that goes back, Amber logs in from the app and the web, your sources have their own page, and the playlist and player are one orange toy machine.
────────────────────────────────────────
Feat: RSS
State: Built and live. Feeds are read by the app's own small XML reader (the same episodes as the browser on six real feeds, safe against hostile ones), with tests for it and for the feed proxy's guard. Needs zapa to add a feed or two and say they play.
────────────────────────────────────────
Feat: Web app on pleb.world/jukestr
State: Live with its RSS proxy; the old pleb.world/madstr address is gone. Needs zapa to delete the old madstr-tv project in the Vercel dashboard.
────────────────────────────────────────
Feat: Android app on zapstore (1.0 to 1.4)
State: Published under zapa, still named Mad⚡tr.tv until 1.5. zapa confirmed background play (1.1). Lock-screen controls, remembered folders and the sideways view are not yet confirmed on a device. Needs zapa to back up the release signing key.
────────────────────────────────────────
Feat: Votes, hiding, the device cache, double tap to seek, played items hidden, shuffle, the remote pass, the Applesauce base
State: Built, machine-verified and live; none confirmed by zapa yet. A list of choices made in code is waiting for his review in planning.md.
