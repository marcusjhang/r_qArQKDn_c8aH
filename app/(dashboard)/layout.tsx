// The Hiring Pipeline Tracker is board-first and full-bleed: it renders its
// own top bar, so the dashboard layout is just a pass-through wrapper.
export default function DashboardLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
