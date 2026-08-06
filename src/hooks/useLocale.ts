import { useSyncExternalStore } from 'react';
import { subscribeLocale, getLocale, type Locale } from '../lib/i18n';

export function useLocale(): Locale {
  return useSyncExternalStore(
    subscribeLocale,
    getLocale,
    getLocale
  );
}
