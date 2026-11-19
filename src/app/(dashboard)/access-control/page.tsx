'use client';

import { PageHeading } from '@/components/layout/page-heading';
import { useTranslations } from 'next-intl';

import { AccessControlPanel } from '@/components/settings/access-control-panel';

/**
 * Access control as a top-level module. The panel itself is the same
 * one that used to sit under Settings → Workspace; only the route and
 * page heading live here. `/settings?tab=access` forwards to this page.
 */
export default function AccessControlPage() {
  const t = useTranslations('AccessControl');
  return (
    <div>
      <PageHeading fallback={t('pageTitle')} />
      <div className="mt-6 min-w-0">
        <AccessControlPanel />
      </div>
    </div>
  );
}
