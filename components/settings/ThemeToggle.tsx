'use client';

// Light/Dark theme switch. Applies by toggling `class="dark"` on <html> and
// persists to localStorage (read back before paint by the script in
// app/layout.tsx, so there's no flash on reload).

import { useEffect, useState } from 'react';

type Theme = 'light' | 'dark';

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('light');

  // Read the theme the no-flash script already applied.
  useEffect(() => {
    setTheme(
      document.documentElement.classList.contains('dark') ? 'dark' : 'light'
    );
  }, []);

  function apply(next: Theme) {
    setTheme(next);
    document.documentElement.classList.toggle('dark', next === 'dark');
    try {
      localStorage.setItem('theme', next);
    } catch {
      /* ignore private-mode / quota */
    }
  }

  return (
    <div className="theme-toggle" role="group" aria-label="Theme">
      <button
        className="theme-opt"
        aria-pressed={theme === 'light'}
        onClick={() => apply('light')}
      >
        Light
      </button>
      <button
        className="theme-opt"
        aria-pressed={theme === 'dark'}
        onClick={() => apply('dark')}
      >
        Dark
      </button>
    </div>
  );
}
