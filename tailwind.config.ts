import type { Config } from 'tailwindcss';

// All colors resolve to the CSS variables defined in app/globals.css (a single
// light/dark token source). App-specific tokens (surface, the status/rating
// pill families, the favourite-star gold, etc.) sit alongside the standard
// shadcn semantic names so both the shadcn primitives and the hiring UI share
// one theme.
export default {
  darkMode: ['class'],
  content: [
    './pages/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './app/**/*.{ts,tsx}',
    './src/**/*.{ts,tsx}'
  ],
  prefix: '',
  theme: {
    extend: {
      colors: {
        border: 'var(--border)',
        'border-strong': 'var(--border-strong)',
        input: 'var(--input)',
        ring: 'var(--ring)',
        background: 'var(--background)',
        foreground: 'var(--foreground)',
        surface: 'var(--surface)',
        'surface-2': 'var(--surface-2)',
        star: 'var(--star)',
        ok: 'var(--ok)',
        primary: {
          DEFAULT: 'var(--primary)',
          foreground: 'var(--primary-foreground)',
          weak: 'var(--primary-weak)',
          border: 'var(--primary-border)'
        },
        secondary: {
          DEFAULT: 'var(--secondary)',
          foreground: 'var(--secondary-foreground)'
        },
        destructive: {
          DEFAULT: 'var(--destructive)',
          foreground: 'var(--destructive-foreground)'
        },
        muted: {
          DEFAULT: 'var(--muted)',
          foreground: 'var(--muted-foreground)'
        },
        accent: {
          DEFAULT: 'var(--accent)',
          foreground: 'var(--accent-foreground)'
        },
        popover: {
          DEFAULT: 'var(--popover)',
          foreground: 'var(--popover-foreground)'
        },
        card: {
          DEFAULT: 'var(--card)',
          foreground: 'var(--card-foreground)'
        },
        // Rating-verdict + candidate-status pill families (fg + bg).
        syes: { DEFAULT: 'var(--syes-fg)', bg: 'var(--syes-bg)' },
        yes: { DEFAULT: 'var(--yes-fg)', bg: 'var(--yes-bg)' },
        no: { DEFAULT: 'var(--no-fg)', bg: 'var(--no-bg)' },
        sno: { DEFAULT: 'var(--sno-fg)', bg: 'var(--sno-bg)' },
        hold: { DEFAULT: 'var(--hold-fg)', bg: 'var(--hold-bg)' },
        rej: { DEFAULT: 'var(--rej-fg)', bg: 'var(--rej-bg)' },
        hired: { DEFAULT: 'var(--hired-fg)', bg: 'var(--hired-bg)' }
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'var(--radius-sm)',
        sm: '5px'
      },
      boxShadow: {
        ds: 'var(--shadow-ds)',
        drawer: 'var(--shadow-drawer)'
      },
      keyframes: {
        'msg-flash': {
          '0%': { backgroundColor: 'var(--primary-weak)' },
          '100%': { backgroundColor: 'transparent' }
        }
      },
      animation: {
        'msg-flash': 'msg-flash 2.2s ease-out'
      }
    }
  },
  plugins: []
} satisfies Config;
