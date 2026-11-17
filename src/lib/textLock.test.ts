import test from 'node:test';
import assert from 'node:assert/strict';
import { lockAct } from './textLock.ts';

test('focus by the remote locks a text box; a tap or click does not', () => {
  assert.equal(lockAct({ kind: 'focus', byPointer: false }), 'lock');
  assert.equal(lockAct({ kind: 'focus', byPointer: true }), 'none');
});

test('OK on a locked box opens it; the arrows and Back leave it locked', () => {
  assert.equal(lockAct({ kind: 'key', key: 'Enter', locked: true }), 'open');
  for (const key of ['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Escape', 'Tab', 'ChannelUp']) {
    assert.equal(lockAct({ kind: 'key', key, locked: true }), 'none', key);
  }
});

test('typing on a computer keyboard opens a locked box and keeps the key', () => {
  for (const key of ['a', 'Z', '#', ' ', 'Backspace', 'Delete']) assert.equal(lockAct({ kind: 'key', key, locked: true }), 'unlock', key);
});

test('Enter in an open box does its job, then the box locks again', () => {
  assert.equal(lockAct({ kind: 'key', key: 'Enter', locked: false }), 'relock-after');
  assert.equal(lockAct({ kind: 'key', key: 'a', locked: false }), 'none');
  assert.equal(lockAct({ kind: 'key', key: 'ArrowDown', locked: false }), 'none');
});

test('a tap or click on a locked box opens it', () => {
  assert.equal(lockAct({ kind: 'pointer' }), 'unlock');
});
