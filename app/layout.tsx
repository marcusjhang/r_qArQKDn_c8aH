import './globals.css';

export const metadata = {
  title: 'Lightsprint Hiring — Pipeline Tracker',
  description:
    'Board-first hiring pipeline tracker: per-job Kanban, per-interviewer feedback, and stage transitions for a small founding team.'
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
