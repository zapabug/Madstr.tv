import { useEffect, useRef, useState } from 'react';
import QRCode from 'react-qr-code';
import { startQrLogin, type QrLogin } from '../lib/accounts.ts';
import { onBack } from '../lib/backStack.ts';
import { qrPopup, useQrPopup } from '../lib/qrPopup.ts';

// Log in with a QR pop-up on a TV (spec feat-tv-remote TV6): the whole QR, as large as fits, to scan from the
// couch with a signer app. Close is focused first; Back or Esc closes; it closes by itself once the signer answers.
// The same login the People card offers (startQrLogin, Nostr Connect); nothing new is sent.
export function QrLoginPopup() {
  const shown = useQrPopup();
  return shown ? <QrLoginBody /> : null;
}

function QrLoginBody() {
  const [login, setLogin] = useState<QrLogin | null>(null);
  const [error, setError] = useState<string | null>(null);
  const close = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const before = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const started = startQrLogin();
    setLogin(started);
    let live = true;
    started.connected.then(() => { if (live) qrPopup.close(); }).catch(e => { if (live) setError(e instanceof Error ? e.message : 'Could not log in'); });
    const done = onBack(qrPopup.close);
    close.current?.focus();
    return () => {
      live = false;
      done();
      started.cancel();
      if (before?.isConnected) before.focus();
    };
  }, []);

  return (
    <div className="qr-pop-back">
      <div className="qr-pop" role="dialog" aria-modal="true" aria-label="Log in with a QR code" data-nav-modal
        onKeyDown={e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); qrPopup.close(); } }}>
        <div className="qr-pop-code">{login && <QRCode value={login.uri} size={512} level="M" style={{ width: '100%', height: '100%' }} />}</div>
        <div className="qr-pop-side">
          <h2>Log in</h2>
          <p>Scan this with your signer app (Amber or another NIP-46 signer) to log in on this TV.</p>
          {error ? <p className="own-status bad" role="alert">{error}</p> : <p className="qr-pop-wait">Waiting for it to answer…</p>}
          <button type="button" className="chip-btn solid" ref={close} data-nav data-nav-start="1" onClick={qrPopup.close}>Close</button>
        </div>
      </div>
    </div>
  );
}
