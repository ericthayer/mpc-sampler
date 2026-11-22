/** Tiny DOM helpers shared by every component. */

type Child = Node | string | number | null | undefined | false;
type Props = Record<string, unknown>;

/**
 * Hyperscript element builder. Props starting with `on` attach listeners,
 * `class` sets className, `data-*` / `aria-*` / unknown keys become attributes,
 * and everything else is assigned as a property. Custom elements always get attributes.
 */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props?: Props | null, ...children: Child[]): HTMLElementTagNameMap[K];
export function h(tag: string, props?: Props | null, ...children: Child[]): HTMLElement;
export function h(tag: string, props?: Props | null, ...children: Child[]): HTMLElement {
  const el = document.createElement(tag);
  // Custom elements are configured through attributes; their properties may be read-only.
  const custom = tag.includes('-');
  if (props) {
    for (const [key, value] of Object.entries(props)) {
      if (value === undefined || value === null || value === false) continue;
      if (key === 'class') el.className = String(value);
      else if (key.startsWith('on') && typeof value === 'function') {
        el.addEventListener(key.slice(2).toLowerCase(), value as EventListener);
      } else if (custom || key.includes('-') || key === 'role' || key === 'part' || key === 'for' || !(key in el)) {
        el.setAttribute(key, value === true ? '' : String(value));
      } else {
        (el as unknown as Props)[key] = value;
      }
    }
  }
  append(el, children);
  return el;
}

export function append(parent: Node, children: Child[]): void {
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    parent.appendChild(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

export function clear(node: Node): void {
  while (node.firstChild) node.removeChild(node.firstChild);
}

/** Build a constructable stylesheet once per module and share it across instances. */
export function sheet(cssText: string): CSSStyleSheet {
  const s = new CSSStyleSheet();
  s.replaceSync(cssText);
  return s;
}

/** Identity tag so editors highlight CSS inside template literals. */
export function css(strings: TemplateStringsArray, ...values: (string | number)[]): string {
  return strings.reduce((out, part, i) => out + part + (values[i] ?? ''), '');
}

export function define(name: string, ctor: CustomElementConstructor): void {
  if (!customElements.get(name)) customElements.define(name, ctor);
}

/** Dispatch a bubbling, composed CustomEvent so it crosses shadow boundaries. */
export function emit<T>(target: EventTarget, type: string, detail: T): void {
  target.dispatchEvent(new CustomEvent<T>(type, { detail, bubbles: true, composed: true }));
}

/** Base class: open shadow root with shared + component styles adopted. */
export abstract class SlabElement extends HTMLElement {
  protected readonly root: ShadowRoot;

  constructor(styles: CSSStyleSheet[], delegatesFocus = true) {
    super();
    this.root = this.attachShadow({ mode: 'open', delegatesFocus });
    this.root.adoptedStyleSheets = styles;
  }
}
