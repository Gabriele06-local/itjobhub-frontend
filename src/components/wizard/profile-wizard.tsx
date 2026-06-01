import {
  component$,
  useStore,
  $,
  type QRL,
  useStylesScoped$,
} from "@builder.io/qwik";
import type { WizardData, ExtractedProfile } from "~/contexts/auth";
import { useTranslate, interpolate } from "~/contexts/i18n";
import { TagInput } from "~/components/ui/tag-input";
import { Spinner } from "~/components/ui/spinner";
import { CvUploadStep } from "~/components/wizard/cv-upload-step";
import { CANONICAL_VALUES } from "~/lib/enums";
import styles from "./profile-wizard.css?inline";

/**
 * Wizard option lists derive their VALUES from the shared enum module (the
 * backend single source of truth — see ~/lib/enums), while the LABEL and
 * DESCRIPTION copy stays LOCAL (wizard-specific i18n). Each canonical value is
 * mapped to its local i18n keys here; values without a mapping are skipped so a
 * future backend enum addition never crashes the wizard.
 */
interface WizardOption {
  value: string;
  labelKey: string;
  descKey: string;
}

// NOTE: "lead" is a canonical seniority but the wizard profile only models
// junior/mid/senior (see WizardData["seniority"]). It is intentionally NOT
// mapped here, so buildWizardOptions skips it and the wizard UX is preserved.
// The job-search filter (below) does surface every canonical seniority.
const SENIORITY_I18N: Record<string, Omit<WizardOption, "value">> = {
  junior: { labelKey: "wizard.junior_label", descKey: "wizard.junior_desc" },
  mid: { labelKey: "wizard.mid_label", descKey: "wizard.mid_desc" },
  senior: { labelKey: "wizard.senior_label", descKey: "wizard.senior_desc" },
};

const WORK_MODE_I18N: Record<string, Omit<WizardOption, "value">> = {
  remote: { labelKey: "wizard.remote_label", descKey: "wizard.remote_desc" },
  hybrid: { labelKey: "wizard.hybrid_label", descKey: "wizard.hybrid_desc" },
  onsite: { labelKey: "wizard.onsite_label", descKey: "wizard.onsite_desc" },
};

// Availability = employmentType values + the "busy" special case.
const AVAILABILITY_I18N: Record<string, Omit<WizardOption, "value">> = {
  "full-time": {
    labelKey: "wizard.fulltime_label",
    descKey: "wizard.fulltime_desc",
  },
  "part-time": {
    labelKey: "wizard.parttime_label",
    descKey: "wizard.parttime_desc",
  },
  contract: {
    labelKey: "wizard.contract_label",
    descKey: "wizard.contract_desc",
  },
  freelance: {
    labelKey: "wizard.freelance_label",
    descKey: "wizard.freelance_desc",
  },
  internship: {
    labelKey: "wizard.internship_label",
    descKey: "wizard.internship_desc",
  },
  busy: {
    labelKey: "wizard.occupied_label",
    descKey: "wizard.occupied_desc",
  },
};

/** Build a wizard option list from a canonical value list + local i18n map. */
const buildWizardOptions = (
  values: string[],
  i18nMap: Record<string, Omit<WizardOption, "value">>,
): WizardOption[] =>
  values
    .filter((value) => value in i18nMap)
    .map((value) => ({ value, ...i18nMap[value] }));

const SENIORITY_OPTIONS = buildWizardOptions(
  CANONICAL_VALUES.seniority,
  SENIORITY_I18N,
);
const WORK_MODE_OPTIONS = buildWizardOptions(
  CANONICAL_VALUES.workMode,
  WORK_MODE_I18N,
);
const AVAILABILITY_OPTIONS = buildWizardOptions(
  CANONICAL_VALUES.availability,
  AVAILABILITY_I18N,
);

/** Live enum value lists (from the backend single source of truth). */
export interface WizardEnumValues {
  seniority: string[];
  workMode: string[];
  availability: string[];
}

interface ProfileWizardProps {
  initialData?: Partial<WizardData>;
  onComplete$: QRL<(data: WizardData) => void>;
  onCancel$?: QRL<() => void>;
  token?: string;
  showCvStep?: boolean;
  /**
   * Value lists from the backend `/enums` endpoint. Optional: when omitted the
   * canonical fallback values are used, so the wizard never renders empty steps.
   */
  enumValues?: WizardEnumValues;
}

// Language translation keys (will be translated based on user's browser language)
const LANGUAGE_SUGGESTION_KEYS = [
  "lang.italian",
  "lang.english",
  "lang.french",
  "lang.spanish",
  "lang.german",
  "lang.portuguese",
  "lang.russian",
  "lang.chinese",
  "lang.japanese",
  "lang.arabic",
  "lang.dutch",
  "lang.swedish",
];

const SKILL_SUGGESTIONS = [
  "JavaScript",
  "TypeScript",
  "React",
  "Vue.js",
  "Angular",
  "Node.js",
  "Python",
  "Django",
  "Flask",
  "Java",
  "Spring Boot",
  "C#",
  ".NET",
  "PHP",
  "Laravel",
  "Ruby",
  "Rails",
  "Go",
  "Rust",
  "Swift",
  "Kotlin",
  "HTML",
  "CSS",
  "SASS",
  "Tailwind",
  "Bootstrap",
  "MySQL",
  "PostgreSQL",
  "MongoDB",
  "Redis",
  "Docker",
  "Kubernetes",
  "AWS",
  "Azure",
  "GCP",
  "Git",
  "CI/CD",
  "Linux",
  "Nginx",
  "Apache",
  "GraphQL",
  "REST API",
];

export const ProfileWizard = component$<ProfileWizardProps>(
  ({ initialData, onComplete$, onCancel$, token, showCvStep, enumValues }) => {
    useStylesScoped$(styles);
    const t = useTranslate();

    // Derive option lists: live values from the endpoint when provided,
    // otherwise the canonical fallback. Label/description copy stays local.
    const seniorityOptions = enumValues
      ? buildWizardOptions(enumValues.seniority, SENIORITY_I18N)
      : SENIORITY_OPTIONS;
    const workModeOptions = enumValues
      ? buildWizardOptions(enumValues.workMode, WORK_MODE_I18N)
      : WORK_MODE_OPTIONS;
    const availabilityOptions = enumValues
      ? buildWizardOptions(enumValues.availability, AVAILABILITY_I18N)
      : AVAILABILITY_OPTIONS;

    const hasCvStep = showCvStep !== false;
    const firstStep = hasCvStep ? 0 : 1;
    const totalSteps = hasCvStep ? 7 : 6;

    const state = useStore({
      currentStep: firstStep,
      isSubmitting: false,
      prefillApplied: false,
      data: {
        languages: initialData?.languages || [],
        skills: initialData?.skills || [],
        seniority: initialData?.seniority || "",
        availability: initialData?.availability || [],
        workModes: initialData?.workModes || [],
        salaryMin: initialData?.salaryMin ?? 0,
        portfolioUrl: initialData?.portfolioUrl || "",
      } as WizardData,
    });

    const nextStep = $(() => {
      if (state.currentStep < totalSteps - 1 + firstStep) {
        state.currentStep++;
      }
    });

    const prevStep = $(() => {
      if (state.currentStep > firstStep) {
        state.currentStep--;
      }
    });

    const handleComplete = $(() => {
      state.isSubmitting = true;
      onComplete$(state.data);
    });

    const handleCvParsed = $((extracted: ExtractedProfile) => {
      if (extracted.skills.length > 0 && state.data.skills.length === 0) {
        state.data.skills = [...extracted.skills];
      }
      if (extracted.languages.length > 0 && state.data.languages.length === 0) {
        state.data.languages = [...extracted.languages];
      }
      if (extracted.seniority && !state.data.seniority) {
        state.data.seniority = extracted.seniority;
      }
      if (extracted.availability && state.data.availability.length === 0) {
        state.data.availability = [extracted.availability];
      }
      if (extracted.workModes.length > 0 && state.data.workModes.length === 0) {
        state.data.workModes = [...extracted.workModes];
      }
      if (extracted.salaryMin && state.data.salaryMin === 0) {
        state.data.salaryMin = extracted.salaryMin;
      }
      state.prefillApplied = true;
    });

    const getCanProceed = () => {
      if (hasCvStep) {
        switch (state.currentStep) {
          case 0:
            return true;
          case 1:
            return state.data.languages.length > 0;
          case 2:
            return state.data.skills.length > 0;
          case 3:
            return state.data.seniority !== "";
          case 4:
            return state.data.workModes.length > 0;
          case 5:
            return state.data.availability.length > 0;
          case 6:
            return state.data.salaryMin >= 0;
          default:
            return false;
        }
      } else {
        switch (state.currentStep) {
          case 1:
            return state.data.languages.length > 0;
          case 2:
            return state.data.skills.length > 0;
          case 3:
            return state.data.seniority !== "";
          case 4:
            return state.data.workModes.length > 0;
          case 5:
            return state.data.availability.length > 0;
          case 6:
            return state.data.salaryMin >= 0;
          default:
            return false;
        }
      }
    };

    const progressStep = hasCvStep ? state.currentStep + 1 : state.currentStep;
    const lastStep = hasCvStep ? 6 : 6;

    return (
      <div class="wizard-overlay">
        <div class="wizard-card">
          {/* Progress bar */}
          <div class="progress-section">
            <div class="progress-header">
              <span class="progress-title">
                {interpolate(t("wizard.step_of"), {
                  current: progressStep.toString(),
                  total: totalSteps.toString(),
                })}
              </span>
              <span class="progress-percent">
                {Math.round((progressStep / totalSteps) * 100)}%
              </span>
            </div>
            <div class="progress-bar-bg">
              <div
                class="progress-bar-fill"
                style={`width: ${(progressStep / totalSteps) * 100}%`}
              ></div>
            </div>
          </div>

          {/* Step 0: CV & Portfolio (optional) */}
          {hasCvStep && state.currentStep === 0 && (
            <div class="step-container" data-testid="wizard-step-0">
              <div>
                <h2 class="step-heading">{t("wizard.cv_step")}</h2>
                <p class="step-description">{t("wizard.cv_step_desc")}</p>
                <CvUploadStep
                  token={token || ""}
                  mode="wizard"
                  onParsed$={handleCvParsed}
                  portfolioUrl={state.data.portfolioUrl}
                  onPortfolioChange$={$((url: string) => {
                    state.data.portfolioUrl = url;
                  })}
                />
              </div>
            </div>
          )}

          {/* Step content */}
          {state.currentStep === 1 && (
            <div class="step-container" data-testid="wizard-step-1">
              <div>
                <h2 class="step-heading">{t("wizard.languages_step")}</h2>
                <p class="step-description">{t("wizard.languages_desc")}</p>
                {state.prefillApplied && state.data.languages.length > 0 && (
                  <span class="prefill-badge">
                    ✓ {t("wizard.cv_prefilled")}
                  </span>
                )}
                <TagInput
                  value={state.data.languages}
                  onChange$={(languages) => (state.data.languages = languages)}
                  placeholder={t("wizard.languages_placeholder")}
                  suggestions={LANGUAGE_SUGGESTION_KEYS.map((key) => t(key))}
                />
              </div>
            </div>
          )}

          {state.currentStep === 2 && (
            <div class="step-container">
              <div>
                <h2 class="step-heading">{t("wizard.skills_step")}</h2>
                <p class="step-description">{t("wizard.skills_desc")}</p>
                <TagInput
                  value={state.data.skills}
                  onChange$={(skills) => (state.data.skills = skills)}
                  placeholder={t("wizard.skills_placeholder")}
                  suggestions={SKILL_SUGGESTIONS}
                />
              </div>
            </div>
          )}

          {state.currentStep === 3 && (
            <div class="step-container">
              <div>
                <h2 class="step-heading">{t("wizard.seniority_step")}</h2>
                <p class="step-description">{t("wizard.seniority_desc")}</p>
                <div class="options-stack">
                  {seniorityOptions.map((option) => (
                    <label
                      key={option.value}
                      for={`seniority-${option.value}`}
                      class={`option-card ${
                        state.data.seniority === option.value
                          ? "option-card-selected"
                          : "option-card-default"
                      }`}
                    >
                      <input
                        id={`seniority-${option.value}`}
                        aria-label={t(option.labelKey)}
                        type="radio"
                        name="seniority"
                        value={option.value}
                        checked={state.data.seniority === option.value}
                        onChange$={() =>
                          (state.data.seniority =
                            option.value as WizardData["seniority"])
                        }
                        class="option-input"
                      />
                      <div class="option-content">
                        <div class="option-title">{t(option.labelKey)}</div>
                        <div class="option-desc">{t(option.descKey)}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}

          {state.currentStep === 4 && (
            <div class="step-container">
              <div>
                <h2 class="step-heading">{t("wizard.work_modes_step")}</h2>
                <p class="step-description">{t("wizard.work_modes_desc")}</p>
                <div class="options-stack">
                  {workModeOptions.map((option) => (
                    <label
                      key={option.value}
                      for={`workMode-${option.value}`}
                      class={`option-card ${
                        state.data.workModes.includes(option.value)
                          ? "option-card-selected"
                          : "option-card-default"
                      }`}
                    >
                      <input
                        id={`workMode-${option.value}`}
                        aria-label={t(option.labelKey)}
                        type="checkbox"
                        name="workModes"
                        value={option.value}
                        checked={state.data.workModes.includes(option.value)}
                        onChange$={() => {
                          if (state.data.workModes.includes(option.value)) {
                            state.data.workModes = state.data.workModes.filter(
                              (m) => m !== option.value,
                            );
                          } else {
                            state.data.workModes = [
                              ...state.data.workModes,
                              option.value,
                            ];
                          }
                        }}
                        class="option-input"
                      />
                      <div class="option-content">
                        <div class="option-title">{t(option.labelKey)}</div>
                        <div class="option-desc">{t(option.descKey)}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}

          {state.currentStep === 5 && (
            <div class="step-container">
              <div>
                <h2 class="step-heading">{t("wizard.availability_step")}</h2>
                <p class="step-description">{t("wizard.availability_desc")}</p>
                <div class="options-stack">
                  {availabilityOptions.map((option) => (
                    <label
                      key={option.value}
                      for={`availability-${option.value}`}
                      class={`option-card ${
                        state.data.availability.includes(option.value)
                          ? "option-card-selected"
                          : "option-card-default"
                      }`}
                    >
                      <input
                        id={`availability-${option.value}`}
                        aria-label={t(option.labelKey)}
                        type="checkbox"
                        name="availability"
                        value={option.value}
                        checked={state.data.availability.includes(option.value)}
                        onChange$={() => {
                          const set = new Set(state.data.availability);
                          if (set.has(option.value)) set.delete(option.value);
                          else set.add(option.value);
                          state.data.availability = Array.from(set);
                        }}
                        class="option-input"
                      />
                      <div class="option-content">
                        <div class="option-title">{t(option.labelKey)}</div>
                        <div class="option-desc">{t(option.descKey)}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}

          {state.currentStep === 6 && (
            <div class="step-container">
              <div>
                <h2 class="step-heading">{t("profile.salary_min_label")}</h2>
                <p class="step-description">{t("wizard.salary_min_desc")}</p>
                <div class="space-y-4">
                  <div class="relative">
                    <label class="block mb-2 font-medium text-gray-700 dark:text-gray-300 text-sm">
                      {t("profile.salary_min_label")}
                      {state.data.salaryMin > 0 && (
                        <span class="ml-2 font-mono text-brand-neon">
                          €
                          {Number(state.data.salaryMin).toLocaleString("it-IT")}
                          +
                        </span>
                      )}
                      {state.data.salaryMin === 0 && (
                        <span class="ml-2 font-mono text-gray-500">
                          {t("profile.salary_any")}
                        </span>
                      )}
                    </label>
                    <input
                      type="range"
                      min="0"
                      max="100000"
                      step="5000"
                      value={(state.data.salaryMin || 0).toString()}
                      onInput$={(e) => {
                        const val = (e.target as HTMLInputElement).value;
                        state.data.salaryMin = Number(val);
                      }}
                      class="bg-gray-200 dark:bg-gray-700 rounded-lg w-full h-2 accent-brand-neon appearance-none cursor-pointer"
                      aria-label={t("profile.salary_min_label")}
                    />
                    <div class="flex justify-between mt-1 font-mono text-gray-500 dark:text-gray-400 text-xs">
                      <span>{t("profile.salary_any")}</span>
                      <span>20k</span>
                      <span>40k</span>
                      <span>60k</span>
                      <span>80k</span>
                      <span>100k+</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Navigation buttons */}
          <div class="nav-buttons">
            <div class="nav-left">
              {state.currentStep > firstStep && (
                <button onClick$={prevStep} class="btn-secondary">
                  {t("wizard.back")}
                </button>
              )}
              {onCancel$ && state.currentStep === firstStep && (
                <button onClick$={onCancel$} class="btn-secondary">
                  {t("wizard.cancel")}
                </button>
              )}
            </div>

            <div class="nav-right-buttons">
              {/* Skip button for CV step */}
              {hasCvStep && state.currentStep === 0 && (
                <button
                  onClick$={nextStep}
                  class="btn-secondary"
                  data-testid="cv-skip-btn"
                >
                  {t("wizard.cv_skip")}
                </button>
              )}

              {state.currentStep < lastStep ? (
                <button
                  onClick$={nextStep}
                  disabled={!getCanProceed()}
                  class="btn-primary"
                  data-testid="cv-continue-btn"
                >
                  {hasCvStep && state.currentStep === 0
                    ? t("wizard.cv_continue")
                    : t("wizard.next")}
                </button>
              ) : (
                <button
                  onClick$={handleComplete}
                  disabled={!getCanProceed() || state.isSubmitting}
                  class="btn-success"
                >
                  {state.isSubmitting && (
                    <Spinner size="sm" class="spinner-icon" />
                  )}
                  {state.isSubmitting
                    ? t("common.saving")
                    : t("wizard.complete")}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  },
);
