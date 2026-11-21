import { SettingsScreen } from '@/components/settings/settings-screen';

/** Admin settings: the business's own setup (Account sections live on /account). */
export default function AdminSettingsPage() {
  return <SettingsScreen scope="admin" />;
}
