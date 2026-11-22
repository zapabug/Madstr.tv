import { HiddenControls } from './HiddenControls.tsx';
import { LavaControls } from './LavaControls.tsx';
import { OwnControls } from './OwnControls.tsx';
import { TagControls } from './TagControls.tsx';

// Make it yours: your sources (feat-phone-inline §P19; they used to sit at the bottom of the board):
// where the stickers get their music, podcasts, videos and pictures besides the people you follow.
export function SourcesView() {
  return (
    <section className="sources" aria-label="Your sources">
      <p className="sub">
        Where the stickers get their music, podcasts, videos and pictures,
        besides the people you follow.
      </p>
      <div className="sources-grid">
        <OwnControls kind="feeds" />
        <OwnControls kind="folders" />
        <OwnControls kind="pictures" />
        <TagControls kind="audio" />
        <TagControls kind="video" />
        <TagControls kind="image" />
        <HiddenControls />
        <LavaControls />
      </div>
    </section>
  );
}
