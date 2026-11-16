// A small XML reader for RSS / Atom feeds (feat-applesauce-revamp §Milestones RSS). It replaces the
// browser's DOMParser so the feed parser is pure and runs under `node --test`. Feeds are untrusted:
// - no DTD is read and no entity is expanded except the five XML ones and numeric ones, so a feed cannot
//   pull in files or blow up in size;
// - nesting is capped, the reader never recurses, and a broken document is an error, not a guess.
// Names are matched as written (`itunes:image`), as DOMParser's getElementsByTagName does for XML.

export interface XmlElement {
  name: string;
  attrs: Record<string, string>;
  children: XmlNode[];
}
export type XmlNode = XmlElement | string;

const MAX_DEPTH = 256;
const NAMED: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

export class XmlError extends Error {}

function decode(text: string): string {
  if (!text.includes('&')) return text;
  return text.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (whole, ref: string) => {
    if (ref[0] !== '#') return NAMED[ref] ?? whole;
    const code = ref[1] === 'x' || ref[1] === 'X' ? parseInt(ref.slice(2), 16) : parseInt(ref.slice(1), 10);
    if (!Number.isFinite(code) || code < 1 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) return whole;
    return String.fromCodePoint(code);
  });
}

const NAME = /[A-Za-z_:][-A-Za-z0-9_:.·À-￿]*/y;
const SPACE = /\s*/y;
const ATTR = /([A-Za-z_:][-A-Za-z0-9_:.·À-￿]*)\s*=\s*("([^"<]*)"|'([^'<]*)')/y;

function readName(xml: string, at: number): [string, number] {
  NAME.lastIndex = at;
  const m = NAME.exec(xml);
  if (!m) throw new XmlError(`Bad name at ${at}`);
  return [m[0], at + m[0].length];
}

function skipSpace(xml: string, at: number): number {
  SPACE.lastIndex = at;
  SPACE.exec(xml);
  return SPACE.lastIndex;
}

/** Parses a whole document and returns its root element. Throws XmlError when it is not well formed. */
export function parseXml(xml: string): XmlElement {
  const stack: XmlElement[] = [];
  let root: XmlElement | null = null;
  let i = xml.charCodeAt(0) === 0xfeff ? 1 : 0;
  const n = xml.length;

  const addText = (text: string) => {
    const top = stack[stack.length - 1];
    if (top && text) top.children.push(text);
  };

  while (i < n) {
    const lt = xml.indexOf('<', i);
    if (lt < 0) { addText(decode(xml.slice(i))); break; }
    if (lt > i) addText(decode(xml.slice(i, lt)));

    if (xml.startsWith('<!--', lt)) {
      const end = xml.indexOf('-->', lt + 4);
      if (end < 0) throw new XmlError('Unclosed comment');
      i = end + 3;
    } else if (xml.startsWith('<![CDATA[', lt)) {
      const end = xml.indexOf(']]>', lt + 9);
      if (end < 0) throw new XmlError('Unclosed CDATA');
      if (!stack.length) throw new XmlError('Text outside the root');
      addText(xml.slice(lt + 9, end));
      i = end + 3;
    } else if (xml.startsWith('<?', lt)) {
      const end = xml.indexOf('?>', lt + 2);
      if (end < 0) throw new XmlError('Unclosed processing instruction');
      i = end + 2;
    } else if (xml.startsWith('<!', lt)) {
      // A DOCTYPE: skipped, internal subset included; its entities are never used.
      if (root || stack.length) throw new XmlError('Declaration inside the document');
      let depth = 0;
      let j = lt + 2;
      for (; j < n; j++) {
        const c = xml[j];
        if (c === '[') depth++;
        else if (c === ']') depth--;
        else if (c === '>' && depth <= 0) break;
      }
      if (j >= n) throw new XmlError('Unclosed declaration');
      i = j + 1;
    } else if (xml[lt + 1] === '/') {
      const [name, after] = readName(xml, lt + 2);
      const close = skipSpace(xml, after);
      if (xml[close] !== '>') throw new XmlError(`Bad closing tag ${name}`);
      const top = stack.pop();
      if (!top || top.name !== name) throw new XmlError(`Mismatched closing tag ${name}`);
      i = close + 1;
    } else {
      if (root && !stack.length) throw new XmlError('More than one root element');
      const [name, after] = readName(xml, lt + 1);
      const el: XmlElement = { name, attrs: {}, children: [] };
      let j = after;
      for (;;) {
        const k = skipSpace(xml, j);
        if (xml[k] === '>' || xml.startsWith('/>', k)) { j = k; break; }
        if (k === j) throw new XmlError(`Bad attribute in ${name}`);
        ATTR.lastIndex = k;
        const m = ATTR.exec(xml);
        if (!m) throw new XmlError(`Bad attribute in ${name}`);
        el.attrs[m[1]] = decode((m[3] ?? m[4]).replace(/[\t\n\r]/g, ' '));
        j = ATTR.lastIndex;
      }
      const parent = stack[stack.length - 1];
      if (parent) parent.children.push(el);
      else root = el;
      if (xml[j] === '/') {
        i = j + 2;
      } else {
        if (stack.length >= MAX_DEPTH) throw new XmlError('Nested too deep');
        stack.push(el);
        i = j + 1;
      }
    }
  }
  if (!root) throw new XmlError('No root element');
  if (stack.length) throw new XmlError(`Unclosed ${stack[stack.length - 1].name}`);
  return root;
}

/** Every element named `name` under `el`, in document order (like getElementsByTagName). */
export function descendants(el: XmlElement, name: string): XmlElement[] {
  const found: XmlElement[] = [];
  const todo: XmlNode[] = [...el.children].reverse();
  while (todo.length) {
    const node = todo.pop()!;
    if (typeof node === 'string') continue;
    if (node.name === name) found.push(node);
    for (let k = node.children.length - 1; k >= 0; k--) todo.push(node.children[k]);
  }
  return found;
}

export function firstDescendant(el: XmlElement, name: string): XmlElement | undefined {
  const todo: XmlNode[] = [...el.children].reverse();
  while (todo.length) {
    const node = todo.pop()!;
    if (typeof node === 'string') continue;
    if (node.name === name) return node;
    for (let k = node.children.length - 1; k >= 0; k--) todo.push(node.children[k]);
  }
  return undefined;
}

/** All the text inside `el` (like textContent). */
export function textOf(el: XmlElement | undefined): string {
  if (!el) return '';
  let out = '';
  const todo: XmlNode[] = [...el.children].reverse();
  while (todo.length) {
    const node = todo.pop()!;
    if (typeof node === 'string') out += node;
    else for (let k = node.children.length - 1; k >= 0; k--) todo.push(node.children[k]);
  }
  return out;
}
