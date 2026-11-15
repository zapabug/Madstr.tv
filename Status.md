# Status
project: Mad⚡tr.tv
repo: /home/jester/Projects/Madstr.tv
owner: zapa
last-worked: 2026-11-15

## Where to look
- build.md: what was built per milestone, with commits and known gaps
- planning.md: locked decisions, why, undiscussed decisions waiting for review
- feat-applesauce-revamp.md: the spec (docs/ holds notes from the old NDK app)
- AGENTS.md: rules and verify commands

## Report
Feat: Android app 1.2: lock-screen and notification controls, remembered folders, local music in Music, music 2 to 9 minutes
State: Built and signed as 1.2, not published yet and not run on a phone or TV. The web app gets the browser's media controls, the music mix slider and the 2-minute rule too. Needs zapa to install 1.2 and try the controls (lock screen, headphones, TV remote) and adding a folder, then closing and reopening the app.
────────────────────────────────────────
Feat: Installable web app and Android app on zapstore
State: Live. The web app installs and opens offline, and Mad⚡tr.tv 1.0 for Android phones and TV is published on zapstore under zapa. Needs zapa to install it from zapstore on a phone or TV and say it works, and to back up the release signing key.
────────────────────────────────────────
Feat: Android app: picking files and playing in the background (1.1)
State: Published. zapa confirmed music keeps playing in the background; file picking was replaced by remembered folders in 1.2.
────────────────────────────────────────
Feat: Deploy
State: Live at madstr-tv.vercel.app, built by Vercel from main on GitHub (pushes deploy). The RSS feed proxy works there, and pleb.world links to it with a sticker.
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
State: Incoming. The feed parser and proxy exist from the earlier own-audio work; tests come with the new RSS work.
────────────────────────────────────────
Feat: Remote pass (final stage before deploy)
State: Built and machine-verified: every control on the board, People and the viewer is reachable with arrow keys alone. Needs zapa to try it with a keyboard or remote before deploy.
