"use client";

/**
 * Re-provides next-intl's messages with the install's business words
 * filled in (`[[customer]]` → "Patient" / "Client" / ..., see
 * lib/vocabulary). Sits inside BrandingProvider because the words live
 * on the branding row; components keep calling `useTranslations()`.
 *
 * The server render and the first client render both see the default
 * branding, so they produce the same text (no hydration mismatch); the
 * cached / loaded branding then swaps in the install's own words.
 */
import { useMemo, type ReactNode } from "react";
import { NextIntlClientProvider, type AbstractIntlMessages } from "next-intl";
import { useBranding } from "@/hooks/use-branding";
import { DEFAULT_APP_NAME, applyVocabulary, resolveTerms } from "@/lib/vocabulary";

export function VocabularyIntlProvider({
  messages,
  locale,
  children,
}: {
  messages: AbstractIntlMessages;
  locale: string;
  children: ReactNode;
}) {
  const { branding } = useBranding();
  const vocabulary = branding.vocabulary;
  const appName = branding.title || DEFAULT_APP_NAME;
  const filled = useMemo(
    () => applyVocabulary(messages, resolveTerms(vocabulary, locale), appName),
    [messages, vocabulary, locale, appName],
  );
  return (
    <NextIntlClientProvider messages={filled} locale={locale}>
      {children}
    </NextIntlClientProvider>
  );
}
