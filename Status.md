# Status
project: Mad⚡tr.tv
repo: /home/jester/Projects/Madstr.tv
owner: zapa
last-worked: 2026-11-16

## Where to look
- build.md: what was built per milestone, with commits and known gaps
- planning.md: locked decisions, why, undiscussed decisions waiting for review
- feat-applesauce-revamp.md: the spec (docs/ holds notes from the old NDK app)
- AGENTS.md: rules and verify commands

## Report
Feat: Phone layouts, Open signer, Make it yours, the Jukestr 3000 look, and the new name Juke⚡tr
State: Built and shaped with zapa on his phone, step by step; committed on the phone-inline branch, not merged, released or deployed yet. The app is now called Juke⚡tr everywhere (the bolt stays for the S), and pleb.world is ready to serve it at pleb.world/jukestr with the old madstr address removed, waiting for zapa's go to put it live. Phones get their own upright and sideways layouts, the Android app is full screen with a back swipe that goes back, logging in with Amber works directly in the app and from the web, your sources have their own Make it yours page, and the player, playlist and board bar wear the orange toy bezel with domed buttons and a rainbow seek bar. Next is the logo, then a release. Needs zapa to say whether the board's headline "Mad Player Media" changes too.
────────────────────────────────────────
Feat: Phone controls in two compact rows; sideways shows the TV layout
State: Live on pleb.world/madstr and in Android 1.4 on zapstore. Being replaced by the phone layouts above.
────────────────────────────────────────
Feat: Radio, Nostr first
State: Being built (zapa gave the go and accepted hls.js on 2026-11-16). Stations come from Nostr (more than 11,000 radio station posts on the WaveFunc relay, about 7,000 playable on the web), found by genre stickers and country, with the stations of people you follow first; up saves, down hides; the picture show plays behind. Needs zapa's go on the spec.
────────────────────────────────────────
Feat: Web app moves to pleb.world/madstr, Android 1.3
State: Live. The web app (the TV and desktop version) is at www.pleb.world/madstr with its RSS proxy, and the pleb.world sticker links there; Android 1.3 with everything below is published on zapstore. Needs zapa to delete the old madstr-tv project in the Vercel dashboard, to install 1.3 and try the sideways view on a phone, and to say whether to push this repo to GitHub.
────────────────────────────────────────
Feat: Bigger faces, up and down votes, hiding artists, music and videos kept on the device, double tap to seek, phone turned sideways
State: Built, checked in a browser and merged; live on pleb.world/madstr and in Android 1.3. The media controls follow zapa's layout (a now-playing card that swaps like a record as the song moves out of the playlist, thumbs either side, Hide artist and SPEED post-its, full-width seek); a down vote hides the song; double tap on the picture seeks; in the Android app, a phone held sideways shows the full picture with only the transport and seek bar. Needs zapa to try it on the live site and the app and confirm each part.
────────────────────────────────────────
Feat: Android app 1.2: lock-screen and notification controls, remembered folders, local music in Music, music 2 to 9 minutes
State: Published on zapstore as 1.2, not yet run on a phone or TV. The web app gets the browser's media controls, the music mix slider and the 2-minute rule too. Needs zapa to install 1.2 and try the controls (lock screen, headphones, TV remote) and adding a folder, then closing and reopening the app.
────────────────────────────────────────
Feat: Installable web app and Android app on zapstore
State: Live. The web app installs and opens offline, and Mad⚡tr.tv 1.0 for Android phones and TV is published on zapstore under zapa. Needs zapa to install it from zapstore on a phone or TV and say it works, and to back up the release signing key.
────────────────────────────────────────
Feat: Android app: picking files and playing in the background (1.1)
State: Published. zapa confirmed music keeps playing in the background; file picking was replaced by remembered folders in 1.2.
────────────────────────────────────────
Feat: Deploy
State: Replaced by the pleb.world move below. The old Vercel project madstr-tv no longer runs the feed proxy and waits for zapa to delete it.
────────────────────────────────────────
Feat: Applesauce revamp: board, viewer, player, listen, watch, people, pictures, local media
State: Built and merged into main and passing tests, lint and build. Ticked in the spec, but no confirmation from zapa is recorded yet. The sticker previews now follow the spec, and a list of choices made in code, including a 40-character limit on names, is waiting for zapa's review.
────────────────────────────────────────
Feat: Header Log out button, no "Logged in" box, board without hero note and filter chips, npub names
State: Built, machine-verified and committed; needs zapa to check it, logged in and out.
────────────────────────────────────────
Feat: Shuffle in the media picker, and video sound that keeps playing off the viewer
State: Built, machine-verified against real relays and committed; needs zapa to try both.
────────────────────────────────────────
Feat: Played items hidden per session, and pictures that repeat far less
State: Built, machine-verified against real relays and committed; needs zapa to use it for a while and say if the numbers (2000 pictures, a batch every 20 s) feel right.
────────────────────────────────────────
Feat: RSS
State: Built and machine-verified. Feeds are now read by the app's own small XML reader, which gives the same episodes as the browser did on six real feeds and cannot be blown up by a hostile feed; the reader and the feed proxy's guard against private addresses have tests. Needs zapa to add a feed or two and say they play.
────────────────────────────────────────
Feat: Remote pass (final stage before deploy)
State: Built and machine-verified: every control on the board, People and the viewer is reachable with arrow keys alone. Needs zapa to try it with a keyboard or remote before deploy.
