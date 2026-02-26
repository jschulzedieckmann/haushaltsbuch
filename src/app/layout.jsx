import './globals.css';

export const metadata = {
    title: 'Haushaltsbuch — Familien-Finanzübersicht',
    description: 'Privates Finanz-Dashboard für die Familie Schulze Dieckmann.',
    icons: {
        icon: '/favicon.png',
        apple: '/favicon.png',
    },
};

export const viewport = {
    width: 'device-width',
    initialScale: 1,
    maximumScale: 1,
};

export default function RootLayout({ children }) {
    return (
        <html lang="de">
            <body>{children}</body>
        </html>
    );
}
