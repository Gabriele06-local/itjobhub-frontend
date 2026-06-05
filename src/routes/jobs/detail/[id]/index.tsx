import {
  component$,
  useStore,
  useTask$,
  isBrowser,
  $,
  useStylesScoped$,
  useSignal,
} from "@builder.io/qwik";
import { isServer } from "@builder.io/qwik/build";
import {
  routeLoader$,
  Link,
  useNavigate,
  type DocumentHead,
} from "@builder.io/qwik-city";

import logger from "~/utils/logger";
import { useJobs, processApiJob } from "~/contexts/jobs";
import type { MatchScore } from "~/types/models";
import { useI18n, translate } from "~/contexts/i18n";
import { useAuth } from "~/contexts/auth";
import { JobDetailContent } from "~/components/jobs/job-detail-content";
import styles from "./index.css?inline";
import { API_URL } from "~/constants";

// Server-side loader for the job data
export const useJobLoader = routeLoader$(async ({ params, cookie, status }) => {
  const id = params.id;
  if (!id || id === "undefined") {
    status(404);
    return null;
  }

  try {
    // Construct headers for authorization if token exists
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    const tokenCookie = cookie.get("auth_token");
    if (tokenCookie?.value) {
      headers["Authorization"] = `Bearer ${tokenCookie.value}`;
    }

    // We use fetch directly here to ensure it works in the loader environment (node/bun)
    // and we avoid potential circular dependencies or client-side logic in 'request'
    const response = await fetch(`${API_URL}/jobs/${id}`, { headers });

    if (!response.ok) {
      if (response.status === 404) {
        status(404);
        return null;
      }
      throw new Error(`Failed to fetch job: ${response.status}`);
    }

    const result = await response.json();
    if (result.success && result.data) {
      const job = processApiJob(result.data);

      // Optional: Fetch match score if authenticated (server-side)
      // Note: This adds latency. It might be better to keep match score as client-side
      // progressive enhancement if it's slow, but let's try to get it here for SEO/SSR value.
      let matchScore: MatchScore | null = null;
      if (tokenCookie?.value && job) {
        try {
          const scoreResponse = await fetch(`${API_URL}/jobs/${job.id}/match`, {
            headers,
          });
          if (scoreResponse.ok) {
            const scoreResult = await scoreResponse.json();
            if (scoreResult.success) {
              matchScore = scoreResult.data;
            }
          }
        } catch (e) {
          console.error("Failed to fetch match score in loader", e);
          // Non-critical, continue without score
        }
      }

      // Daily application quota (authenticated only) — lets us disable the
      // Apply button preventively once the user hits the per-day limit.
      let applyQuota: {
        todayCount: number;
        limit: number;
        remaining: number;
      } | null = null;
      if (tokenCookie?.value) {
        try {
          const quotaRes = await fetch(`${API_URL}/jobs/me/apply-quota`, {
            headers,
          });
          if (quotaRes.ok) {
            const quotaResult = await quotaRes.json();
            if (quotaResult.success) {
              applyQuota = quotaResult.data;
            }
          }
        } catch (e) {
          console.error("Failed to fetch apply quota in loader", e);
        }
      }

      return { job, matchScore, applyQuota };
    }

    return null;
  } catch (error) {
    console.error("Error in useJobLoader:", error);
    status(500);
    return null;
  }
});

// Per-job SEO: dynamic <title>/description so each posting ranks on its own
// (the RouterHead derives canonical + og/twitter from these). Previously the
// detail page had no head() and inherited the generic site title.
export const head: DocumentHead = ({ resolveValue }) => {
  const data = resolveValue(useJobLoader);
  const job = data?.job;
  if (!job) {
    return { title: "DevBoards.io" };
  }
  const plain = (job.description || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const where = job.remote ? "Remote" : job.location || "";
  const context = [job.company, where].filter(Boolean).join(" · ");
  const description = (plain ? plain.slice(0, 155) : context).trim();
  const title = `${job.title}${job.company ? ` - ${job.company}` : ""} | DevBoards.io`;
  const meta: { name?: string; property?: string; content: string }[] = [
    { name: "description", content: description },
    { property: "og:title", content: title },
    { property: "og:description", content: description },
  ];
  if (job.companyLogo) {
    meta.push({ property: "og:image", content: job.companyLogo });
  }
  return { title, meta };
};

export default component$(() => {
  useStylesScoped$(styles);
  const jobsContext = useJobs();
  const auth = useAuth();
  const i18n = useI18n();
  const nav = useNavigate();

  // Consume the loader data
  const jobSignal = useJobLoader();

  const state = useStore({
    job: jobSignal.value?.job || null,
    matchScore: jobSignal.value?.matchScore || null,
    isDeleting: false,
    // null => unknown/anonymous (no per-day limit). Number => applications left today.
    applyRemaining:
      (jobSignal.value as { applyQuota?: { remaining: number } } | null)
        ?.applyQuota?.remaining ?? null,
    applyLimit:
      (jobSignal.value as { applyQuota?: { limit: number } } | null)?.applyQuota
        ?.limit ?? 3,
  });

  const showDeleteModal = useSignal(false);
  const refreshSignal = useSignal(0);

  // Reactive updates for specific fields without full page reload
  // Kept for interactive updates (e.g. after editing profile or liking)
  useTask$(async ({ track }) => {
    track(() => refreshSignal.value);
    track(() => auth.user?.skills);
    track(() => auth.user?.seniority);
    track(() => auth.user?.location);
    track(() => auth.user?.workModes);

    if (isServer) return;

    const jobId = state.job?.id;
    if (!jobId) return;

    // Fetch updated job data (e.g. for Trust Score)
    const updatedJob = await jobsContext.fetchJobById$(jobId);
    if (updatedJob) {
      state.job = updatedJob;
    }

    // Fetch updated match score
    if (auth.token && updatedJob) {
      const scoreData = typeof jobsContext.fetchJobMatchScore$ === "function"
        ? await jobsContext.fetchJobMatchScore$(updatedJob.id)
        : null;
      state.matchScore = scoreData;
    }
  });

  const handleToggleFavorite = $(async () => {
    if (!auth.isAuthenticated || !state.job) return;
    await jobsContext.toggleFavorite$(state.job.id);

    if (state.job) {
      state.job.is_favorite = !state.job.is_favorite;
    }
  });

  const handleDeleteJob = $(async () => {
    if (!state.job || !auth.token) return;
    state.isDeleting = true;
    try {
      // Use fetch here or the jobsContext helper if available, but manual request is safer for custom logic
      // We'll reuse the pattern from before but ensure imports are clean
      const res = await fetch(`${API_URL}/jobs/${state.job.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${auth.token}` },
      });

      if (res.ok) {
        await nav("/jobs");
      } else {
        logger.error({ status: res.status }, "Failed to delete job");
      }
    } catch (e) {
      logger.error({ e }, "Error deleting job");
    } finally {
      state.isDeleting = false;
      showDeleteModal.value = false;
    }
  });

  const handleApplyClick = $(async () => {
    if (!state.job) return;
    const res = await jobsContext.trackJobInteraction$(state.job.id, "APPLY");
    if (res.limitReached) {
      // Server rejected it (429): mark the quota exhausted so the button
      // disables and the message shows. Do NOT bump the counter.
      state.applyRemaining = 0;
    } else if (res.ok) {
      state.job.clicks_count = (state.job.clicks_count || 0) + 1;
      if (state.applyRemaining !== null && state.applyRemaining > 0) {
        state.applyRemaining = state.applyRemaining - 1;
      }
    }
  });

  const handleAddSkill = $(async (skill: string) => {
    if (!auth.isAuthenticated || !auth.user || !auth.token) return;

    const currentSkills = auth.user.skills || [];
    if (currentSkills.includes(skill)) return;

    const newSkills = [...currentSkills, skill];

    // Use the existing updateProfileSignal to update skills
    auth.updateProfileSignal.value = {
      languages: auth.user.languages || [],
      skills: newSkills,
      seniority: auth.user.seniority || "",
      availability: auth.user.availability || [],
      workModes: auth.user.workModes || [],
      salaryMin: auth.user.salaryMin || 0,
    };
  });

  // Track VIEW Interaction at top level of component
  useTask$(({ track }) => {
    const jobId = track(() => state.job?.id);
    if (jobId && isBrowser) {
      jobsContext.trackJobInteraction$(jobId, "VIEW");
      // Optimistic local update
      if (state.job) {
        state.job.views_count = (state.job.views_count || 0) + 1;
      }
    }
  });

  const handleReactionComplete = $(() => {
    refreshSignal.value++;
  });

  return (
    <div class="container">
      <Link
        href="/jobs"
        class="group flex items-center gap-2 hover:bg-brand-neon/10 dark:hover:bg-brand-neon/5 mb-8 -ml-3 px-3 py-2 rounded-xl w-fit font-bold text-gray-600 hover:text-brand-neon dark:hover:text-brand-neon dark:text-white text-sm transition-all duration-300"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.5"
          stroke-linecap="round"
          stroke-linejoin="round"
          class="transition-transform group-hover:-translate-x-1.5 duration-300"
        >
          <path d="m15 18-6-6 6-6" />
        </svg>
        <span>{translate("job.back_to_search", i18n.currentLanguage)}</span>
      </Link>

      {!state.job ? (
        <div class="notFoundCard">
          <div class="notFoundIcon">🔍</div>
          <h2 class="notFoundTitle">
            {translate("job.not_found", i18n.currentLanguage)}
          </h2>
          <p class="notFoundDesc">
            {translate("job.not_found_description", i18n.currentLanguage)}
          </p>
          <Link href="/jobs" class="notFoundButton">
            {translate("job.back_to_search", i18n.currentLanguage)}
          </Link>
        </div>
      ) : (
        <JobDetailContent
          job={state.job}
          matchScore={state.matchScore}
          isDeleting={state.isDeleting}
          showDeleteModal={showDeleteModal}
          onToggleFavorite$={handleToggleFavorite}
          onApplyClick$={handleApplyClick}
          onReactionComplete$={handleReactionComplete}
          onDeleteJob$={handleDeleteJob}
          onAddSkill$={handleAddSkill}
          applyDisabled={
            state.applyRemaining !== null && state.applyRemaining <= 0
          }
          applyLimit={state.applyLimit}
        />
      )}
    </div>
  );
});
