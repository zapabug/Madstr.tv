import { setLava, useLava } from '../lib/lavaSettings.ts';

// The two lava-lamp switches (spec feat-lava-lamp LL5): turn the backdrop off when a device struggles, and pick
// between the focused beat sprays and the smoky, blurred look.
export function LavaControls() {
  const lava = useLava();
  return (
    <section className="own" aria-label="Background animation">
      <h2>Background</h2>
      <p className="own-note">The lamp that drifts behind your pictures in the viewer.</p>
      <div className="mix" role="group" aria-label="Background animation settings">
        <button type="button" className="chip-btn" data-nav aria-pressed={lava.on} onClick={() => setLava({ on: !lava.on })}>
          {lava.on ? '\u2713 ' : ''}Background animation
        </button>
        <div className={`mix-row${lava.on ? '' : ' off'}`} role="group" aria-label="Spray style">
          <button type="button" className="chip-btn" data-nav aria-pressed={lava.style === 'focused'} disabled={!lava.on}
            onClick={() => setLava({ style: 'focused' })}>Focused spray</button>
          <button type="button" className="chip-btn" data-nav aria-pressed={lava.style === 'smoky'} disabled={!lava.on}
            onClick={() => setLava({ style: 'smoky' })}>Smoky</button>
        </div>
        <p className="own-note">
          {lava.on ? lava.style === 'focused'
            ? 'One sharp spray on every beat, with the sticker look.'
            : 'Soft smoke in every direction, drifting with the sound.'
            : 'Off: the picture sits on the plain black stage.'}
        </p>
      </div>
    </section>
  );
}
