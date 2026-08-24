import type { Metadata, Viewport } from 'next';
import { Raleway, JetBrains_Mono } from 'next/font/google';
import './globals.css';

const raleway = Raleway({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-raleway',
  display: 'swap',
});

const mono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'Afrizonemart HUD',
    template: '%s | Afrizonemart HUD',
  },
  description: 'Live visualization of the Afrizonemart algorithm systems.',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#000066',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${raleway.variable} ${mono.variable}`}>
      <body className="bg-void font-sans text-amber/90 antialiased">{children}</body>
    </html>
  );
}
