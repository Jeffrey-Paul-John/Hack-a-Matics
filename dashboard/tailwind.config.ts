import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        sentinel: {
          bg: '#f8fafc',
          card: '#ffffff',
          border: '#e2e8f0',
          ink: '#0f172a',
          muted: '#64748b',
          subtle: '#94a3b8',
          dark: '#0f172a',
          red: '#ef4444',
          emerald: '#10b981',
          amber: '#f59e0b',
          blue: '#3b82f6',
          purple: '#8b5cf6',
        },
        ink: '#0f172a',
        ward: '#f1f5f9',
        pulse: '#ef4444',
        sterile: '#ffffff',
        mint: '#10b981',
        alarm: '#ef4444',
        muted: '#64748b',
      },
      fontFamily: {
        display: ['Plus Jakarta Sans', 'Inter', 'system-ui', 'sans-serif'],
        data: ['IBM Plex Mono', 'monospace'],
      },
      boxShadow: {
        sentinel: '0 1px 3px 0 rgba(0, 0, 0, 0.05), 0 1px 2px -1px rgba(0, 0, 0, 0.05)',
        card: '0 4px 6px -1px rgba(0, 0, 0, 0.02), 0 2px 4px -2px rgba(0, 0, 0, 0.02)',
        float: '0 20px 25px -5px rgba(15, 23, 42, 0.12), 0 8px 10px -6px rgba(15, 23, 42, 0.08)',
        clinical: '0 12px 30px rgba(16,38,45,.06)',
      },
    },
  },
  plugins: [],
} satisfies Config
