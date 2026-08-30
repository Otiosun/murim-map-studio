import type { Metadata } from 'next';
import './globals.css';
import './studio-library-import.css';

export const metadata: Metadata = {
  title: 'Murim Map Studio',
  description: 'Worldbuilding and narrative map authoring studio.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
