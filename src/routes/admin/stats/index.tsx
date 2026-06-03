import { component$, useStore, useTask$, $, isBrowser } from "@builder.io/qwik";
import { type DocumentHead, routeLoader$ } from "@builder.io/qwik-city";
import { useAuth } from "~/contexts/auth";
import {
  useTranslate,
  translate,
  useI18n,
  type SupportedLanguage,
} from "~/contexts/i18n";

// Import translations for server-side DocumentHead
import it from "~/locales/it.json";
import en from "~/locales/en.json";
import es from "~/locales/es.json";
import de from "~/locales/de.json";
import fr from "~/locales/fr.json";

const translations = { it, en, es, de, fr };

export const useAdminStatsHeadLoader = routeLoader$(({ cookie }) => {
  const savedLang =
    (cookie.get("preferred-language")?.value as SupportedLanguage) || "it";
  const lang = savedLang in translations ? savedLang : "it";
  const t = translations[lang];
  return {
    title: t["meta.admin_stats_title"] || "Admin Dashboard - DevBoards.io",
    description: "Admin statistics and analytics dashboard",
  };
});
import { request } from "../../../utils/api";
import { LineChart } from "~/components/admin/charts/line-chart";
import { JobMap } from "~/components/admin/charts/job-map";
import { API_URL } from "~/constants";

// ... interfaces ... (same)
interface Stats {
  overview: {
    users: { total: number; new: number };
    jobs: { total: number; new: number };
    companies: { total: number; new: number };
    engagement: { comments: number; likes: number };
  };
  charts: {
    seniority: { label: string; value: number }[];
    employmentType: { label: string; value: number }[];
    trends: { label: string; value: number }[];
    jobsBySource: { label: string; value: number }[];
    jobsByCity: { label: string; value: number }[];
    jobsByLanguage: { label: string; value: number }[];
    topSkills: { label: string; value: number }[];
    locations: {
      id: string;
      title: string;
      companyName: string;
      companyLogo: string | null;
      salary: string | null;
      type: string | null;
      lat: number;
      lng: number;
    }[];
  };
}

export default component$(() => {
  const auth = useAuth();
  const i18n = useI18n();
  const lang = i18n.currentLanguage;
  const t = useTranslate();

  const state = useStore({
    stats: null as Stats | null,
    isLoading: true,
    error: "",
    selectedMonth: 0, // 0 means Total
    selectedYear: 0, // 0 means Total
  });

  const fetchStats = $(async () => {
    try {
      state.isLoading = true;
      const url = new URL(`${API_URL}/admin/stats`);
      if (state.selectedYear > 0) {
        url.searchParams.append("year", state.selectedYear.toString());
      }
      if (state.selectedMonth > 0) {
        url.searchParams.append("month", state.selectedMonth.toString());
      }

      const response = await request(url.toString(), {
        headers: {
          Authorization: `Bearer ${auth.token}`,
        },
      });

      if (!response.ok) {
        throw new Error(translate("admin.fetch_error", i18n.currentLanguage));
      }

      const data = await response.json();
      if (data.success) {
        state.stats = data.data;
      } else {
        state.error = data.message;
      }
    } catch (err) {
      if (err instanceof Error) {
        state.error = err.message;
      } else {
        state.error = String(err);
      }
    } finally {
      state.isLoading = false;
    }
  });

  // React to month/year changes
  useTask$(async ({ track }) => {
    track(() => state.selectedMonth);
    track(() => state.selectedYear);

    if (
      auth.isAuthenticated &&
      (auth.user?.role === "admin" || auth.user?.role === "super_admin")
    ) {
      await fetchStats();
    }
  });

  // Check authentication and role on the client
  useTask$(({ track }) => {
    const isAuthenticated = track(() => auth.isAuthenticated);
    const user = track(() => auth.user);

    if (isBrowser) {
      if (isAuthenticated && user) {
        if (user.role !== "admin" && user.role !== "super_admin") {
          window.location.href = "/";
        }
      } else {
        const storageToken = localStorage.getItem("auth_token");
        if (!storageToken) {
          window.location.href = "/login";
        }
      }
    }
  });

  if (state.isLoading) {
    return (
      <div class="flex justify-center items-center min-h-[60vh]">
        <div class="border-brand-neon border-b rounded-full w-12 h-12 animate-spin"></div>
      </div>
    );
  }

  if (state.error) {
    return (
      <div class="mx-auto px-4 py-12 max-w-7xl">
        <div class="bg-red-50 dark:bg-red-900/20 p-6 border border-red-200 dark:border-red-800 rounded-lg text-center">
          <h2 class="mb-2 font-bold text-red-800 dark:text-red-300 text-lg">
            {t("common.error")}
          </h2>
          <p class="text-red-700 dark:text-red-400">{state.error}</p>
        </div>
      </div>
    );
  }

  const stats = state.stats!;

  return (
    <div class="mx-auto px-4 sm:px-6 lg:px-8 py-8 max-w-7xl">
      <div class="flex md:flex-row flex-col justify-between md:items-end gap-4 mb-8">
        <div>
          <h1 class="font-bold text-gray-900 dark:text-white text-3xl">
            {t("admin.dashboard")}
          </h1>
          <p class="mt-2 text-gray-600 dark:text-gray-400">
            {t("admin.stats_subtitle")}
          </p>
        </div>

        <div class="flex items-center gap-3">
          {state.selectedYear > 0 && (
            <select
              value={state.selectedMonth}
              onChange$={(e: Event) =>
                (state.selectedMonth = parseInt(
                  (e.target as HTMLSelectElement).value,
                ))
              }
              class="bg-white dark:bg-gray-800 px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg outline-none focus:ring-2 focus:ring-brand-neon dark:text-white text-sm"
              data-testid="admin-stats-month-select"
            >
              <option value="0">{t("admin.total")}</option>
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <option key={m} value={m}>
                  {new Date(2000, m - 1).toLocaleString(
                    lang === "it" ? "it-IT" : "en-US",
                    { month: "long" },
                  )}
                </option>
              ))}
            </select>
          )}
          <select
            value={state.selectedYear}
            onChange$={(e: Event) =>
              (state.selectedYear = parseInt(
                (e.target as HTMLSelectElement).value,
              ))
            }
            class="bg-white dark:bg-gray-800 px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg outline-none focus:ring-2 focus:ring-brand-neon dark:text-white text-sm"
            data-testid="admin-stats-year-select"
          >
            <option value="0">{t("admin.all_time")}</option>
            {Array.from(
              { length: 5 },
              (_, i) => new Date().getFullYear() - i,
            ).map((y) => (
              <option key={y} value={y.toString()}>
                {y.toString()}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Stats Cards */}
      <div class="gap-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 mb-8">
        {/* Users Card */}
        <div
          class="bg-white dark:bg-gray-800 shadow-sm p-6 border border-gray-100 dark:border-gray-700 rounded-xl"
          data-testid="admin-stats-users-card"
        >
          <div class="flex justify-between items-center mb-4">
            <span class="bg-blue-50 dark:bg-blue-900/30 p-2 rounded-lg text-blue-600 dark:text-blue-400">
              <svg
                class="w-6 h-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
                />
              </svg>
            </span>
            <span class="bg-green-50 dark:bg-green-900/30 px-2 py-1 rounded font-semibold text-green-600 text-xs">
              {t("admin.new_growth").replace(
                "{count}",
                stats.overview.users.new.toString(),
              )}
            </span>
          </div>
          <h3 class="font-medium text-gray-500 dark:text-gray-400 text-sm">
            {t("admin.total_users")}
          </h3>
          <p
            class="font-bold text-gray-900 dark:text-white text-2xl"
            data-testid="admin-stats-total-users"
          >
            {stats.overview.users.total}
          </p>
        </div>

        {/* Jobs Card */}
        <div
          class="bg-white dark:bg-gray-800 shadow-sm p-6 border border-gray-100 dark:border-gray-700 rounded-xl"
          data-testid="admin-stats-jobs-card"
        >
          <div class="flex justify-between items-center mb-4">
            <span class="bg-brand-neon/10 dark:bg-brand-neon/20 p-2 rounded-lg text-brand-neon dark:text-brand-neon">
              <svg
                class="w-6 h-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2-2v2m8 0V6a2 2 0 012 2v6a2 2 0 01-2 2H8a2 2 0 01-2-2V8a2 2 0 012-2V6"
                />
              </svg>
            </span>
            <span class="bg-green-50 dark:bg-green-900/30 px-2 py-1 rounded font-semibold text-green-600 text-xs">
              {t("admin.new_growth").replace(
                "{count}",
                stats.overview.jobs.new.toString(),
              )}
            </span>
          </div>
          <h3 class="font-medium text-gray-500 dark:text-gray-400 text-sm">
            {t("admin.active_jobs")}
          </h3>
          <p
            class="font-bold text-gray-900 dark:text-white text-2xl"
            data-testid="admin-stats-active-jobs"
          >
            {stats.overview.jobs.total}
          </p>
        </div>

        {/* Companies Card */}
        <div
          class="bg-white dark:bg-gray-800 shadow-sm p-6 border border-gray-100 dark:border-gray-700 rounded-xl"
          data-testid="admin-stats-companies-card"
        >
          <div class="flex justify-between items-center mb-4">
            <span class="bg-purple-50 dark:bg-purple-900/30 p-2 rounded-lg text-purple-600 dark:text-purple-400">
              <svg
                class="w-6 h-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                />
              </svg>
            </span>
            <span class="bg-green-50 dark:bg-green-900/30 px-2 py-1 rounded font-semibold text-green-600 text-xs">
              {t("admin.new_growth").replace(
                "{count}",
                stats.overview.companies.new.toString(),
              )}
            </span>
          </div>
          <h3 class="font-medium text-gray-500 dark:text-gray-400 text-sm">
            {t("admin.companies")}
          </h3>
          <p
            class="font-bold text-gray-900 dark:text-white text-2xl"
            data-testid="admin-stats-companies"
          >
            {stats.overview.companies.total}
          </p>
        </div>

        {/* Engagement Card */}
        <div
          class="bg-white dark:bg-gray-800 shadow-sm p-6 border border-gray-100 dark:border-gray-700 rounded-xl"
          data-testid="admin-stats-engagement-card"
        >
          <div class="flex justify-between items-center mb-4">
            <span class="bg-pink-50 dark:bg-pink-900/30 p-2 rounded-lg text-pink-600 dark:text-pink-400">
              <svg
                class="w-6 h-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
                />
              </svg>
            </span>
          </div>
          <h3 class="font-medium text-gray-500 dark:text-gray-400 text-sm">
            {t("admin.engagement")}
          </h3>
          <div class="flex items-center gap-4">
            <p
              class="flex items-center font-bold text-gray-900 dark:text-white text-2xl"
              data-testid="admin-stats-comments"
            >
              {stats.overview.engagement.comments}{" "}
              <span class="ml-1 font-normal text-xs">
                {t("admin.comments")}
              </span>
            </p>
            <p
              class="flex items-center font-bold text-gray-900 dark:text-white text-2xl"
              data-testid="admin-stats-likes"
            >
              {stats.overview.engagement.likes}{" "}
              <span class="ml-1 font-normal text-xs">{t("admin.likes")}</span>
            </p>
          </div>
        </div>
      </div>

      {/* Job Map Section */}
      <div class="bg-white dark:bg-gray-800 shadow-sm mb-8 p-6 border border-gray-100 dark:border-gray-700 rounded-xl">
        <h3 class="mb-6 font-bold text-gray-900 dark:text-white text-lg">
          {t("admin.map_title")}
        </h3>
        <div class="w-full">
          {stats.charts.locations && stats.charts.locations.length > 0 ? (
            <JobMap jobs={stats.charts.locations} />
          ) : (
            <div class="flex justify-center items-center bg-gray-50 dark:bg-gray-700 rounded-lg h-64">
              <p class="text-gray-500">{t("admin.no_data")}</p>
            </div>
          )}
        </div>
      </div>

      {/* Charts Section */}
      <div class="bg-white dark:bg-gray-800 shadow-sm mb-8 p-6 border border-gray-100 dark:border-gray-700 rounded-xl">
        <h3 class="mb-6 font-bold text-gray-900 dark:text-white text-lg">
          {t("admin.job_trend")} -{" "}
          {state.selectedYear || new Date().getFullYear()}
        </h3>
        <div class="w-full">
          <LineChart
            data={stats.charts.trends.map((d) => ({
              ...d,
              label: new Date(2000, parseInt(d.label), 1).toLocaleString(
                lang === "it" ? "it-IT" : "en-US",
                { month: "short" },
              ),
            }))}
            height={300}
          />
        </div>
      </div>

      <div class="gap-8 grid grid-cols-1 lg:grid-cols-2">
        {/* Jobs by Seniority */}
        <div class="bg-white dark:bg-gray-800 shadow-sm p-6 border border-gray-100 dark:border-gray-700 rounded-xl">
          {(() => {
            const topSeniority =
              stats.charts.seniority.length > 0
                ? stats.charts.seniority[0]
                : null;
            return (
              <h3 class="mb-6 font-bold text-gray-900 dark:text-white text-lg">
                {t("admin.jobs_by_seniority")}
                {topSeniority && (
                  <span class="bg-brand-neon/10 dark:bg-brand-neon/20 ml-2 px-2 py-1 rounded-full font-normal text-brand-neon dark:text-brand-neon text-sm">
                    Top:{" "}
                    <span class="font-semibold capitalize">
                      {topSeniority.label}
                    </span>
                  </span>
                )}
              </h3>
            );
          })()}
          <div class="space-y-4">
            {stats.charts.seniority.length > 0 ? (
              stats.charts.seniority.map((item) => {
                const percentage =
                  stats.overview.jobs.total > 0
                    ? (item.value / stats.overview.jobs.total) * 100
                    : 0;
                return (
                  <div key={item.label} class="space-y-1">
                    <div class="flex justify-between text-sm">
                      <span class="text-gray-700 dark:text-gray-300 capitalize">
                        {item.label}
                      </span>
                      <span class="font-semibold text-gray-900 dark:text-white">
                        {item.value}
                      </span>
                    </div>
                    <div class="bg-gray-100 dark:bg-gray-700 rounded-full w-full h-2">
                      <div
                        class="bg-brand-neon rounded-full h-2 transition-all duration-500"
                        style={{ width: `${percentage}%` }}
                      ></div>
                    </div>
                  </div>
                );
              })
            ) : (
              <p class="text-gray-500 text-sm italic">{t("admin.no_data")}</p>
            )}
          </div>
        </div>

        {/* Jobs by Employment Type */}
        <div class="bg-white dark:bg-gray-800 shadow-sm p-6 border border-gray-100 dark:border-gray-700 rounded-xl">
          <h3 class="mb-6 font-bold text-gray-900 dark:text-white text-lg">
            {t("admin.jobs_by_employment")}
          </h3>
          <div class="space-y-4">
            {stats.charts.employmentType.length > 0 ? (
              stats.charts.employmentType.map((item) => {
                const percentage =
                  stats.overview.jobs.total > 0
                    ? (item.value / stats.overview.jobs.total) * 100
                    : 0;
                return (
                  <div key={item.label} class="space-y-1">
                    <div class="flex justify-between text-sm">
                      <span class="text-gray-700 dark:text-gray-300 capitalize">
                        {item.label}
                      </span>
                      <span class="font-semibold text-gray-900 dark:text-white">
                        {item.value}
                      </span>
                    </div>
                    <div class="bg-gray-100 dark:bg-gray-700 rounded-full w-full h-2">
                      <div
                        class="bg-purple-600 rounded-full h-2 transition-all duration-500"
                        style={{ width: `${percentage}%` }}
                      ></div>
                    </div>
                  </div>
                );
              })
            ) : (
              <p class="text-gray-500 text-sm italic">{t("admin.no_data")}</p>
            )}
          </div>
        </div>
        {/* Jobs by Source */}
        <div class="bg-white dark:bg-gray-800 shadow-sm p-6 border border-gray-100 dark:border-gray-700 rounded-xl">
          <h3 class="mb-6 font-bold text-gray-900 dark:text-white text-lg">
            {t("admin.jobs_by_source") || "Annunci per Sorgente"}
          </h3>
          <div class="space-y-4">
            {stats.charts.jobsBySource &&
            stats.charts.jobsBySource.length > 0 ? (
              stats.charts.jobsBySource.map((item) => {
                const totalFilteredJobsForSource =
                  stats.charts.jobsBySource.reduce(
                    (acc, curr) => acc + curr.value,
                    0,
                  );
                const percentage =
                  totalFilteredJobsForSource > 0
                    ? (item.value / totalFilteredJobsForSource) * 100
                    : 0;
                return (
                  <div key={item.label} class="space-y-1">
                    <div class="flex justify-between text-sm">
                      <span class="text-gray-700 dark:text-gray-300 capitalize">
                        {item.label}
                      </span>
                      <span class="font-semibold text-gray-900 dark:text-white">
                        {item.value}
                      </span>
                    </div>
                    <div class="bg-gray-100 dark:bg-gray-700 rounded-full w-full h-2">
                      <div
                        class="bg-blue-600 rounded-full h-2 transition-all duration-500"
                        style={{ width: `${percentage}%` }}
                      ></div>
                    </div>
                  </div>
                );
              })
            ) : (
              <p class="text-gray-500 text-sm italic">{t("admin.no_data")}</p>
            )}
          </div>
        </div>

        {/* Jobs by City */}
        <div class="bg-white dark:bg-gray-800 shadow-sm p-6 border border-gray-100 dark:border-gray-700 rounded-xl">
          <h3 class="mb-6 font-bold text-gray-900 dark:text-white text-lg">
            {t("admin.jobs_by_city") || "Annunci per Città"}
          </h3>
          <div class="space-y-4">
            {stats.charts.jobsByCity && stats.charts.jobsByCity.length > 0 ? (
              stats.charts.jobsByCity.map((item) => {
                const totalFilteredJobsForCity = stats.charts.jobsByCity.reduce(
                  (acc, curr) => acc + curr.value,
                  0,
                );
                const percentage =
                  totalFilteredJobsForCity > 0
                    ? (item.value / totalFilteredJobsForCity) * 100
                    : 0;
                return (
                  <div key={item.label} class="space-y-1">
                    <div class="flex justify-between text-sm">
                      <span class="text-gray-700 dark:text-gray-300 capitalize">
                        {item.label}
                      </span>
                      <span class="font-semibold text-gray-900 dark:text-white">
                        {item.value}
                      </span>
                    </div>
                    <div class="bg-gray-100 dark:bg-gray-700 rounded-full w-full h-2">
                      <div
                        class="bg-emerald-600 rounded-full h-2 transition-all duration-500"
                        style={{ width: `${percentage}%` }}
                      ></div>
                    </div>
                  </div>
                );
              })
            ) : (
              <p class="text-gray-500 text-sm italic">{t("admin.no_data")}</p>
            )}
          </div>
        </div>
      </div>

      <div class="gap-8 grid grid-cols-1 lg:grid-cols-2 mt-8">
        {/* Jobs by Language */}
        <div class="bg-white dark:bg-gray-800 shadow-sm p-6 border border-gray-100 dark:border-gray-700 rounded-xl">
          <h3 class="mb-6 font-bold text-gray-900 dark:text-white text-lg">
            {t("admin.jobs_by_language") || "Annunci per Lingua"}
          </h3>
          <div class="space-y-4">
            {stats.charts.jobsByLanguage &&
            stats.charts.jobsByLanguage.length > 0 ? (
              stats.charts.jobsByLanguage.map((item) => {
                const totalFilteredJobsForLang =
                  stats.charts.jobsByLanguage.reduce(
                    (acc, curr) => acc + curr.value,
                    0,
                  );
                const percentage =
                  totalFilteredJobsForLang > 0
                    ? (item.value / totalFilteredJobsForLang) * 100
                    : 0;
                return (
                  <div key={item.label} class="space-y-1">
                    <div class="flex justify-between text-sm">
                      <span class="text-gray-700 dark:text-gray-300 uppercase">
                        {item.label}
                      </span>
                      <span class="font-semibold text-gray-900 dark:text-white">
                        {item.value}
                      </span>
                    </div>
                    <div class="bg-gray-100 dark:bg-gray-700 rounded-full w-full h-2">
                      <div
                        class="bg-brand-neon rounded-full h-2 transition-all duration-500"
                        style={{ width: `${percentage}%` }}
                      ></div>
                    </div>
                  </div>
                );
              })
            ) : (
              <p class="text-gray-500 text-sm italic">{t("admin.no_data")}</p>
            )}
          </div>
        </div>
      </div>

      {/* Top Skills Section */}
      <div class="bg-white dark:bg-gray-800 shadow-sm mt-8 mb-8 p-6 border border-gray-100 dark:border-gray-700 rounded-xl">
        <h3 class="mb-6 font-bold text-gray-900 dark:text-white text-lg">
          {t("admin.top_skills") || "Top Skills"}
        </h3>
        <div class="gap-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
          {stats.charts.topSkills && stats.charts.topSkills.length > 0 ? (
            stats.charts.topSkills.map((item, index) => (
              <div
                key={item.label}
                class="flex justify-between items-center bg-gray-50 dark:bg-gray-700/50 p-3 rounded-lg"
              >
                <div class="flex items-center gap-3">
                  <span
                    class={`flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-full text-xs font-bold ${index < 3 ? "bg-brand-neon/10 text-brand-neon dark:bg-brand-neon/20 dark:text-brand-neon" : "bg-gray-200 text-gray-700 dark:bg-gray-600 dark:text-gray-300"}`}
                  >
                    {index + 1}
                  </span>
                  <span class="font-medium text-gray-900 dark:text-white">
                    {item.label}
                  </span>
                </div>
                <span class="font-bold text-brand-neon dark:text-brand-neon">
                  {item.value}
                </span>
              </div>
            ))
          ) : (
            <div class="col-span-full py-8 text-gray-500 text-center">
              {t("admin.no_data")}
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

export const head: DocumentHead = ({ resolveValue }) => {
  const meta = resolveValue(useAdminStatsHeadLoader);
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
