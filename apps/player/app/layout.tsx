import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Murim — Mapa do Jogador',
  description: 'Authorized player knowledge map shell.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
