import { component$, useStylesScoped$ } from "@builder.io/qwik";
import styles from "./match-breakdown.css?inline";
import { useTranslate, interpolate } from "~/contexts/i18n";

interface MatchFactors {
  skillsMatch: number;
  seniorityMatch: number;
  locationMatch: number;
  trustScore: number;
  timeliness: number;
  competition: number;
  applicationRate: number;
  employmentMatch?: number;
}

interface MatchBreakdownProps {
  score: number;
  factors: MatchFactors;
  details: {
    matchedSkills: string[];
    missingSkills: string[];
    seniorityGap: string;
    locationStatus: string;
  };
}

export const MatchBreakdown = component$<MatchBreakdownProps>(
  ({ score, factors, details }) => {
    useStylesScoped$(styles);
    const t = useTranslate();

    const getScoreColor = (score: number) => {
      if (score >= 75) return "text-green-600 dark:text-green-400";
      if (score >= 50) return "text-yellow-600 dark:text-yellow-400";
      if (score >= 30) return "text-orange-600 dark:text-orange-400";
      return "text-red-600 dark:text-red-400";
    };

    const getBgColor = (score: number) => {
      if (score >= 75) return "bg-green-100 dark:bg-green-900/30";
      if (score >= 50) return "bg-yellow-100 dark:bg-yellow-900/30";
      if (score >= 30) return "bg-orange-100 dark:bg-orange-900/30";
      return "bg-red-100 dark:bg-red-900/30";
    };

    return (
      <div class="container">
        <h2 class="title">{t("match.title")}</h2>

        <div class="score-container">
          <div
            class={`score-circle ${getScoreColor(score)} border-current ${getBgColor(score)}`}
          >
            {score}%
          </div>
          <div>
            <h3 class={`score-text ${getScoreColor(score)}`}>
              {score >= 75
                ? t("match.excellent")
                : score >= 50
                  ? t("match.good")
                  : score >= 30
                    ? t("match.fair")
                    : t("match.low")}
            </h3>
            <p class="score-subtitle">{t("match.subtitle")}</p>
          </div>
        </div>

        <div class="factors-list">
          {/* Skills */}
          <div>
            <div class="factor-header">
              <span class="factor-label">
                {t("match.skills")} ({Math.round(factors.skillsMatch)}%)
              </span>
              <span class="factor-sublabel">
                {interpolate(t("match.matched_missing"), {
                  matched: details.matchedSkills.length,
                  missing: details.missingSkills.length,
                })}
              </span>
            </div>
            <div class="progress-bar-bg">
              <div
                class="progress-bar-fill"
                style={{ width: `${factors.skillsMatch}%` }}
              ></div>
            </div>
          </div>

          {/* Seniority */}
          <div>
            <div class="factor-header">
              <span class="factor-label">
                {t("match.seniority")} ({Math.round(factors.seniorityMatch)}%)
              </span>
              <span class="factor-sublabel">
                {t(`match.seniority.${details.seniorityGap}`)}
              </span>
            </div>
            <div class="progress-bar-bg">
              <div
                class="progress-bar-fill"
                style={{ width: `${factors.seniorityMatch}%` }}
              ></div>
            </div>
          </div>

          {/* Location */}
          <div>
            <div class="factor-header">
              <span class="factor-label">
                {t("match.location")} ({Math.round(factors.locationMatch)}%)
              </span>
              <span class="factor-sublabel">
                {t(`match.location.${details.locationStatus}`)}
              </span>
            </div>
            <div class="progress-bar-bg">
              <div
                class="progress-bar-fill"
                style={{ width: `${factors.locationMatch}%` }}
              ></div>
            </div>
          </div>

          {/* Other Factors Grid */}
          <div class="grid-container">
            <div class="grid-item">
              <div class="grid-label">{t("match.trust")}</div>
              <div class="grid-value">{Math.round(factors.trustScore)}%</div>
            </div>
            <div class="grid-item">
              <div class="grid-label">{t("match.early_bird")}</div>
              <div class="grid-value">{Math.round(factors.timeliness)}%</div>
            </div>
            <div class="grid-item">
              <div class="grid-label">{t("match.competition")}</div>
              <div class="grid-value">{Math.round(factors.competition)}%</div>
            </div>
            <div class="grid-item">
              <div class="grid-label">{t("match.app_rate")}</div>
              <div class="grid-value">
                {Math.round(factors.applicationRate)}%
              </div>
            </div>
            {typeof factors.employmentMatch === "number" && (
              <div class="grid-item">
                <div class="grid-label">{t("match.employment_type")}</div>
                <div class="grid-value">
                  {Math.round(factors.employmentMatch)}%
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  },
);
