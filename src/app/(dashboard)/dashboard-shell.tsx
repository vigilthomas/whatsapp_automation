"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { moduleForPath } from "@/lib/auth/module-access";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { AccountAccessAlert } from "@/components/layout/account-access-alert";
import { PresenceHeartbeat } from "@/components/presence/presence-heartbeat";
import { ConfirmProvider } from "@/components/ui/confirm-dialog";

// Auth-gated dashboard shell. Extracted from the layout so the layout
// itself can stay a server component and export metadata (noindex) —
// client components can't export Next's metadata object.

// Settings → Access control: a role denied a module gets its sidebar
// entry hidden, but a bookmarked or hand-typed URL still resolves the
// route — so bounce it to /dashboard. Runs only once the profile has
// settled; before that `canAccessModule` answers "yes" for everything
// and we'd otherwise flash the page before the redirect.
function ModuleGuard({ children }: { children: React.ReactNode }) {
  const { profileLoading, canAccessModule } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  const gated = moduleForPath(pathname);
  const denied = !profileLoading && gated !== null && !canAccessModule(gated);

  useEffect(() => {
    if (denied) router.replace("/dashboard");
  }, [denied, router]);

  if (denied) return null;
  return <>{children}</>;
}

function DashboardShellInner({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  // Sidebar drawer state — only used on mobile. On lg+ the sidebar is
  // always visible and this stays at `false` (ignored by the component).
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const closeSidebar = useCallback(() => setSidebarOpen(false), []);

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login");
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Reports this tab's online/away presence once we know a user is
          signed in. Headless — renders nothing. */}
      <PresenceHeartbeat />
      <Sidebar open={sidebarOpen} onClose={closeSidebar} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header onOpenSidebar={() => setSidebarOpen(true)} />
        {/* Thinner horizontal padding on mobile so cards have room to breathe. */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6">
          {/* Above every page: writes are being rejected and here's why.
              Renders nothing unless the account/role failed to resolve. */}
          <AccountAccessAlert />
          <ModuleGuard>{children}</ModuleGuard>
        </main>
      </div>
    </div>
  );
}

export function DashboardShell({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      {/* One confirmation modal for the whole app — see useConfirm(). */}
      <ConfirmProvider>
        <DashboardShellInner>{children}</DashboardShellInner>
      </ConfirmProvider>
    </AuthProvider>
  );
}
