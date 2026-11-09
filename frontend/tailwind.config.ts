import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        campus: {
          50: '#f0f9ff',
          100: '#e0f2fe',
          200: '#bae6fd',
          300: '#7dd3fc',
          400: '#38bdf8',
          500: '#0284c7',
          600: '#0369a1',
          700: '#075985',
          800: '#0c4a6e',
          900: '#082f49',
        },
      },
      keyframes: {
        'ai-glow-aurora': {
          '0%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
          '100%': { backgroundPosition: '0% 50%' },
        },
        'ai-pulse-subtle': {
          '0%, 100%': { opacity: '0.55', filter: 'blur(20px)', transform: 'scale(1)' },
          '50%': { opacity: '0.9', filter: 'blur(26px)', transform: 'scale(1.02)' },
        },
        'ai-pulse-intense': {
          '0%, 100%': { opacity: '0.8', filter: 'blur(24px)', transform: 'scale(1.01)' },
          '50%': { opacity: '1', filter: 'blur(32px)', transform: 'scale(1.03)' },
        },
        'mic-live-pulse': {
          '0%': { boxShadow: '0 0 0 0 rgba(239, 68, 68, 0.7)' },
          '70%': { boxShadow: '0 0 0 10px rgba(239, 68, 68, 0)' },
          '100%': { boxShadow: '0 0 0 0 rgba(239, 68, 68, 0)' },
        },
      },
      animation: {
        'ai-aurora': 'ai-glow-aurora 8s ease infinite',
        'ai-aurora-fast': 'ai-glow-aurora 4s ease infinite',
        'ai-pulse': 'ai-pulse-subtle 4s ease-in-out infinite',
        'ai-pulse-active': 'ai-pulse-intense 2.5s ease-in-out infinite',
        'mic-pulse': 'mic-live-pulse 1.5s cubic-bezier(0, 0, 0.2, 1) infinite',
      },
    },
  },
  plugins: [],
};

export default config;
