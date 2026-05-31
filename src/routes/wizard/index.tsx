import { component$, $, useTask$, isBrowser } from "@builder.io/qwik";
import { useNavigate, routeLoader$ } from "@builder.io/qwik-city";
import type { DocumentHead } from "@builder.io/qwik-city";
import { useAuth } from "~/contexts/auth";
import { ProfileWizard } from "~/components/wizard/profile-wizard";
import type { WizardData } from "~/contexts/auth";
import { type SupportedLanguage } from "~/contexts/i18n";

// Import translations for server-side DocumentHead
import it from "~/locales/it.json";
import en from "~/locales/en.json";
import es from "~/locales/es.json";
import de from "~/locales/de.json";
import fr from "~/locales/fr.json";

const translations = { it, en, es, de, fr };

export const useWizardHeadLoader = routeLoader$(({ cookie }) => {
  const savedLang =
    (cookie.get("preferred-language")?.value as SupportedLanguage) || "it";
  const lang = savedLang in translations ? savedLang : "it";
  const t = translations[lang];
  return {
    title: t["meta.wizard_title"] || "Complete your profile - DevBoards.io",
    description:
      t["meta.wizard_description"] ||
      "Complete your professional profile on DevBoards.io",
  };
});

export default component$(() => {
  const auth = useAuth();
  const nav = useNavigate();

  // Use useTask$ for redirection
  useTask$(({ track }) => {
    track(() => auth.isAuthenticated);
    track(() => auth.user?.profileCompleted);

    if (isBrowser) {
      if (!auth.isAuthenticated) {
        void nav("/login");
      } else if (auth.user?.profileCompleted) {
        void nav("/");
      }
    }
  });

  const handleWizardComplete = $((data: WizardData) => {
    auth.updateProfileSignal.value = data;
  });

  const handleCancel = $(() => {
    nav("/");
  });

  if (!auth.isAuthenticated || auth.user?.profileCompleted) {
    return (
      <div class="flex justify-center items-center bg-gray-50 min-h-screen">
        <div class="border-brand-neon border-b rounded-full w-12 h-12 animate-spin"></div>
      </div>
    );
  }

  // Prepare initial data from user profile
  const initialData: Partial<WizardData> = {
    languages: auth.user?.languages || [],
    skills: auth.user?.skills || [],
    seniority: (auth.user?.seniority as "junior" | "mid" | "senior" | "") || "",
    availability: auth.user?.availability || [],
    workModes: auth.user?.workModes || [],
    salaryMin: auth.user?.salaryMin || 0,
    portfolioUrl: auth.user?.portfolioUrl || "",
  };

  return (
    <div class="bg-gray-50 py-12 min-h-screen">
      <ProfileWizard
        initialData={initialData}
        onComplete$={handleWizardComplete}
        onCancel$={handleCancel}
        token={auth.token || undefined}
        showCvStep={true}
      />
    </div>
  );
});

export const head: DocumentHead = ({ resolveValue }) => {
  const meta = resolveValue(useWizardHeadLoader);
  return {
    title: meta.title,
    meta: [
      {
        name: "description",
        content: meta.description,
      },
    ],
  };
};
