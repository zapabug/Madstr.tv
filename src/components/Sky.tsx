// The deep-space backdrop from pleb.world: two drifting star layers and a planet
// with an orbit ring. Decorative only.
export function Sky() {
  return (
    <>
      <div className="sky" aria-hidden="true">
        <div className="stars s1" />
        <div className="stars s2" />
      </div>
      <div className="planet" aria-hidden="true">
        <div className="ball" />
        <div className="ring" />
      </div>
    </>
  );
}
