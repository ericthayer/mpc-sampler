import { h } from '../dom.js';

/**
 * Turn `backticked` words into <kbd> elements; a doubled backtick is a literal one,
 * so "````" shows the backtick key itself. Text only — never parses HTML.
 */
export function rich(text: string): Node[] {
  return text
    .replaceAll('``', '\u0000')
    .split('`')
    .map((part, i) => {
      const plain = part.replaceAll('\u0000', '`');
      return i % 2 === 1 ? h('kbd', null, plain) : document.createTextNode(plain);
    });
}
