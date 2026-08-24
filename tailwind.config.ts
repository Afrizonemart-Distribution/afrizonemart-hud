import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/components/**/*.{js,ts,jsx,tsx,mdx}', './src/app/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        // HUD "screen" — brand navy, darkened for a real dark-console
        // feel rather than the storefront's lighter navy panels.
        navy: { DEFAULT: '#000066', light: '#0a0f3d', dark: '#000033' },
        void: '#050614',
        // Brand amber stays the glow color — HUDs read amber/green/cyan
        // readouts against dark backgrounds; amber keeps this on-brand
        // rather than borrowing a generic sci-fi teal.
        amber: { DEFAULT: '#FBAC34', light: '#FEF3E2', dark: '#D88E1B', glow: '#FFD27A' },
        danger: '#FF4D4D',
        success: '#3DDC97',
        info: '#4DD8FF',
        grid: '#12184a',
      },
      fontFamily: {
        raleway: ['var(--font-raleway)', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'monospace'],
        sans: ['var(--font-raleway)', 'sans-serif'],
      },
      boxShadow: {
        glow: '0 0 12px rgba(251, 172, 52, 0.5), 0 0 2px rgba(251, 172, 52, 0.8)',
        'glow-sm': '0 0 6px rgba(251, 172, 52, 0.4)',
        panel: '0 0 0 1px rgba(251, 172, 52, 0.15), 0 8px 32px rgba(0, 0, 0, 0.6)',
      },
      keyframes: {
        scan: {
          '0%': { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(100%)' },
        },
        blink: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.3' },
        },
        'flicker-in': {
          '0%': { opacity: '0' },
          '10%': { opacity: '0.6' },
          '20%': { opacity: '0.1' },
          '30%': { opacity: '1' },
          '100%': { opacity: '1' },
        },
      },
      animation: {
        scan: 'scan 3s linear infinite',
        blink: 'blink 1.4s ease-in-out infinite',
        'flicker-in': 'flicker-in 0.4s ease-out',
      },
    },
  },
  plugins: [],
};

export default config;
