/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./src/renderer/index.html",
    "./src/renderer/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Sibylla VI - Monochrome system palette
        sys: {
          black: '#000000',
          darkSurface: '#0A0A0A',
          darkBorder: '#27272A',
          darkMuted: '#A1A1AA',
          white: '#FFFFFF',
          lightBg: '#F4F4F5',
          lightSurface: '#FFFFFF',
          lightBorder: '#E4E4E7',
          lightMuted: '#71717A',
        },
        // Notion 风格配色
        notion: {
          bg: {
            primary: '#050505',
            secondary: '#0A0A0A',
            tertiary: '#111111',
          },
          text: {
            primary: '#FFFFFF',
            secondary: '#A1A1AA',
            placeholder: '#71717A',
          },
          border: {
            light: '#27272A',
            default: '#27272A',
          },
          accent: '#FFFFFF',
        },
      },
      fontFamily: {
        sans: [
          'Inter',
          'Noto Sans SC',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'sans-serif',
        ],
        mono: [
          'JetBrains Mono',
          'SF Mono',
          'Monaco',
          'Inconsolata',
          'Fira Code',
          'Droid Sans Mono',
          'monospace',
        ],
      },
      backdropBlur: {
        xs: '2px',
      },
      boxShadow: {
        'glass-dark': '0 8px 32px 0 rgba(0, 0, 0, 0.6)',
        'glass-light': '0 8px 32px 0 rgba(0, 0, 0, 0.05)',
        'glow-white': '0 0 30px rgba(255, 255, 255, 0.3)',
      },
      animation: {
        'fade-in': 'fadeIn 0.2s ease-in-out',
        'slide-in': 'slideIn 0.3s ease-out',
      },
      backgroundImage: {
        'grid-pattern': "linear-gradient(to right, rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.1) 1px, transparent 1px)",
        'radial-glow': "radial-gradient(circle at 50% 0%, rgba(255,255,255,0.2) 0%, transparent 60%)",
        'noise-pattern': "url('data:image/svg+xml,%3Csvg viewBox=\"0 0 200 200\" xmlns=\"http://www.w3.org/2000/svg\"%3E%3Cfilter id=\"noiseFilter\"%3E%3CfeTurbulence type=\"fractalNoise\" baseFrequency=\"0.9\" numOctaves=\"3\" stitchTiles=\"stitch\"/%3E%3C/filter%3E%3Crect width=\"100%25\" height=\"100%25\" filter=\"url(%23noiseFilter)\" opacity=\"0.6\"/%3E%3C/svg%3E')",
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideIn: {
          '0%': { transform: 'translateY(-10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
      },
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
  ],
}
