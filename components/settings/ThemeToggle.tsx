'use client';

// Light/Dark/System theme switch. Applies by toggling `class="dark"` on <html>
// and persists the chosen preference to localStorage (read back before paint by
// the script in app/layout.tsx, so there's no flash on reload). When "System"
// is chosen the applied theme follows the OS `prefers-color-scheme` and tracks
// it live.

import { useEffect, useState } from 'react';

type Theme = 'light' | 'dark' | 'system';

function systemPrefersDark() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

// Resolve a preference to whether the `dark` class should be applied.
function resolveDark(theme: Theme) {
  return theme === 'dark' || (theme === 'system' && systemPrefersDark());
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('system');

  // Read the persisted preference the no-flash script already applied.
  useEffect(() => {
    let stored: Theme = 'system';
    try {
      const v = localStorage.getItem('theme');
      if (v === 'light' || v === 'dark' || v === 'system') stored = v;
    } catch {
      /* ignore private-mode / quota */
    }
    setTheme(stored);
  }, []);

  // While following the system, track OS light/dark changes live. The class is
  // already correct on load (no-flash script) and on selection (apply), so we
  // only need to react to *subsequent* OS changes here — applying on mount
  // would clobber an explicit light/dark choice, since `theme` is still the
  // placeholder default until the effect above resolves it.
  useEffect(() => {
    if (theme !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const sync = () =>
      document.documentElement.classList.toggle('dark', mq.matches);
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, [theme]);

  function apply(next: Theme) {
    setTheme(next);
    document.documentElement.classList.toggle('dark', resolveDark(next));
    try {
      localStorage.setItem('theme', next);
    } catch {
      /* ignore private-mode / quota */
    }
  }

  const optClass =
    'cursor-pointer rounded-full border-none bg-transparent px-3.5 py-1.5 text-[13px] font-semibold text-muted-foreground aria-pressed:bg-primary aria-pressed:text-primary-foreground';

  return (
    <div
      className="inline-flex gap-1.5 rounded-full border border-border-strong p-[3px]"
      role="group"
      aria-label="Theme"
    >
      <button
        className={optClass}
        aria-pressed={theme === 'light'}
        onClick={() => apply('light')}
      >
        Light
      </button>
      <button
        className={optClass}
        aria-pressed={theme === 'dark'}
        onClick={() => apply('dark')}
      >
        Dark
      </button>
      <button
        className={optClass}
        aria-pressed={theme === 'system'}
        onClick={() => apply('system')}
      >
        System
      </button>
    </div>
  );
}
