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
