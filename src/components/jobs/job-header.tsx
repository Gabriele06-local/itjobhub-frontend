import {
  component$,
  useStylesScoped$,
  type PropFunction,
} from "@builder.io/qwik";
import styles from "./job-header.css?inline";
import { useI18n, translate } from "~/contexts/i18n";
import type { JobListing } from "~/contexts/jobs";
import { ReactionButtons } from "~/components/ui/reaction-buttons";
import { DetailStats } from "~/components/ui/detail-stats";
import { AuthActionPrompt } from "~/components/common/auth-action-prompt";
import { API_URL } from "~/constants";

interface JobHeaderProps {
  job: JobListing;
  isAuthenticated: boolean;
  isAdmin: boolean;
  onToggleFavorite$: PropFunction<() => void>;
  onApplyClick$: PropFunction<() => void>;
  onReaction$?: PropFunction<(type: "LIKE" | "DISLIKE", count: number) => void>;
  onReactionComplete$?: PropFunction<() => void>;
  applyDisabled?: boolean;
  applyLimit?: number;
}

export const JobHeader = component$<JobHeaderProps>((props) => {
  const {
    job,
    isAuthenticated,
    onReaction$,
    onReactionComplete$,
    applyDisabled,
  } = props;
  const i18n = useI18n();
  useStylesScoped$(styles);

  const t = (key: string) => translate(key, i18n.currentLanguage);

  return (
    <div class="heroHeader">
      <div class="headerContent">
        <div class="flex items-center gap-6">
          <div class="companyLogoContainer">
            {job.companyLogo ? (
              <img
                src={
                  job.companyLogo && job.companyLogo.startsWith("http")
                    ? `${API_URL}/image-proxy?url=${encodeURIComponent(job.companyLogo)}`
                    : job.companyLogo
                }
                alt={job.company}
                width="80"
                height="80"
                class="companyLogo"
                loading="eager"
              />
            ) : (
              <svg
                class="companyLogoPlaceholder"
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
            )}
          </div>
          <div>
            <h1 class="jobTitle">{job.title}</h1>
            <div class="jobMeta">
              <span class="companyName">{job.company}</span>
              <span class="location">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  class="locationIcon"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                  />
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                  />
                </svg>
                {job.location || t("job.location_not_specified")}
              </span>
            </div>
          </div>
        </div>

        <div class="actionsContainer" data-testid="job-actions">
          <ReactionButtons
            likes={job.likes || 0}
            dislikes={job.dislikes || 0}
            userReaction={job.user_reaction}
            entityId={job.id}
            entityType="job"
            isAuthenticated={isAuthenticated}
            onReactionChange$={onReaction$}
            onReactionComplete$={onReactionComplete$}
          />

          <button
            onClick$={props.onToggleFavorite$}
            disabled={!isAuthenticated}
            data-testid="favorite-button"
            class={`favoriteButton ${job.is_favorite ? "favoriteButtonActive" : ""} ${!isAuthenticated ? "opacity-50 cursor-not-allowed" : ""} `}
            title={
              job.is_favorite ? t("job.remove_favorite") : t("job.add_favorite")
            }
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class={`favoriteIcon ${job.is_favorite ? "fill-current" : ""} `}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.382-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"
              />
            </svg>
          </button>

          {applyDisabled ? (
            <div class="flex flex-col gap-1">
              <button
                type="button"
                disabled
                class="opacity-60 px-8 py-3 w-auto text-base btn-primary cursor-not-allowed"
                data-testid="apply-button"
              >
                {t("job.apply")}
              </button>
              <span class="text-sm text-red-600" data-testid="apply-limit-msg">
                {t("job.daily_limit_reached").replace(
                  "{limit}",
                  String(props.applyLimit ?? 3),
                )}
              </span>
            </div>
          ) : (
            <a
              href={job.externalLink}
              target="_blank"
              rel="noopener noreferrer"
              onClick$={props.onApplyClick$}
              class="px-8 py-3 w-auto text-base btn-primary"
              data-testid="apply-button"
            >
              {t("job.apply")}
            </a>
          )}

          {!isAuthenticated && (
            <div class="loginHint">
              <AuthActionPrompt />
            </div>
          )}
        </div>
      </div>

      {/* Stats/Badges Row */}
      <div class="badgesRow">
        <div class="badge">
          {t("job.seniority")}:{" "}
          <span class="capitalize seniorityValue">
            {t("jobs." + (job.seniority || "unknown"))}
          </span>
        </div>
        <div class="badge">
          {t("job.availability")}:{" "}
          <span class="availabilityValue">
            {t("jobs." + (job.availability || "full_time"))}
          </span>
        </div>
        {job.remote && (
          <div class="remoteBadge">🌐 {t("job.remote_badge")}</div>
        )}
        {job.salary && <div class="salaryBadge">💰 {job.salary}</div>}
      </div>

      {/* Tracking Stats */}
      <DetailStats
        viewsCount={job.views_count || 0}
        clicksCount={job.clicks_count || 0}
        viewsLabel={t("job.views")}
        clicksLabel={t("job.applications")}
        viewsTitle={t("job.views_count")}
        clicksTitle={t("job.clicks_count")}
      />
    </div>
  );
});
