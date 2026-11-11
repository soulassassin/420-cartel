import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: ['class'],
  content: ['./src/**/*.{ts,tsx,mdx}'],
  theme: {
    container: {
      center: true,
      padding: { DEFAULT: '18px', md: '43px' },
      screens: { '2xl': '1440px' },
    },
    extend: {
      colors: {
        void: 'var(--bg-void)',
        surface: 'var(--bg-surface)',
        elevated: 'var(--bg-elevated)',
        glass: 'var(--bg-glass)',
        faint: 'var(--text-faint)',
        ash: '#8e8e8e',
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
        destructive: { DEFAULT: '#FFFFFF', foreground: '#FFFFFF' },
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
        /*
         * Display scale.
         *
         * The reference sets its hero at 153px with line-height 1 and states
         * it should never fall below 96px, so display-xl floors at 6rem
         * rather than the 3.5rem it used to — at 3.5rem the whole effect
         * (type as the only source of depth) simply does not happen.
         *
         * line-height 1 throughout, not the 0.86 used before: the reference
         * is set solid, and negative leading on a condensed face at this size
         * collides ascenders into the line above.
         */
        'display-xl': ['clamp(4rem, 8.5vw, 9.5625rem)', { lineHeight: '1' }],
        'display-lg': ['clamp(4rem, 8vw, 6rem)', { lineHeight: '1' }],
        'display-md': ['clamp(2.5rem, 5vw, 4rem)', { lineHeight: '1' }],

        /*
         * Body scale — a minor second (1.067) off a 25px base, as specified.
         * Deliberately tight: the contrast in this system comes from the gulf
         * between body and display, not from steps within body.
         */
        'body-sm': ['1.1875rem', { lineHeight: '1.55' }],
        'body-md': ['1.375rem', { lineHeight: '1.45' }],
        'body-lg': ['1.5625rem', { lineHeight: '1.4' }],
        eyebrow: ['0.6875rem', { lineHeight: '1.2', letterSpacing: '0.34em' }],
      },
      borderRadius: {
        /*
         * Every corner is square. The reference is explicit — 0px radius on
         * everything — and these map through `--radius`, which
         * `.shell-operational` raises back to 2px for the POS and back office.
         */
        none: '0',
        sm: 'var(--radius)',
        DEFAULT: 'var(--radius)',
        md: 'var(--radius)',
        lg: 'var(--radius)',
        // xl/2xl/3xl are mapped too because several pages reach past the token
        // layer for them (agent/page.tsx uses rounded-2xl throughout). Routing
        // them through --radius squares those off in the editorial shell
        // without having to touch each file before its redesign lands.
        xl: 'var(--radius)',
        '2xl': 'var(--radius)',
        '3xl': 'var(--radius)',
        // `full` is deliberately NOT mapped: the reference keeps one circular
        // element, the logo stamp, and avatars/pills still need a true circle.
        full: '9999px',
      },
      /*
       * Resolved through custom properties rather than hardcoded, so a shell
       * can switch them off wholesale. In the editorial shell the glow and
       * the drop shadow are both `none`; `.shell-operational` restores them.
       */
      boxShadow: {
        'gold-hairline': '0 0 0 1px var(--border-subtle)',
        'gold-focus': '0 0 0 1px var(--accent-gold)',
        'gold-glow': 'var(--shadow-gold-glow)',
        obsidian: 'var(--shadow-obsidian)',
      },
      backgroundImage: {
        'gold-sheen': 'var(--gradient-gold-sheen)',
        'vault-radial': 'var(--gradient-vault-radial)',
        'surface-fade': 'var(--gradient-surface-fade)',
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
