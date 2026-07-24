// Board-first, full-bleed: the tracker renders its own top bar, so this layout is a pass-through.
export default function DashboardLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
