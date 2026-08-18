import './globals.css';
import { AppProvider } from '@/store/AppContext';
import { ToastProvider } from '@/components/ui/Toast';

export const metadata = {
  title: 'Splitta - split expenses, shop together',
  description:
    'Share bills with friends, flatmates and travel groups. Build grocery lists, price them up at the store, and split every item with the right people.',
  applicationName: 'Splitta',
};

export const viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f4f6f5' },
    { media: '(prefers-color-scheme: dark)', color: '#080a09' },
  ],
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  viewportFit: 'cover',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-dvh antialiased newq">
        <AppProvider>
          <ToastProvider>{children}</ToastProvider>
        </AppProvider>
      </body>
    </html>
  );
}
