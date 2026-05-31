import { component$, $, useStore, useTask$, useSignal } from "@builder.io/qwik";
import {
  type DocumentHead,
  useLocation,
  routeLoader$,
  useNavigate,
} from "@builder.io/qwik-city";
import { useJobs } from "~/contexts/jobs";
import { useAuth } from "~/contexts/auth";
import { useTranslate, type SupportedLanguage } from "~/contexts/i18n";
import { JobCard } from "~/components/jobs/job-card";
import { JobSearch } from "~/components/jobs/job-search";
import { useInfiniteScroll } from "~/hooks/use-infinite-scroll";
import { ScrollButtons } from "~/components/ui/scroll-buttons";
import type { JobFilters, JobListing, ApiPagination } from "~/contexts/jobs";
import { ItemListSchema, BreadcrumbSchema } from "~/components/seo/json-ld";
import { SITE_URL } from "~/constants";
import logger from "~/utils/logger";

// Import translations for server-side DocumentHead
import it from "~/locales/it.json";
import en from "~/locales/en.json";
import es from "~/locales/es.json";
import de from "~/locales/de.json";
import fr from "~/locales/fr.json";

const translations = { it, en, es, de, fr };

export const useJobsHeadLoader = routeLoader$(({ cookie }) => {
  const savedLang =
    (cookie.get("preferred-language")?.value as SupportedLanguage) || "it";
  const lang = savedLang in translations ? savedLang : "it";
  const t = translations[lang];
  return {
    title: t["meta.jobs_title"] || "Annunci di Lavoro - DevBoards.io",
    description:
      t["meta.jobs_description"] ||
      "Scopri le migliori opportunità di lavoro nel settore IT.",
  };
});

interface JobSearchFilters {
  query: string;
  seniority: string;
  availability: string;
  location: string;
  location_geo?: { lat: number; lng: number };
  remote: string;
  dateRange: string;
  salaryMin: string;
  minMatchScore: string;
}

export const useJobsListLoader = routeLoader$(async ({ url, env, cookie }) => {
  const query = url.searchParams.get("q") || "";
  const seniority = url.searchParams.get("seniority") || "";
  const remote = url.searchParams.get("remote") || "";
  const skills = url.searchParams.get("skills") || "";
  const languages = url.searchParams.get("languages") || "";
  const looseSeniority = url.searchParams.get("looseSeniority") || "";
  const salaryMin = url.searchParams.get("salary_min") || "";
  const availability = url.searchParams.get("availability") || "";
  const location = url.searchParams.get("location") || "";
  const dateRange = url.searchParams.get("dateRange") || "";
  const minMatchScore = url.searchParams.get("minMatchScore") || "";
  const lat = url.searchParams.get("lat") || "";
  const lng = url.searchParams.get("lng") || "";
  const page = 1;
  const limit = 10;

  const API_URL =
    env.get("INTERNAL_API_URL") ||
    env.get("PUBLIC_API_URL") ||
    "http://127.0.0.1:3001";
  const token = cookie.get("auth_token")?.value;

  const endpoint = new URL(`${API_URL}/jobs`);
  endpoint.searchParams.append("page", String(page));
  endpoint.searchParams.append("limit", String(limit));

  if (query) endpoint.searchParams.append("q", query);
  if (seniority) endpoint.searchParams.append("seniority", seniority);
  if (remote === "hybrid") {
    endpoint.searchParams.append("employment_type", "hybrid");
  } else if (remote) {
    endpoint.searchParams.append("remote", remote);
  }
  if (skills) endpoint.searchParams.append("skills", skills);
  if (languages) endpoint.searchParams.append("languages", languages);
  if (looseSeniority)
    endpoint.searchParams.append("looseSeniority", looseSeniority);
  if (salaryMin) endpoint.searchParams.append("salary_min", salaryMin);
  if (availability)
    endpoint.searchParams.append("employment_type", availability);
  if (location) endpoint.searchParams.append("location", location);
  if (dateRange) endpoint.searchParams.append("dateRange", dateRange);
  if (minMatchScore)
    endpoint.searchParams.append("minMatchScore", minMatchScore);
  if (lat) endpoint.searchParams.append("lat", lat);
  if (lng) endpoint.searchParams.append("lng", lng);
  if (lat && lng) endpoint.searchParams.append("radius_km", "50");

  try {
    const res = await fetch(endpoint.toString(), {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });

    if (!res.ok) throw new Error(`API error: ${res.status}`);

    const data = await res.json();
    return {
      success: true,
      jobs: data.success ? data.data.jobs : [],
      pagination: data.success
        ? data.data.pagination
        : { page: 1, total: 0, pages: 0 },
      filters: {
        query,
        remote:
          remote === "true" ? true : remote === "false" ? false : undefined,
        salaryMin: salaryMin ? Number(salaryMin) : undefined,
        seniority,
        skills: skills ? skills.split(",").filter(Boolean) : undefined,
        languages: languages ? languages.split(",").filter(Boolean) : undefined,
        looseSeniority: looseSeniority === "true",
        availability,
        location,
        dateRange,
        minMatchScore: minMatchScore ? Number(minMatchScore) : undefined,
        lat: lat ? Number(lat) : undefined,
        lng: lng ? Number(lng) : undefined,
      } as JobFilters,
    };
  } catch (err) {
    console.error("Failed to fetch jobs in SSR loader:", err);
    return {
      success: false,
      jobs: [],
      pagination: { page: 1, total: 0, pages: 0, limit: 10 },
      filters: {} as JobFilters,
    };
  }
});

export default component$(() => {
  const auth = useAuth();
  const t = useTranslate();
  const loc = useLocation();
  const jobsLoader = useJobsListLoader();
  const jobsState = useJobs();

  // Parse search state from URL for initial component state
  const urlParams = loc.url.searchParams;
  const initialQuery = urlParams.get("q") || "";
  const initialRemote = urlParams.get("remote") || "";
  const initialSeniority = urlParams.get("seniority") || "";
  const initialAvailability = urlParams.get("availability") || "";
  const initialLocation = urlParams.get("location") || "";
  const initialSalaryMinFromUrl = urlParams.get("salary_min") || "";
  const initialSalaryMin = initialSalaryMinFromUrl || "";
  const initialDateRange = urlParams.get("dateRange") || "";
  const initialMinMatchScore = urlParams.get("minMatchScore") || "";

  const hasInitialSearch = !!(
    initialQuery ||
    initialRemote ||
    initialSalaryMinFromUrl
  );

  const matchScores = useSignal<
    Record<
      string,
      { score: number; label: "excellent" | "good" | "fair" | "low" }
    >
  >({});

  // Signal to track if we should attempt a client-side load
  const shouldInitializeJobs = useSignal(true);

  // Check if personalized feed is active from URL params
  const hasPersonalizedParams =
    urlParams.has("skills") ||
    urlParams.has("languages") ||
    urlParams.has("looseSeniority");

  const state = useStore({
    displayedJobs: [] as JobListing[],
    page: 1,
    pageSize: 6,
    isLoading: false,
    hasNextPage: true,
    openComments: {} as Record<string, boolean>,
    showPersonalized: hasPersonalizedParams, // Sync with URL params
    searchFilters: hasInitialSearch
      ? ({
          query: initialQuery,
          remote:
            initialRemote === "true"
              ? true
              : initialRemote === "false"
                ? false
                : undefined,
          salaryMin: initialSalaryMin ? Number(initialSalaryMin) : undefined,
        } as JobFilters)
      : null,
    hasSearched: hasInitialSearch,
    shouldLoadJobs: true,
    totalJobsCount: 0,
  });

  // Sync context with loader data (SSR + Client Navigation)
  useTask$(async ({ track }) => {
    const data = track(() => jobsLoader.value);

    if (data.success) {
      // Immediately update local state from loader pagination
      state.totalJobsCount = data.pagination.total ?? 0;
      state.displayedJobs = [];

      // Sync the shared context state with server-fetched data (including empty results)
      if (typeof jobsState.setInitialData$ === "function") {
        try {
          await jobsState.setInitialData$(
            data.jobs,
            data.pagination as ApiPagination,
            data.filters,
          );
          shouldInitializeJobs.value = false; // Don't retry if SSR succeeded
        } catch (err) {
          console.error("Error invoking setInitialData$", err);
        }
      }
    } else {
      // Loader failed, enable client-side loading
      shouldInitializeJobs.value = true;
    }
  });

  // Auto-load jobs on client if SSR failed or returned empty
  useTask$(async ({ track }) => {
    const shouldInit = track(() => shouldInitializeJobs.value);

    // Wait for JobsContext QRL functions to be ready
    if (typeof window !== "undefined" && shouldInit) {
      const timeout = setTimeout(async () => {
        shouldInitializeJobs.value = false;

        if (
          jobsState.jobs.length === 0 &&
          typeof jobsState.fetchJobsPage$ === "function"
        ) {
          logger.info("Auto-loading jobs on client");
          try {
            await jobsState.fetchJobsPage$(1, undefined, false);
          } catch (err) {
            logger.error({ err }, "Failed to auto-load jobs");
          }
        }
      }, 100); // Small delay to ensure context is initialized

      return () => clearTimeout(timeout);
    }
  });

  const nav = useNavigate();

  // Sync showPersonalized with URL params
  useTask$(({ track }) => {
    const url = track(() => loc.url);
    const hasPersonalizedInUrl =
      url.searchParams.has("skills") ||
      url.searchParams.has("languages") ||
      url.searchParams.has("looseSeniority");
    state.showPersonalized = hasPersonalizedInUrl;
  });

  // Initial fetch logic removed - now handled by routeLoader$ and sync

  const loadMore = $(async () => {
    if (!state.isLoading && state.hasNextPage) {
      await jobsState.loadMoreJobs$();
    }
  });

  // Fetch match scores when authenticated and jobs are loaded
  useTask$(async ({ track }) => {
    const token = track(() => auth.token);
    const jobs = track(() => jobsState.jobs);

    if (token && jobs.length > 0) {
      const jobIds = jobs.map((job) => job.id);
      const scores = await jobsState.fetchBatchMatchScores$(jobIds);
      matchScores.value = scores;
    } else {
      matchScores.value = {};
    }
  });

  // Update displayed jobs from context (single source of truth for state.displayedJobs)
  useTask$(({ track }) => {
    track(() => jobsState.jobs);
    track(() => jobsState.pagination.hasMore);
    track(() => jobsState.pagination.totalJobs);
    track(() => jobsState.pagination.isLoading);
    const scores = track(() => matchScores.value);

    const allJobs = [...jobsState.jobs];
    const minScore = jobsState.currentFilters?.minMatchScore
      ? Number(jobsState.currentFilters.minMatchScore)
      : 0;

    // Apply minMatchScore client-side filter when scores are available
    if (minScore > 0 && Object.keys(scores).length > 0) {
      const filtered = allJobs.filter((job) => {
        const jobScore = scores[job.id]?.score || 0;
        return jobScore >= minScore;
      });
      state.displayedJobs = filtered;
      state.totalJobsCount = filtered.length;
      // When filtering client-side by match score, hide "load more" since
      // the backend doesn't know about this filter — all loaded jobs are
      // already evaluated and showing more pages won't help until they are
      // also scored.  We keep hasNextPage true only when the backend still
      // has pages AND we haven't filtered everything out, so infinite-scroll
      // can still fetch more candidates to evaluate.
      state.hasNextPage =
        jobsState.pagination.hasMore && filtered.length >= allJobs.length;
    } else {
      state.displayedJobs = allJobs;
      state.totalJobsCount = jobsState.pagination.totalJobs;
      state.hasNextPage = jobsState.pagination.hasMore;
    }

    state.isLoading = jobsState.pagination.isLoading;
  });

  const togglePersonalized = $(async () => {
    state.showPersonalized = !state.showPersonalized;
    state.page = 1;

    const url = new URL(loc.url);
    if (state.showPersonalized && auth.user) {
      // Valid employment types for filtering
      const validEmploymentTypes = [
        "full-time",
        "part-time",
        "contract",
        "freelance",
        "internship",
        "hybrid",
      ];
      // availability is now multi-select; the backend employment_type filter
      // takes a single value, so use the first selected type for the feed.
      const userAvailability = auth.user.availability?.[0]
        ?.toLowerCase()
        .replace("_", "-");

      if (auth.user.skills)
        url.searchParams.set("skills", Array.from(auth.user.skills).join(","));
      if (auth.user.languages)
        url.searchParams.set(
          "languages",
          Array.from(auth.user.languages).join(","),
        );
      if (auth.user.seniority)
        url.searchParams.set("seniority", auth.user.seniority.toLowerCase());
      if (userAvailability && validEmploymentTypes.includes(userAvailability))
        url.searchParams.set("availability", userAvailability);
      url.searchParams.set("looseSeniority", "true");
    } else {
      // Reset to all jobs but keep language filter if applicable
      url.searchParams.delete("skills");
      url.searchParams.delete("languages");
      url.searchParams.delete("seniority");
      url.searchParams.delete("availability");
      url.searchParams.delete("looseSeniority");
    }
    nav(url.pathname + url.search);
  });

  const toggleComments = $((jobId: string) => {
    state.openComments[jobId] = !state.openComments[jobId];
    if (state.openComments[jobId]) {
      jobsState.fetchComments$(jobId);
    }
  });

  const handleSearch = $(async (filters: JobSearchFilters) => {
    const url = new URL(loc.url);

    // Preserve personalized feed parameters if active
    const preserveSkills =
      state.showPersonalized && url.searchParams.has("skills");
    const preserveLanguages =
      state.showPersonalized && url.searchParams.has("languages");
    const preserveLooseSeniority =
      state.showPersonalized && url.searchParams.has("looseSeniority");
    const skillsParam = preserveSkills ? url.searchParams.get("skills") : null;
    const languagesParam = preserveLanguages
      ? url.searchParams.get("languages")
      : null;
    const looseSeniorityParam = preserveLooseSeniority
      ? url.searchParams.get("looseSeniority")
      : null;

    if (filters.query) url.searchParams.set("q", filters.query);
    else url.searchParams.delete("q");

    if (filters.seniority) url.searchParams.set("seniority", filters.seniority);
    else url.searchParams.delete("seniority");

    if (filters.location) url.searchParams.set("location", filters.location);
    else url.searchParams.delete("location");

    if (filters.salaryMin)
      url.searchParams.set("salary_min", filters.salaryMin);
    else url.searchParams.delete("salary_min");

    if (filters.dateRange) url.searchParams.set("dateRange", filters.dateRange);
    else url.searchParams.delete("dateRange");

    if (filters.minMatchScore)
      url.searchParams.set("minMatchScore", filters.minMatchScore);
    else url.searchParams.delete("minMatchScore");

    if (filters.location_geo) {
      url.searchParams.set("lat", String(filters.location_geo.lat));
      url.searchParams.set("lng", String(filters.location_geo.lng));
    } else {
      url.searchParams.delete("lat");
      url.searchParams.delete("lng");
    }

    // Map remote selection to API filters
    if (filters.remote === "remote") {
      url.searchParams.set("remote", "true");
    } else if (filters.remote === "office") {
      url.searchParams.set("remote", "false");
    } else if (filters.remote === "hybrid") {
      url.searchParams.set("remote", "hybrid");
    } else {
      url.searchParams.delete("remote");
    }

    if (filters.availability) {
      url.searchParams.set("availability", filters.availability);
    } else {
      url.searchParams.delete("availability");
    }

    // Restore personalized feed parameters if they were active
    if (preserveSkills && skillsParam)
      url.searchParams.set("skills", skillsParam);
    if (preserveLanguages && languagesParam)
      url.searchParams.set("languages", languagesParam);
    if (preserveLooseSeniority && looseSeniorityParam)
      url.searchParams.set("looseSeniority", looseSeniorityParam);

    nav(url.pathname + url.search);
  });

  // Infinite scroll setup
  const { ref: infiniteScrollRef } = useInfiniteScroll({
    loadMore$: loadMore,
  });

  // Jobs are loaded automatically through reactive calculations

  const canShowPersonalized =
    auth.isAuthenticated && auth.user?.profileCompleted && !state.hasSearched;

  return (
    <div class="mx-auto px-4 sm:px-6 lg:px-8 py-6 max-w-4xl">
      {/* Header */}
      <div class="mb-8">
        <h1 class="mb-4 font-bold text-gray-900 dark:text-white text-3xl">
          {t("jobs.title")}
        </h1>
        <BreadcrumbSchema
          items={[
            { name: "Home", url: `${SITE_URL}/` },
            {
              name: t("jobs.title"),
              url: `${SITE_URL}/jobs`,
            },
          ]}
        />

        {/* Search component */}
        <JobSearch
          onSearch$={handleSearch}
          initialLocation={
            initialLocation ||
            (auth.user?.workModes?.length === 1 &&
            auth.user?.workModes[0] === "remote"
              ? undefined
              : auth.user?.location || undefined)
          }
          initialGeo={
            auth.user?.workModes?.length === 1 &&
            auth.user?.workModes[0] === "remote"
              ? undefined
              : auth.user?.location_geo?.coordinates &&
                  auth.user.location_geo.coordinates.length >= 2
                ? {
                    lat: auth.user.location_geo.coordinates[1],
                    lng: auth.user.location_geo.coordinates[0],
                  }
                : undefined
          }
          initialQuery={initialQuery}
          initialSeniority={initialSeniority}
          initialAvailability={initialAvailability}
          initialRemote={
            initialRemote === "true"
              ? "remote"
              : initialRemote === "false"
                ? "office"
                : initialRemote === "hybrid"
                  ? "hybrid"
                  : ""
          }
          initialSalaryMin={initialSalaryMin}
          initialDateRange={initialDateRange}
          initialMinMatchScore={initialMinMatchScore}
          isAuthenticated={auth.isAuthenticated}
        />

        {/* Filter toggle for authenticated users */}
        {canShowPersonalized && (
          <div class="flex justify-between items-center mb-6">
            <div class="flex items-center space-x-4">
              <button
                onClick$={togglePersonalized}
                class={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  state.showPersonalized
                    ? "bg-brand-neon text-white dark:text-black font-bold font-mono uppercase"
                    : "bg-gray-200 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-700"
                }`}
              >
                {state.showPersonalized
                  ? t("jobs.personalized_feed")
                  : t("jobs.all_jobs")}
              </button>

              {state.showPersonalized && (
                <span class="font-mono text-gray-600 dark:text-gray-400 text-sm">
                  {t("jobs.skills_based_on")} {auth.user?.skills?.join(", ")}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Info for non-authenticated users */}
        {!auth.isAuthenticated && (
          <div class="bg-brand-neon/5 mb-6 p-4 border border-brand-neon/20 rounded-sm">
            <div class="flex">
              <div class="flex-shrink-0">
                <svg
                  class="w-5 h-5 text-brand-neon"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fill-rule="evenodd"
                    d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                    clip-rule="evenodd"
                  />
                </svg>
              </div>
              <div class="ml-3">
                <p class="text-gray-700 dark:text-gray-300 text-sm">
                  <a
                    href="/register"
                    class="font-bold text-green-700 dark:text-brand-neon hover:underline"
                  >
                    {t("common.register")}
                  </a>{" "}
                  {t("jobs.register_msg")}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Info for authenticated users without completed profile */}
        {auth.isAuthenticated && !auth.user?.profileCompleted && (
          <div class="bg-brand-neon/5 mb-6 p-4 border border-brand-neon/20 rounded-sm">
            <div class="flex">
              <div class="flex-shrink-0">
                <svg
                  class="w-5 h-5 text-brand-neon"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fill-rule="evenodd"
                    d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                    clip-rule="evenodd"
                  />
                </svg>
              </div>
              <div class="ml-3">
                <p class="text-gray-700 dark:text-gray-300 text-sm">
                  <a
                    href="/wizard"
                    class="font-bold text-green-700 dark:text-brand-neon hover:underline"
                  >
                    {t("profile.complete_profile")}
                  </a>{" "}
                  {t("jobs.complete_profile_msg")}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Results count */}
      {state.totalJobsCount > 0 && (
        <h2 class="mb-4 font-mono font-medium text-gray-800 dark:text-gray-300 text-sm">
          {state.hasNextPage
            ? t("jobs.showing_count").replace(
                "{count}",
                state.totalJobsCount.toString(),
              )
            : t("jobs.found_count").replace(
                "{count}",
                state.totalJobsCount.toString(),
              )}
        </h2>
      )}

      {/* Jobs list */}
      <div class="space-y-6">
        {state.displayedJobs.length > 0 && (
          <ItemListSchema
            name="Jobs Listing"
            items={state.displayedJobs.map((job, index) => ({
              name: job.title,
              url: `${SITE_URL}/jobs/detail/${job.id}`,
              description: job.company,
              position: index + 1,
            }))}
          />
        )}
        {state.displayedJobs.length === 0 && !state.isLoading ? (
          <div class="py-12 text-center">
            <div class="mx-auto mb-4 w-16 h-16 text-gray-500 dark:text-gray-400">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2-2v2m8 0V6a2 2 0 012 2v6a2 2 0 01-2 2H8a2 2 0 01-2-2V8a2 2 0 012-2V6"
                />
              </svg>
            </div>
            <h2 class="mb-2 font-medium text-gray-900 dark:text-white text-lg">
              {t("jobs.no_jobs")}
            </h2>
            <p class="text-gray-500 dark:text-gray-400">
              {state.showPersonalized
                ? t("jobs.no_jobs_personalized")
                : t("jobs.no_jobs_general")}
            </p>
          </div>
        ) : (
          state.displayedJobs.map((job) => (
            <div key={job.id}>
              <JobCard
                job={job}
                onToggleComments$={toggleComments}
                showComments={!!state.openComments[job.id]}
                matchScore={matchScores.value[job.id]}
              />
            </div>
          ))
        )}
      </div>

      {/* Loading spinner */}
      {state.isLoading && (
        <div class="flex justify-center py-8">
          <div class="flex items-center space-x-2">
            <svg
              class="mr-3 -ml-1 w-5 h-5 text-brand-neon animate-spin"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                class="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                stroke-width="4"
              />
              <path
                class="opacity-75"
                fill="currentColor"
                d="m4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            <span class="text-gray-600 dark:text-gray-400">
              {t("jobs.loading")}
            </span>
          </div>
        </div>
      )}

      {/* Infinite scroll trigger - always present but hidden when no more pages */}
      <div
        ref={infiniteScrollRef}
        class={`flex justify-center items-center h-20 transition-opacity duration-300 ${
          state.hasNextPage &&
          !state.isLoading &&
          state.displayedJobs.length > 0
            ? "opacity-100 pointer-events-auto"
            : "opacity-0 pointer-events-none"
        }`}
      >
        <div class="text-gray-600 dark:text-gray-500">
          <svg
            class="mx-auto mb-2 w-6 h-6"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M19 14l-7 7m0 0l-7-7m7 7V3"
            />
          </svg>
          <span class="text-sm">{t("jobs.scroll_more")}</span>
        </div>
      </div>

      {/* End of results */}
      {!state.hasNextPage && state.displayedJobs.length > 0 && (
        <div class="py-8 text-center">
          <div class="mb-2 text-gray-400 dark:text-gray-500">
            <svg
              class="mx-auto w-8 h-8"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>
          <p class="text-gray-500 dark:text-gray-400 text-sm">
            {t("jobs.end_results")}
          </p>
        </div>
      )}

      {/* Quick scroll buttons */}
      <ScrollButtons />
    </div>
  );
});

export const head: DocumentHead = ({ resolveValue }) => {
  const meta = resolveValue(useJobsHeadLoader);
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
