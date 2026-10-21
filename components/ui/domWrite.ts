import { useRef } from 'react';

type El = HTMLElement | SVGElement;

/**
 * Imperative DOM writer for high-frequency HUD values. Components register
 * elements by name through `ref(name)`, and a `useTicker` callback then calls
 * `text` / `css` / `cls` / `attr`. Each write is cached so identical values never
 * touch the DOM, and nothing here triggers a React render.
 */
export interface DomWriter {
  ref: (name: string) => (el: El | null) => void;
  text: (name: string, value: string) => void;
  css: (name: string, prop: string, value: string) => void;
  cls: (name: string, className: string, on: boolean) => void;
  attr: (name: string, key: string, value: string) => void;
}

export function createWriter(): DomWriter {
  const els = new Map<string, El>();
  const refs = new Map<string, (el: El | null) => void>();
  const cache = new Map<string, string | boolean>();

  const clearCache = (name: string) => {
    const prefix = `${name}|`;
    for (const k of cache.keys()) if (k.startsWith(prefix)) cache.delete(k);
  };

  return {
    ref(name) {
      let fn = refs.get(name);
      if (!fn) {
        fn = (el) => {
          if (el) els.set(name, el);
          else els.delete(name);
          clearCache(name);
        };
        refs.set(name, fn);
      }
      return fn;
    },
    text(name, value) {
      const key = `${name}|t`;
      if (cache.get(key) === value) return;
      const el = els.get(name);
      if (!el) return;
      cache.set(key, value);
      el.textContent = value;
    },
    css(name, prop, value) {
      const key = `${name}|c|${prop}`;
      if (cache.get(key) === value) return;
      const el = els.get(name);
      if (!el) return;
      cache.set(key, value);
      el.style.setProperty(prop, value);
    },
    cls(name, className, on) {
      const key = `${name}|k|${className}`;
      if (cache.get(key) === on) return;
      const el = els.get(name);
      if (!el) return;
      cache.set(key, on);
      el.classList.toggle(className, on);
    },
    attr(name, k, value) {
      const key = `${name}|a|${k}`;
      if (cache.get(key) === value) return;
      const el = els.get(name);
      if (!el) return;
      cache.set(key, value);
      el.setAttribute(k, value);
    },
  };
}

export function useWriter(): DomWriter {
  const r = useRef<DomWriter | null>(null);
  if (!r.current) r.current = createWriter();
  return r.current;
}
