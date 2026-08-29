import type { Metadata } from 'next';
import './globals.css';
import './fidelity.css';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.SITE_URL ?? 'http://localhost:3002'),
  title: '盛年 · 更年期AI陪伴助手',
  description: '更年期AI陪伴助手，帮您穿越灰烬，涅槃重生。',
  openGraph: {
    title: '盛年 · 更年期AI陪伴助手',
    description: '更年期AI陪伴助手，帮您穿越灰烬，涅槃重生。',
    images: ['/og.png'],
  },
  twitter: {
    card: 'summary_large_image',
    title: '盛年 · 更年期AI陪伴助手',
    description: '更年期AI陪伴助手，帮您穿越灰烬，涅槃重生。',
    images: ['/og.png'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
