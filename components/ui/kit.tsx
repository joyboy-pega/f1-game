'use client';

import React, { useId, useRef } from 'react';

/* Small accessible form primitives shared by the lobby and the pause menu. */

export interface SegOption<T> {
  value: T;
  label: React.ReactNode;
  title?: string;
}

/** Radio-style segmented control with roving tabindex and arrow-key selection. */
export function Seg<T extends string | number>({
  value,
  options,
  onChange,
  label,
  className = '',
}: {
  value: T;
  options: SegOption<T>[];
  onChange: (v: T) => void;
  label: string;
  className?: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const idx = Math.max(0, options.findIndex((o) => o.value === value));

  const onKeyDown = (e: React.KeyboardEvent) => {
    let next = -1;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (idx + 1) % options.length;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (idx - 1 + options.length) % options.length;
    if (next < 0) return;
    e.preventDefault();
    e.stopPropagation();
    onChange(options[next].value);
    refs.current[next]?.focus();
  };

  return (
    <div className={`k-seg ${className}`} role="radiogroup" aria-label={label} onKeyDown={onKeyDown}>
      {options.map((o, i) => (
        <button
          key={String(o.value)}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          tabIndex={i === idx ? 0 : -1}
          title={o.title}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className="k-switch"
      onClick={() => onChange(!checked)}
    />
  );
}

export function Slider({
  value,
  min,
  max,
  step,
  onChange,
  label,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  label: string;
}) {
  const fill = `${((value - min) / (max - min)) * 100}%`;
  return (
    <input
      className="k-range"
      type="range"
      aria-label={label}
      min={min}
      max={max}
      step={step}
      value={value}
      style={{ ['--fill' as string]: fill }}
      onChange={(e) => onChange(parseFloat(e.target.value))}
      onInput={(e) => onChange(parseFloat((e.target as HTMLInputElement).value))}
    />
  );
}

/** One settings row: label, control, optional value readout. */
export function Field({
  label,
  value,
  hint,
  children,
}: {
  label: string;
  value?: React.ReactNode;
  hint?: string;
  children: React.ReactNode;
}) {
  const id = useId();
  return (
    <div className={`k-field${value === undefined ? ' noval' : ''}`}>
      <span className="k-label" id={id}>
        {label}
      </span>
      <div style={{ minWidth: 0 }} role="group" aria-labelledby={id}>
        {children}
      </div>
      {value !== undefined && <span className="k-val">{value}</span>}
      {hint && <span className="k-hint">{hint}</span>}
    </div>
  );
}

export function Key({ children }: { children: React.ReactNode }) {
  return <span className="k-key">{children}</span>;
}
