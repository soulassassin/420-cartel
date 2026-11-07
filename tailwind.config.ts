import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: ['class'],
  content: ['./src/**/*.{ts,tsx,mdx}'],
  theme: {
    container: {
      center: true,
      padding: { DEFAULT: '1rem', md: '2rem', xl: '3rem' },
      screens: { '2xl': '1440px' },
    },
    extend: {
      colors: {
        void: 'var(--bg-void)',
        surface: 'var(--bg-surface)',
        elevated: 'var(--bg-elevated)',
        glass: 'var(--bg-glass)',
        faint: 'var(--text-faint)',
        gold: {
          DEFAULT: 'var(--accent-gold)',
          bright: 'var(--accent-gold-bright)',
          deep: 'var(--accent-gold-deep)',
        },
        hairline: 'var(--border-subtle)',
        // shadcn tokens, remapped onto the Cartel palette.
        background: 'var(--bg-void)',
        foreground: 'var(--text-primary)',
        muted: { DEFAULT: 'var(--bg-surface)', foreground: 'var(--text-muted)' },
        card: { DEFAULT: 'var(--bg-surface)', foreground: 'var(--text-primary)' },
        popover: { DEFAULT: 'var(--bg-surface)', foreground: 'var(--text-primary)' },
        primary: { DEFAULT: 'var(--accent-gold)', foreground: 'var(--bg-void)' },
        secondary: { DEFAULT: 'var(--bg-surface)', foreground: 'var(--text-primary)' },
        accent: { DEFAULT: 'var(--accent-gold)', foreground: 'var(--bg-void)' },
        destructive: { DEFAULT: '#B3261E', foreground: '#FFFFFF' },
        border: 'var(--border-subtle)',
        input: 'var(--border-subtle)',
        ring: 'var(--accent-gold)',
      },
      fontFamily: {
        display: ['var(--font-display)', 'system-ui', 'sans-serif'],
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        // Brutalist display scale, clamped for fluid typography.
        'display-xl': ['clamp(3.5rem, 12vw, 11rem)', { lineHeight: '0.86', letterSpacing: '-0.03em' }],
        'display-lg': ['clamp(2.75rem, 8vw, 7rem)', { lineHeight: '0.9', letterSpacing: '-0.02em' }],
        'display-md': ['clamp(2rem, 5vw, 4rem)', { lineHeight: '0.95', letterSpacing: '-0.015em' }],
        eyebrow: ['0.6875rem', { lineHeight: '1.2', letterSpacing: '0.34em' }],
      },
      borderRadius: {
        // Brutalist luxury: sharp edges, never pills.
        none: '0',
        sm: '2px',
        DEFAULT: '2px',
        md: '3px',
        lg: '4px',
      },
      boxShadow: {
        'gold-hairline': '0 0 0 1px var(--border-subtle)',
        'gold-focus': '0 0 0 1px var(--accent-gold), 0 0 24px -4px rgba(212, 175, 55, 0.45)',
        'gold-glow': '0 0 60px -12px rgba(212, 175, 55, 0.5)',
        obsidian: '0 32px 80px -24px rgba(0, 0, 0, 0.9)',
      },
      backgroundImage: {
        'gold-sheen':
          'linear-gradient(110deg, var(--accent-gold-deep) 0%, var(--accent-gold) 38%, var(--accent-gold-bright) 50%, var(--accent-gold) 62%, var(--accent-gold-deep) 100%)',
        'vault-radial':
          'radial-gradient(circle at 50% 45%, rgba(212, 175, 55, 0.16) 0%, rgba(5, 5, 5, 0) 62%)',
        'surface-fade':
          'linear-gradient(180deg, rgba(15, 15, 15, 0.9) 0%, rgba(5, 5, 5, 0) 100%)',
      },
      transitionTimingFunction: {
        cartel: 'cubic-bezier(0.16, 1, 0.3, 1)',
        vault: 'cubic-bezier(0.76, 0, 0.24, 1)',
      },
      keyframes: {
        'gold-sweep': {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        'grain-shift': {
          '0%, 100%': { transform: 'translate(0, 0)' },
          '20%': { transform: 'translate(-2%, 1%)' },
          '40%': { transform: 'translate(1%, -2%)' },
          '60%': { transform: 'translate(-1%, 2%)' },
          '80%': { transform: 'translate(2%, -1%)' },
        },
        'pulse-gold': {
          '0%, 100%': { opacity: '0.35' },
          '50%': { opacity: '1' },
        },
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
      },
      animation: {
        'gold-sweep': 'gold-sweep 6s linear infinite',
        'grain-shift': 'grain-shift 1.2s steps(4) infinite',
        'pulse-gold': 'pulse-gold 2.4s ease-in-out infinite',
        'accordion-down': 'accordion-down 220ms cubic-bezier(0.16, 1, 0.3, 1)',
        'accordion-up': 'accordion-up 180ms cubic-bezier(0.16, 1, 0.3, 1)',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};

export default config;
