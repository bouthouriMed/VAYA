import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        background: '#0D1512',
        surface: '#16211C',
        'surface-muted': '#20302A',
        ink: '#F6F1E7',
        'ink-muted': '#B4AFA0',
        'ink-faint': '#7C7A6E',
        'on-ink': '#0D1512',
        outline: '#2A362F',
        'outline-variant': '#20302A',
        accent: '#3FBE85',
        'accent-strong': '#2E9E6C',
        'accent-glow': '#1F6B49',
        'on-accent': '#0D1512',
        route: '#7FA491',
        'route-faint': 'rgba(127, 164, 145, 0.3)',
        pickup: '#2E3B42',
        error: '#E08672',
        warning: '#E0BB72',
        info: '#8FB8C7',
      },
      fontFamily: {
        display: ['var(--font-fraunces)', 'Georgia', 'serif'],
        sans: ['var(--font-jakarta)', 'system-ui', 'sans-serif'],
      },
      spacing: {
        18: '4.5rem',
        22: '5.5rem',
        30: '7.5rem',
      },
      borderRadius: {
        xl2: '1.25rem',
        xl3: '2rem',
      },
      maxWidth: {
        content: '1200px',
      },
      backgroundImage: {
        'vaya-gradient': 'linear-gradient(180deg, #182620 0%, #08100C 100%)',
        'ink-gradient': 'linear-gradient(135deg, #FFFFFF 0%, #EEE2C4 100%)',
        'accent-gradient': 'linear-gradient(135deg, #63E8A9 0%, #279768 100%)',
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(24px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'pulse-ring': {
          '0%': { transform: 'scale(0.9)', opacity: '0.6' },
          '100%': { transform: 'scale(1.6)', opacity: '0' },
        },
      },
      animation: {
        'fade-up': 'fade-up 0.7s cubic-bezier(0.16,1,0.3,1) both',
        'pulse-ring': 'pulse-ring 2.4s cubic-bezier(0.4,0,0.6,1) infinite',
      },
    },
  },
  plugins: [],
};

export default config;
