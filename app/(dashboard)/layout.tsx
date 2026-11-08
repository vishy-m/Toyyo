import { DashboardShell } from "@/components/dashboard/DashboardShell";

// Shared by every dashboard page. A layout survives navigation, so the 3D stage inside the shell
// stays mounted and the car moves between pages instead of reloading.
export default function DashboardLayout({ children }: LayoutProps<"/">) {
  return <DashboardShell>{children}</DashboardShell>;
}
