import type { Metadata } from 'next';
import './globals.css';
import Providers from '@/components/Providers';
import Navbar from '@/components/Navbar';

export const metadata: Metadata = {
  title: 'Neuropetra IP — SOC Threat Intelligence & Abuse Investigation',
  description: 'Internal threat intelligence lookup and attack telemetry for SOC analysts',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark h-full antialiased">
      <body className="min-h-screen bg-[#090a0f] text-[#f4f5f7] flex flex-col font-sans selection:bg-white/10 selection:text-white">
        <Providers>
          <Navbar />
          <main className="flex-1 w-full">{children}</main>
          <footer className="border-t border-white/[0.06] bg-[#090a0f] py-3.5 text-center text-xs text-zinc-500">
            <div className="mx-auto max-w-7xl px-4 flex flex-col sm:flex-row justify-between items-center gap-2">
              <span className="font-mono text-[11px] text-zinc-400">ACAD CSIRT / SGU SOC Threat Intel Core</span>
              <span className="text-[11px] text-zinc-600">PostgreSQL abuseip &bull; Read-Only Telemetry View</span>
            </div>
          </footer>
        </Providers>
      </body>
    </html>
  );
}
