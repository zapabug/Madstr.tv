// Is every relay the app uses alive and answering? Opens each one, asks for 5 notes, and reports the time to
// connect, the time to the end-of-stored-events marker, how many notes came back, and whether the relay asked
// for NIP-42 auth first (such a relay silently ignores requests from an app that does not log in to it).
// Run:  pnpm relays
import { CONTENT_RELAYS, LOOKUP_RELAYS, SIGNER_RELAYS } from '../src/lib/relays.ts';

const TIMEOUT_MS = 8000;
const roles = new Map();
for (const [role, list] of [['content', CONTENT_RELAYS], ['lookup', LOOKUP_RELAYS], ['signer', SIGNER_RELAYS]]) {
  for (const url of list) roles.set(url, [...(roles.get(url) ?? []), role]);
}

function probe(url) {
  return new Promise(resolve => {
    const t0 = Date.now();
    const r = { url, open: null, eose: null, events: 0, auth: false, note: '' };
    let finished = false;
    let ws;
    const finish = () => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      try { ws.close(); } catch { /* already closed */ }
      resolve(r);
    };
    const timer = setTimeout(() => { r.note ||= `no answer in ${TIMEOUT_MS / 1000}s`; finish(); }, TIMEOUT_MS);
    try { ws = new WebSocket(url); } catch (e) { r.note = String(e); finish(); return; }
    ws.onopen = () => { r.open = Date.now() - t0; ws.send(JSON.stringify(['REQ', 'probe', { kinds: [1], limit: 5 }])); };
    ws.onerror = () => { r.note ||= 'could not connect'; finish(); };
    ws.onmessage = event => {
      let m; try { m = JSON.parse(event.data); } catch { return; }
      if (m[0] === 'AUTH') r.auth = true;
      if (m[0] === 'EVENT') r.events += 1;
      if (m[0] === 'EOSE') { r.eose = Date.now() - t0; finish(); }
      if (m[0] === 'CLOSED') { r.note = `closed: ${m[2]}`; finish(); }
    };
  });
}

const results = await Promise.all([...roles.keys()].map(probe));
let bad = 0;
for (const r of results) {
  const healthy = r.eose !== null && !r.auth;
  if (!healthy) bad += 1;
  const open = r.open === null ? '-' : `${r.open} ms`;
  const eose = r.eose === null ? '-' : `${r.eose} ms`;
  console.log(`${healthy ? 'ok ' : 'BAD'} ${r.url.padEnd(28)} ${roles.get(r.url).join('+').padEnd(16)} open ${open.padStart(7)}  answered ${eose.padStart(7)}  notes ${r.events}  ${r.auth ? 'AUTH required  ' : ''}${r.note}`);
}
console.log(bad === 0 ? '\nAll relays answered.' : `\n${bad} relay(s) need attention: take them out of src/lib/relays.ts.`);
