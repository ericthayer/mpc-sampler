import { h } from '../dom.js';

/** Turn `backticked` words into <kbd> elements. Text only — never parses HTML. */
export function rich(text: string): Node[] {
  return text.split('`').map((part, i) => (i % 2 === 1 ? h('kbd', null, part) : document.createTextNode(part)));
}
