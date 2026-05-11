import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { Meridians } from "./Meridians";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Meridians />
      <div className="app-root flex min-h-screen">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar />
          <main className="flex-1 px-12 pt-7 pb-16">{children}</main>
        </div>
      </div>
    </>
  );
}
