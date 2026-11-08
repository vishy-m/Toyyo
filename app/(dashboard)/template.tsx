import { PageEnter } from "@/components/stage/PageEnter";

// A template re-mounts on every navigation (a layout does not), so each page's content can make
// its entrance while the persistent car flies to the page's shot.
export default function DashboardTemplate({ children }: { children: React.ReactNode }) {
  return <PageEnter>{children}</PageEnter>;
}
