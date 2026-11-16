import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleRssRequest, isPrivateAddress } from './rssProxy.ts';

// No internet needed: every case is refused before or at the address check.

test('private, loopback, link-local, carrier-grade NAT, multicast and mapped addresses are refused', () => {
  for (const ip of ['0.0.0.0', '10.1.2.3', '127.0.0.1', '100.64.0.1', '100.127.255.255', '169.254.169.254', '172.16.0.1',
    '172.31.255.255', '192.168.1.1', '224.0.0.1', '255.255.255.255', '::', '::1', 'fe80::1', 'FEBF::1', 'fc00::1', 'fd12::1',
    '::ffff:127.0.0.1', '::ffff:10.0.0.1', '::ffff:7f00:1']) {
    assert.equal(isPrivateAddress(ip), true, ip);
  }
});

test('public addresses pass', () => {
  for (const ip of ['1.1.1.1', '8.8.8.8', '100.63.255.255', '100.128.0.1', '172.15.0.1', '172.32.0.1', '192.169.0.1',
    '2606:4700:4700::1111', '::ffff:1.1.1.1']) {
    assert.equal(isPrivateAddress(ip), false, ip);
  }
});

test('the proxy refuses a missing URL, other schemes and private targets, labelled as plain text', async () => {
  const cases: Array<[string | null, number]> = [
    [null, 400],
    ['not a url', 400],
    ['file:///etc/passwd', 400],
    ['ftp://example.com/feed', 400],
    ['http://127.0.0.1/', 403],
    ['http://[::1]:8080/', 403],
    ['http://169.254.169.254/latest/meta-data/', 403],
    ['http://localhost/', 403], // a name that resolves to loopback
  ];
  for (const [url, status] of cases) {
    const res = await handleRssRequest(url);
    assert.equal(res.status, status, String(url));
    assert.equal(res.headers['content-type'], 'text/plain; charset=utf-8');
    assert.equal(res.headers['x-content-type-options'], 'nosniff');
    assert.equal(res.headers['content-security-policy'], 'sandbox');
  }
});
