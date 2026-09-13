'use client';

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
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          {t('pageTitle')}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('pageDesc')}</p>
      </div>
      <div className="mt-6 min-w-0">
        <AccessControlPanel />
      </div>
    </div>
  );
}
