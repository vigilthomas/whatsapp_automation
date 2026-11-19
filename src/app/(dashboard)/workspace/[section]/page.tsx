'use client';

import { useEffect } from 'react';
import { notFound, useParams, useRouter } from 'next/navigation';

import { PrimaryPanel } from '@/components/settings/settings-panel-head';
import { MenuPanel } from '@/components/settings/menu-panel';
import { isWorkspaceSection } from '@/components/settings/settings-sections';

/** Pages that moved into Settings → Workspace; old links forward there. */
const MOVED: Record<string, string> = {
  branding: '/settings?tab=branding',
  whatsapp: '/settings?tab=whatsapp',
  api: '/settings?tab=api',
};

/**
 * `/workspace/menu` — the Sidebar menu editor, linked from the foot of
 * the sidebar. Branding, WhatsApp and API keys now live in Settings →
 * Workspace; their old `/workspace/<section>` URLs forward there.
 */
export default function WorkspaceSectionPage() {
  const params = useParams<{ section: string }>();
  const router = useRouter();
  const moved = MOVED[params.section];
  useEffect(() => {
    if (moved) router.replace(moved);
  }, [moved, router]);

  if (moved) return null;
  if (!isWorkspaceSection(params.section)) notFound();

  // The panel's own head is the page title (its sidebar name).
  return (
    <div className="min-w-0">
      <PrimaryPanel>
        <MenuPanel />
      </PrimaryPanel>
    </div>
  );
}
