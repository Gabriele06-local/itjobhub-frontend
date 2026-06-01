import {
  createContextId,
  Slot,
  component$,
  useStore,
  useContext,
  useContextProvider,
  useTask$,
  noSerialize,
  isBrowser,
} from "@builder.io/qwik";
import logger from "../utils/logger";
import { getCookie, setCookie } from "../utils/cookies";

import it from "../locales/it.json";
import en from "../locales/en.json";
import es from "../locales/es.json";
import de from "../locales/de.json";
import fr from "../locales/fr.json";

export type SupportedLanguage = "it" | "en" | "es" | "de" | "fr";

interface I18nState {
  currentLanguage: SupportedLanguage;
}

export const I18nContext = createContextId<I18nState>("i18n-context");

// Translation dictionaries
const translations = {
  it,
  en,
  es,
  de,
  fr,
};
// Force HMR update to pick up new translation keys

interface I18nProviderProps {
  initialLanguage?: SupportedLanguage;
}

export const I18nProvider = component$((props: I18nProviderProps) => {
  const i18nState: I18nState = useStore<I18nState>({
    currentLanguage: props.initialLanguage || "it",
  });

  // Load saved language preference from cookies after hydration if not provided by server
  useTask$(() => {
    if (isBrowser && !props.initialLanguage) {
      const savedLang = getCookie("preferred-language") as SupportedLanguage;
      if (
        savedLang &&
        savedLang in translations &&
        savedLang !== i18nState.currentLanguage
      ) {
        logger.info({ savedLang }, "Loading saved language from cookies");
        i18nState.currentLanguage = savedLang;
      }
    }
  });

  useContextProvider(I18nContext, i18nState);

  return (
    <div data-lang={i18nState.currentLanguage} data-testid="i18n-root">
      <Slot />
    </div>
  );
});

export const useI18n = () => {
  return useContext(I18nContext);
};

/**
 * Switch the active language and persist it.
 *
 * Why a full reload instead of a reactive store mutation: the translate
 * function returned by {@link useTranslate} is wrapped in `noSerialize`, so on
 * the resumed client it deserialises to `undefined`. Mutating
 * `currentLanguage` reactively re-renders every `t()` consumer and invokes
 * that `undefined` value → "p1 is not a function", which aborts the re-render
 * and silently leaves the UI in the old language.
 *
 * The server already renders in the cookie's language (see `useAuthLoader` →
 * `I18nProvider initialLanguage`), so persisting the cookie and re-running the
 * SSR render is both correct and robust. Safe to call from a `$()` handler:
 * it only touches the pure `setCookie` helper and `window`.
 */
export const setLanguage = (language: SupportedLanguage): void => {
  if (isBrowser) {
    setCookie("preferred-language", language, 365); // Save for 1 year
    window.location.reload();
  }
};

export const translate = (key: string, language: SupportedLanguage): string => {
  const currentTranslations = translations[language];
  if (!currentTranslations) {
    logger.warn(
      { language },
      `No translations found for language: ${language}`,
    );
    return key;
  }
  const translation =
    currentTranslations[key as keyof typeof currentTranslations];
  if (!translation) {
    logger.warn(
      { key, language },
      `Translation missing for key "${key}" in language "${language}"`,
    );
  }
  return translation || key;
};

export const useTranslate = () => {
  const i18n = useContext(I18nContext);
  return noSerialize((key: string) => translate(key, i18n.currentLanguage)) as (
    key: string,
  ) => string;
};

// Helper function for interpolation
export const interpolate = (
  template: string,
  values: Record<string, string | number>,
): string => {
  return template.replace(/\{(\w+)\}/g, (match, key) => {
    return values[key]?.toString() || match;
  });
};
