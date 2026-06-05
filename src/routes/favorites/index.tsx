import { component$, useTask$, useStore, useSignal } from "@builder.io/qwik";
import { type DocumentHead, routeLoader$ } from "@builder.io/qwik-city";
import { useJobs } from "~/contexts/jobs";
import { useAuth } from "~/contexts/auth";
import { JobCard } from "~/components/jobs/job-card";
import { useTranslate, type SupportedLanguage } from "~/contexts/i18n";

// Import translations for server-side DocumentHead
import it from "~/locales/it.json";
import en from "~/locales/en.json";
import es from "~/locales/es.json";
import de from "~/locales/de.json";
import fr from "~/locales/fr.json";

const translations = { it, en, es, de, fr };

export const useFavoritesHeadLoader = routeLoader$(({ cookie }) => {
  const savedLang =
    (cookie.get("preferred-language")?.value as SupportedLanguage) || "it";
  const lang = savedLang in translations ? savedLang : "it";
  const t = translations[lang];
  return {
    title: t["meta.favorites_title"] || "Favorites - DevBoards.io",
    description: t["meta.favorites_description"] || "Your favorite tech jobs",
  };
});

export default component$(() => {
  const jobsState = useJobs();
  const auth = useAuth();
  const t = useTranslate();

  const matchScores = useSignal<
    Record<
      string,
      { score: number; label: "excellent" | "good" | "fair" | "low" }
    >
  >({});

  const state = useStore({
    isLoading: true,
  });

  useTask$(async ({ track }) => {
    track(() => auth.isAuthenticated);
    if (!auth.isAuthenticated) {
      // Assuming 'nav' is available or needs to be imported/defined.
      // For now, I'll comment it out as it's not defined in the original code.
      // nav('/login');
      state.isLoading = false; // Ensure loading state is false if not authenticated
    } else {
      track(() => auth.token); // Keep tracking token for fetching favorites
      state.isLoading = true;
      await jobsState.fetchFavorites$();
      state.isLoading = false;
    }
  });

  // Fetch match scores when favorites are loaded
  useTask$(async ({ track }) => {
    const token = track(() => auth.token);
    const favorites = track(() => jobsState.favorites);

    if (token && favorites.length > 0) {
      const jobIds = favorites.map((job) => job.id);
      const scores = typeof jobsState.fetchBatchMatchScores$ === "function"
        ? await jobsState.fetchBatchMatchScores$(jobIds)
        : {};
      matchScores.value = scores;
    } else {
      matchScores.value = {};
    }
  });

  return (
    <div class="mx-auto sm:px-6 lg:px-8 py-6 container">
      <div class="px-4 sm:px-0 py-6">
        <h1 class="mb-6 font-bold text-gray-900 dark:text-gray-100 text-3xl">
          {t("nav.favorites")}
        </h1>

        {!auth.isAuthenticated ? (
          <div class="py-12 text-center">
            <p class="text-gray-600 dark:text-gray-300 text-lg">
              {t("auth.login_required")}
            </p>
            <a
              href="/login"
              class="inline-flex justify-center items-center bg-brand-neon hover:bg-brand-neon-hover mt-4 px-4 py-2 border border-transparent rounded-sm font-mono font-bold text-white dark:text-black text-base uppercase tracking-wide"
            >
              {t("home.login")}
            </a>
          </div>
        ) : state.isLoading ? (
          <div class="flex justify-center items-center py-12">
            <div class="border-brand-neon border-b rounded-full w-12 h-12 animate-spin"></div>
          </div>
        ) : jobsState.favorites.length === 0 ? (
          <div class="py-12 text-center">
            <p class="mb-4 text-gray-600 dark:text-gray-300 text-lg">
              {t("jobs.no_favorites")}
            </p>
            <a
              href="/jobs"
              class="font-medium text-brand-neon hover:text-brand-neon-hover"
            >
              {t("home.find_opportunities")}
            </a>
          </div>
        ) : (
          <div class="gap-6 grid jobs-grid md:grid-cols-2 lg:grid-cols-3">
            {jobsState.favorites.map((job) => (
              <JobCard
                key={job.id}
                job={job}
                matchScore={matchScores.value[job.id]}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
});

export const head: DocumentHead = ({ resolveValue }) => {
  const meta = resolveValue(useFavoritesHeadLoader);
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
