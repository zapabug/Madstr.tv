import { test } from 'node:test';
import assert from 'node:assert/strict';
import { descendants, firstDescendant, parseXml, textOf, XmlError } from './xmlLite.ts';

test('elements, attributes, text, CDATA, comments and the five entities', () => {
  const root = parseXml('\uFEFF<?xml version="1.0"?><!-- hi --><a x="1 &amp; 2" y=\'q\'>t<b/>&lt;u&gt;<![CDATA[<c>]]><n:d>&#x1F3B5;&#9835;</n:d></a>');
  assert.equal(root.name, 'a');
  assert.deepEqual(root.attrs, { x: '1 & 2', y: 'q' });
  assert.equal(textOf(root), 't<u><c>🎵♫');
  assert.equal(firstDescendant(root, 'n:d')?.name, 'n:d');
  assert.equal(firstDescendant(root, 'd'), undefined); // names match as written
});

test('descendants come in document order, nested ones included', () => {
  const root = parseXml('<r><i n="1"><i n="2"/></i><x><i n="3"/></x></r>');
  assert.deepEqual(descendants(root, 'i').map(e => e.attrs.n), ['1', '2', '3']);
});

test('unknown and out-of-range references are left as they are', () => {
  assert.equal(textOf(parseXml('<a>&nbsp;&#0;&#xD800;&#99999999;</a>')), '&nbsp;&#0;&#xD800;&#99999999;');
});

test('broken documents are errors', () => {
  for (const bad of ['', 'text', '<a>', '<a></b>', '<a><b></a></b>', '<a/><b/>', '<a x=1/>', '<a><!-- x</a>', '<a><![CDATA[x</a>', '<a></a><!DOCTYPE a>']) {
    assert.throws(() => parseXml(bad), XmlError, bad);
  }
});

test('nesting is capped and deep documents do not overflow the stack', () => {
  assert.throws(() => parseXml('<a>'.repeat(300) + '</a>'.repeat(300)), /Nested too deep/);
  const ok = parseXml('<a>'.repeat(200) + 'x' + '</a>'.repeat(200));
  assert.equal(textOf(ok), 'x');
});
