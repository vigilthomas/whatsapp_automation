"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  CalendarDays,
  LayoutGrid,
  MessageSquare,
  Menu,
  Users,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { useTotalUnread } from "@/hooks/use-total-unread";
import type { ModuleId } from "@/lib/auth/module-access";

interface Tab {
  href: string;
  labelKey: string;
  icon: typeof LayoutGrid;
  module?: ModuleId;
}

const TABS: Tab[] = [
  { href: "/dashboard", labelKey: "home", icon: LayoutGrid },
  { href: "/appointments", labelKey: "appointments", icon: CalendarDays, module: "appointments" },
  { href: "/inbox", labelKey: "whatsapp", icon: MessageSquare, module: "inbox" },
  { href: "/contacts", labelKey: "patients", icon: Users, module: "contacts" },
];

/**
 * Bottom tab bar from the mobile reference (MobileHome): five 64px-tall
 * targets — Home, Appointments, WhatsApp (with unread dot), Patients and
 * "More", which opens the full sidebar drawer for everything else.
 * Hidden on lg+ where the sidebar is always on screen.
 */
export function MobileNav({ onOpenMenu }: { onOpenMenu: () => void }) {
  const t = useTranslations("MobileNav");
  const pathname = usePathname();
  const { sidebarModules } = useAuth();
  const unread = useTotalUnread();

  const tabs = TABS.filter((tab) => !tab.module || sidebarModules.includes(tab.module));

  const itemClass = (active: boolean) =>
    cn(
      "relative flex flex-col items-center justify-center gap-[3px] text-[10.5px] font-semibold",
      active ? "text-teal-700" : "text-muted-foreground/80",
    );

  return (
    <nav
      aria-label={t("label")}
      className="fixed inset-x-0 bottom-0 z-30 grid h-16 grid-cols-5 border-t border-border bg-card pt-1.5 pb-2 lg:hidden"
      style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}
    >
      {tabs.map((tab) => {
        const active =
          pathname === tab.href || (tab.href !== "/dashboard" && pathname.startsWith(tab.href));
        return (
          <Link key={tab.href} href={tab.href} className={itemClass(active)}>
            <tab.icon className="size-[22px]" strokeWidth={active ? 2 : 1.75} />
            {t(tab.labelKey)}
            {tab.href === "/inbox" && unread > 0 && !active && (
              <i className="absolute top-1 right-[22px] size-[7px] rounded-full border-2 border-card bg-[#E0533E]" />
            )}
          </Link>
        );
      })}
      <button type="button" onClick={onOpenMenu} className={itemClass(false)}>
        <Menu className="size-[22px]" strokeWidth={1.75} />
        {t("more")}
      </button>
    </nav>
  );
}
