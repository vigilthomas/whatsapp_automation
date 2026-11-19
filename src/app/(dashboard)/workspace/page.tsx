import { redirect } from 'next/navigation';

// `/workspace` has no landing of its own — the sidebar group is a toggle,
// not a link — so a direct visit lands on the WhatsApp connection,
// which now lives in Settings → Workspace.
export default function WorkspaceIndexPage() {
  redirect('/settings?tab=whatsapp');
}
