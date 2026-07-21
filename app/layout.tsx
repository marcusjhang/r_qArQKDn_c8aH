import './globals.css';

export const metadata = {
  title: 'Next.js + Postgres Starter',
  description:
    'A full-stack Next.js starter with Postgres, Auth.js, and Drizzle ORM. Built for Lightsprint.'
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="flex min-h-screen w-full flex-col">{children}</body>
    </html>
  );
}
