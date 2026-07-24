import './globals.css';
import QueryProvider from '@/components/providers/QueryProvider';

export const metadata = {
  title: 'Hiring Pipeline Tracker',
  description:
    'Board-first hiring pipeline tracker: per-job Kanban, per-interviewer feedback, and stage transitions for a small founding team.'
};

// Applies the persisted theme before paint so there's no light→dark flash ('system'/none follows the OS).
const THEME_SCRIPT = `try{var t=localStorage.getItem('theme');if(t==='dark'||((!t||t==='system')&&matchMedia('(prefers-color-scheme: dark)').matches))document.documentElement.classList.add('dark')}catch(e){}`;

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="flex min-h-screen w-full flex-col">
        <QueryProvider>{children}</QueryProvider>
      </body>
    </html>
  );
}
