import type { Metadata } from 'next';
import './globals.css';
import { Public_Sans } from 'next/font/google';

const publicSans = Public_Sans({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700', '800', '900'],
  variable: '--font-public-sans',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Tehila Bodyshop CRM',
  description: 'Bodyshop repair workflow management',
  manifest: '/manifest.json',
  themeColor: '#3b82f6',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Tehila CRM',
  },
  viewport: {
    width: 'device-width',
    initialScale: 1,
    maximumScale: 1,
    userScalable: false,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="he" dir="rtl" className={publicSans.variable}>
      <body className={`antialiased ${publicSans.className}`}>{children}</body>
    </html>
  );
}
