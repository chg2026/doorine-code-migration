/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#1a56db',
          600: '#1e40af',
          700: '#1e3a8a',
          800: '#1e3060',
          900: '#172554',
        },
        success: {
          50: '#f0fdf4',
          100: '#dcfce7',
          500: '#057a55',
          600: '#046c4e',
        },
        warning: {
          50: '#fffbeb',
          100: '#fef3c7',
          500: '#c27803',
          600: '#b45309',
        },
        danger: {
          50: '#fef2f2',
          100: '#fee2e2',
          500: '#c81e1e',
          600: '#b91c1c',
        },
        sidebar: {
          bg: '#111827',
          hover: '#1f2937',
          active: '#374151',
          text: '#9ca3af',
          'text-active': '#ffffff',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
    require('@tailwindcss/typography'),
  ],
};
