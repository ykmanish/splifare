export default function manifest() {
  return {
    name: 'Splitta',
    short_name: 'Splitta',
    description: 'Split expenses, groups, and shared shopping lists.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#f1efeb',
    theme_color: '#f1efeb',
    orientation: 'portrait',
    categories: ['finance', 'productivity'],
    icons: [
      {
        src: '/favicon.ico',
        sizes: '48x48',
        type: 'image/x-icon',
      },
    ],
  };
}
