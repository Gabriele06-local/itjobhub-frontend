import {
  component$,
  useTask$,
  useSignal,
  useStylesScoped$,
} from "@builder.io/qwik";
import type { DocumentHead } from "@builder.io/qwik-city";
import { routeLoader$ } from "@builder.io/qwik-city";
import { useAuth } from "~/contexts/auth";
import { type SupportedLanguage } from "~/contexts/i18n";
import { useJobs } from "~/contexts/jobs";
import {
  OrganizationSchema,
  WebSiteSchema,
  BreadcrumbSchema,
} from "~/components/seo/json-ld";
import {
  HeroSection,
  StatsSection,
  FeaturedJobs,
  ValueProps,
  CTASection,
} from "~/components/home";
import styles from "./index.css?inline";

// Import translations for server-side DocumentHead
import it from "~/locales/it.json";
import en from "~/locales/en.json";
import es from "~/locales/es.json";
import de from "~/locales/de.json";
import fr from "~/locales/fr.json";

const translations = { it, en, es, de, fr };

import { SITE_URL } from "~/constants";

// Route loader to get translated meta for DocumentHead
export const useIndexHeadLoader = routeLoader$(({ cookie }) => {
  const savedLang =
    (cookie.get("preferred-language")?.value as SupportedLanguage) || "it";
  const lang = savedLang in translations ? savedLang : "it";
  const t = translations[lang];
  return {
    title: t["meta.index_title"] || "DevBoards.io - Find your ideal IT job",
    description:
      t["meta.index_description"] ||
      "The platform to find your dream job in the IT world.",
  };
});

export default component$(() => {
  useStylesScoped$(styles);
  const auth = useAuth();
  // const t = useTranslate();
  const jobsState = useJobs();
  const topSkills = useSignal<{ skill: string; count: number }[]>([]);
  const matchScores = useSignal<
    Record<
      string,
      { score: number; label: "excellent" | "good" | "fair" | "low" }
    >
  >({});

  // Fetch jobs and stats
  useTask$(async () => {
    const promises = [];
    if (jobsState.jobs.length === 0) {
      promises.push(jobsState.fetchJobsPage$(1));
    }
    promises.push(
      jobsState.fetchTopSkills$(10, new Date().getFullYear()).then((skills) => {
        topSkills.value = skills;
      }),
    );
    await Promise.all(promises);
  });

  // Fetch match scores when authenticated and jobs are loaded
  useTask$(async ({ track }) => {
    const token = track(() => auth.token);
    const jobs = track(() => jobsState.jobs);

    if (token && jobs.length > 0) {
      // Get scores for the first 3 jobs (displayed on homepage)
      const recentJobIds = jobs.slice(0, 3).map((job) => job.id);
      const scores = typeof jobsState.fetchBatchMatchScores$ === "function"
        ? await jobsState.fetchBatchMatchScores$(recentJobIds)
        : {};
      matchScores.value = scores;
    } else {
      matchScores.value = {};
    }
  });

  const recentJobs = jobsState.jobs.slice(0, 3); // Top 3 jobs

  return (
    <div class="page-wrapper">
      {/* JSON-LD Structured Data for SEO */}
      <OrganizationSchema />
      <WebSiteSchema />
      <BreadcrumbSchema items={[{ name: "Home", url: SITE_URL }]} />

      <HeroSection topSkills={topSkills} />
      <StatsSection topSkills={topSkills} />
      <FeaturedJobs
        jobs={recentJobs}
        matchScores={matchScores.value}
        isLoading={jobsState.jobs.length === 0}
      />
      <ValueProps />
      <CTASection isAuthenticated={auth.isAuthenticated} />
    </div>
  );
});

export const head: DocumentHead = ({ resolveValue }) => {
  const meta = resolveValue(useIndexHeadLoader);
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
