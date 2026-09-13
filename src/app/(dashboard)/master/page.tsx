import { redirect } from 'next/navigation';

// `/master` has no landing of its own — the sidebar group is a toggle,
// not a link — so a direct visit lands on the first sub-module.
export default function MasterIndexPage() {
  redirect('/master/clinics');
}
