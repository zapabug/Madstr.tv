import test from 'node:test';
import assert from 'node:assert/strict';
import { folderPickerUsable, isNativeApp } from './platform.ts';

const picker = { showDirectoryPicker: () => Promise.resolve() };
const app = { isNativePlatform: () => true };
const webCap = { isNativePlatform: () => false };

test('isNativeApp: only when Capacitor says native', () => {
  assert.equal(isNativeApp({ Capacitor: app }), true);
  assert.equal(isNativeApp({ Capacitor: webCap }), false);
  assert.equal(isNativeApp({}), false);
  assert.equal(isNativeApp(undefined), false);
  assert.equal(isNativeApp({ Capacitor: { isNativePlatform: () => { throw new Error('x'); } } }), false);
});

test('folderPickerUsable: web browsers with the picker get it', () => {
  assert.equal(folderPickerUsable(picker), true);
  assert.equal(folderPickerUsable({ ...picker, Capacitor: webCap }), true);
});

test('folderPickerUsable: never in the Android app, even when its WebView has the picker', () => {
  assert.equal(folderPickerUsable({ ...picker, Capacitor: app }), false);
});

test('folderPickerUsable: browsers without the picker fall back to files', () => {
  assert.equal(folderPickerUsable({}), false);
  assert.equal(folderPickerUsable(undefined), false);
});
