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
Feat: Installable web app and Android app on zapstore
State: The service worker and app manifest are built and machine-verified on a feat branch: the web app installs and opens offline. The Android app and the zapstore release are next; publishing needs zapa to approve the signature through his bunker.
────────────────────────────────────────
Feat: Deploy
State: Live at madstr-tv.vercel.app, built by Vercel from main on GitHub (pushes deploy). The RSS feed proxy works there, and pleb.world links to it with a sticker. The Android app and a zapstore release are not built; they need a spec first.
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
────────────────────────────────────────
Feat: TV (Android) build
State: Not built; parked.
