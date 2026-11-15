import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_LOCAL_FILES, scanFolder, tracksFromFiles } from './localFolder.ts';
import type { FsDirHandle } from './ownAudioStore.ts';

// A folder tree shaped like the File System Access API handles the browser gives.
type Tree = { [name: string]: Tree | string };
function dir(name: string, tree: Tree): FsDirHandle {
  return {
    kind: 'directory',
    name,
    async *values() {
      for (const [n, v] of Object.entries(tree)) {
        yield typeof v === 'string'
          ? { kind: 'file', name: n, getFile: async () => new File([v], n) }
          : dir(n, v);
      }
    },
  } as unknown as FsDirHandle;
}

test('scanning a folder finds audio in subfolders, sorted, with titles from names', async () => {
  const root = dir('Music', { 'b_song.mp3': 'x', 'cover.jpg': 'x', notes: { 'a-track.flac': 'x', 'readme.txt': 'x' } });
  const tracks = await scanFolder('f1', root);
  assert.deepEqual(tracks.map(t => t.id), ['f1:b_song.mp3', 'f1:notes/a-track.flac']);
  assert.ok(tracks.every(t => t.kind === 'audio' && t.file instanceof File));
});

test('the same scan for pictures finds the images instead', async () => {
  const root = dir('Pics', { 'b_song.mp3': 'x', 'cover.jpg': 'x', deep: { 'p.webp': 'x' } });
  const pics = await scanFolder('f2', root, 'image');
  assert.deepEqual(pics.map(t => t.id), ['f2:cover.jpg', 'f2:deep/p.webp']);
});

test('folders nested too deep are not walked', async () => {
  let tree: Tree = { 'bottom.mp3': 'x' };
  for (let i = 0; i < 10; i++) tree = { [`d${i}`]: tree };
  assert.equal((await scanFolder('f3', dir('root', tree))).length, 0);
  assert.equal((await scanFolder('f4', dir('root', { a: { b: { 'ok.mp3': 'x' } } }))).length, 1);
});

test('picked files keep only the right kind and stop at the cap', () => {
  const files = [new File(['x'], 'a.mp3', { type: 'audio/mpeg' }), new File(['x'], 'b.png', { type: 'image/png' })];
  assert.deepEqual(tracksFromFiles('g', files).map(t => t.id), ['g:0:a.mp3']);
  assert.deepEqual(tracksFromFiles('g', files, 'image').map(t => t.id), ['g:0:b.png']);
  const many = Array.from({ length: MAX_LOCAL_FILES + 5 }, (_, i) => new File(['x'], `${i}.mp3`, { type: 'audio/mpeg' }));
  assert.equal(tracksFromFiles('g', many).length, MAX_LOCAL_FILES);
});
