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
    /*
     * Lets the OS offer Splitta in its share sheet — a payment screenshot or a
     * receipt goes straight into a new expense. Only registered once the PWA is
     * installed; a browser tab never appears in the share sheet.
     *
     * POST + multipart because files cannot travel on a GET. The service worker
     * intercepts this exact path, lifts the payload out and redirects to the
     * /share screen, since a POST body is not otherwise reachable from a page.
     */
    share_target: {
      action: '/share',
      method: 'POST',
      enctype: 'multipart/form-data',
      params: {
        title: 'title',
        text: 'text',
        url: 'url',
        files: [{ name: 'media', accept: ['image/*'] }],
      },
    },
    icons: [
      {
        src: '/favicon.ico',
        sizes: '48x48',
        type: 'image/x-icon',
      },
    ],
  };
}
