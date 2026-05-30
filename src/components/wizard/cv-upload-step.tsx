import {
  component$,
  useStore,
  useTask$,
  $,
  type QRL,
  useStylesScoped$,
} from "@builder.io/qwik";
import { useTranslate } from "~/contexts/i18n";
import type { CvRecord, ExtractedProfile } from "~/contexts/auth";
import { uploadCV, deleteCV, parseCV } from "~/utils/cv-api";
import { Spinner } from "~/components/ui/spinner";
import styles from "./cv-upload-step.css?inline";

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

// The AI parse endpoint returns an all-empty profile (confidence 0) when it
// can't extract anything — e.g. GROQ not configured server-side. Detect that
// so we can tell the user instead of silently applying empty values.
const isEmptyExtraction = (p: ExtractedProfile): boolean =>
  (p.confidence ?? 0) === 0 &&
  p.skills.length === 0 &&
  p.languages.length === 0 &&
  !p.seniority &&
  !p.availability;

const CV_LANGUAGES = [
  { code: "it", labelKey: "cv.lang.it" },
  { code: "en", labelKey: "cv.lang.en" },
  { code: "fr", labelKey: "cv.lang.fr" },
  { code: "es", labelKey: "cv.lang.es" },
  { code: "de", labelKey: "cv.lang.de" },
];

interface CvUploadStepProps {
  token: string;
  mode: "wizard" | "profile";
  onParsed$?: QRL<(data: ExtractedProfile) => void>;
  onUploaded$?: QRL<(cv: CvRecord) => void>;
  onDeleted$?: QRL<(cvId: string) => void>;
  existingCvs?: CvRecord[];
  portfolioUrl?: string;
  onPortfolioChange$?: QRL<(url: string) => void>;
}

export const CvUploadStep = component$<CvUploadStepProps>((props) => {
  useStylesScoped$(styles);
  const t = useTranslate();

  // Pre-compute translation strings so they can be serialized in $() closures
  const errType = t("profile.cv_error_type");
  const errSize = t("profile.cv_error_size");
  const errUpload = t("profile.cv_error_upload");
  const errParse = t("profile.cv_error_parse");
  const errNoData = t("profile.cv_no_data");
  const labelParseBtn = t("wizard.cv_parse_btn");
  const labelParsing = t("wizard.cv_parsing");
  const labelUploadBtn = t("wizard.cv_upload_btn");

  const state = useStore({
    selectedLanguage: "en",
    isDragOver: false,
    selectedFile: null as File | null,
    isUploading: false,
    isParsing: false,
    uploadError: "",
    parseError: "",
    prefillApplied: false,
    cvs: props.existingCvs ? [...props.existingCvs] : ([] as CvRecord[]),
    portfolioUrl: props.portfolioUrl || "",
    lastParsedCvId: "",
  });

  // Keep the internal CV list in sync with parent-loaded data. In profile mode
  // the parent fetches CVs asynchronously after mount, so the initial snapshot
  // would otherwise stay empty and uploaded CVs would "disappear" on refresh.
  useTask$(({ track }) => {
    const incoming = track(() => props.existingCvs);
    if (incoming) {
      state.cvs = [...incoming];
    }
  });

  const handleFileSelect = $((file: File) => {
    state.uploadError = "";
    if (file.type !== "application/pdf") {
      state.uploadError = errType;
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      state.uploadError = errSize;
      return;
    }
    state.selectedFile = file;
  });

  const handleDrop = $((e: DragEvent) => {
    state.isDragOver = false;
    const file = e.dataTransfer?.files[0];
    if (file) {
      handleFileSelect(file);
    }
  });

  const handleFileInputChange = $((e: Event) => {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
  });

  const handleUpload = $(async () => {
    if (!state.selectedFile || !props.token) return;
    state.isUploading = true;
    state.uploadError = "";
    try {
      const cv = await uploadCV(
        props.token,
        state.selectedFile,
        state.selectedLanguage,
      );
      const idx = state.cvs.findIndex((c) => c.language === cv.language);
      if (idx >= 0) {
        state.cvs[idx] = cv;
      } else {
        state.cvs = [...state.cvs, cv];
      }
      state.lastParsedCvId = cv.id;
      state.selectedFile = null;
      if (props.onUploaded$) {
        props.onUploaded$(cv);
      }
      // Auto-parse after upload whenever a handler is provided (wizard + profile)
      if (props.onParsed$) {
        state.isParsing = true;
        try {
          const extracted = await parseCV(props.token, cv.id);
          if (isEmptyExtraction(extracted)) {
            state.parseError = errNoData;
          } else {
            state.prefillApplied = true;
            props.onParsed$(extracted);
          }
        } catch {
          state.parseError = errParse;
        } finally {
          state.isParsing = false;
        }
      }
    } catch (err) {
      state.uploadError = err instanceof Error ? err.message : errUpload;
    } finally {
      state.isUploading = false;
    }
  });

  const handleParse = $(async (cvId: string) => {
    if (!props.token) return;
    state.isParsing = true;
    state.lastParsedCvId = cvId;
    state.parseError = "";
    try {
      const extracted = await parseCV(props.token, cvId);
      if (isEmptyExtraction(extracted)) {
        state.parseError = errNoData;
      } else {
        state.prefillApplied = true;
        if (props.onParsed$) {
          props.onParsed$(extracted);
        }
      }
    } catch (err) {
      state.parseError = err instanceof Error ? err.message : errParse;
    } finally {
      state.isParsing = false;
    }
  });

  const handleDelete = $(async (cvId: string) => {
    if (!props.token) return;
    try {
      await deleteCV(props.token, cvId);
      state.cvs = state.cvs.filter((c) => c.id !== cvId);
      if (state.lastParsedCvId === cvId) state.lastParsedCvId = "";
      if (props.onDeleted$) {
        props.onDeleted$(cvId);
      }
    } catch {
      // ignore
    }
  });

  const formatSize = (bytes: number) => {
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  };

  return (
    <div class="cv-upload-step" data-testid="cv-upload-step">
      {/* Language selector + drop zone */}
      <div class="cv-upload-area">
        <div class="cv-lang-row">
          <label class="cv-label">{t("wizard.cv_language_label")}</label>
          <select
            class="cv-select"
            value={state.selectedLanguage}
            onChange$={(e) =>
              (state.selectedLanguage = (e.target as HTMLSelectElement).value)
            }
            aria-label={t("wizard.cv_language_label")}
          >
            {CV_LANGUAGES.map((lang) => (
              <option key={lang.code} value={lang.code}>
                {t(lang.labelKey)}
              </option>
            ))}
          </select>
        </div>

        {/* Drop zone */}
        <div
          class={`cv-drop-zone ${state.isDragOver ? "cv-drop-zone-active" : ""} ${state.selectedFile ? "cv-drop-zone-selected" : ""}`}
          onDragOver$={(e) => {
            e.preventDefault();
            state.isDragOver = true;
          }}
          onDragLeave$={() => (state.isDragOver = false)}
          onDrop$={handleDrop}
          data-testid="cv-drop-zone"
        >
          {state.selectedFile ? (
            <div class="cv-selected-file">
              <span class="cv-file-icon">📄</span>
              <span class="cv-file-name">{state.selectedFile.name}</span>
              <span class="cv-file-size">
                ({formatSize(state.selectedFile.size)})
              </span>
            </div>
          ) : (
            <div class="cv-drop-hint">
              <span class="cv-upload-icon">📁</span>
              <span>{t("wizard.cv_upload_drag")}</span>
            </div>
          )}
          <input
            type="file"
            accept=".pdf,application/pdf"
            class="cv-file-input"
            onChange$={handleFileInputChange}
            data-testid="cv-file-input"
            aria-label={labelUploadBtn}
          />
        </div>

        {state.uploadError && <p class="cv-error">{state.uploadError}</p>}

        {state.selectedFile && (
          <button
            class="cv-upload-btn btn-primary"
            onClick$={handleUpload}
            disabled={state.isUploading || state.isParsing}
            data-testid="cv-upload-btn"
          >
            {state.isUploading ? (
              <span class="cv-btn-loading">
                <Spinner size="sm" /> {labelParsing}
              </span>
            ) : (
              labelUploadBtn
            )}
          </button>
        )}

        {/* Parse loading (wizard auto-parse) */}
        {state.isParsing && props.mode === "wizard" && (
          <div class="cv-parsing-status">
            <Spinner size="sm" />
            <span>{labelParsing}</span>
          </div>
        )}

        {/* Pre-fill badge */}
        {state.prefillApplied && (
          <div class="cv-prefilled-badge" data-testid="cv-prefilled-badge">
            ✓ {t("wizard.cv_prefilled")}
          </div>
        )}

        {state.parseError && <p class="cv-error">{state.parseError}</p>}
      </div>

      {/* Existing CVs list */}
      {state.cvs.length > 0 && (
        <div class="cv-list" data-testid="cv-list">
          <h4 class="cv-list-title">{t("profile.cv_section_title")}</h4>
          {state.cvs.map((cv) => (
            <div key={cv.id} class="cv-list-item">
              <span class="cv-lang-badge">{cv.language.toUpperCase()}</span>
              <span class="cv-filename">{cv.filename}</span>
              <span class="cv-size">{formatSize(cv.size)}</span>
              {props.mode === "profile" && props.onParsed$ && (
                <button
                  class="cv-parse-btn btn-secondary"
                  onClick$={() => handleParse(cv.id)}
                  disabled={state.isParsing}
                  data-testid={`cv-parse-${cv.id}`}
                >
                  {state.isParsing && state.lastParsedCvId === cv.id ? (
                    <span class="cv-btn-loading">
                      <Spinner size="sm" /> {labelParsing}
                    </span>
                  ) : (
                    labelParseBtn
                  )}
                </button>
              )}
              <button
                class="cv-delete-btn"
                onClick$={() => handleDelete(cv.id)}
                aria-label={`Delete ${cv.filename}`}
                data-testid={`cv-delete-${cv.id}`}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {state.cvs.length === 0 && props.mode === "profile" && (
        <p class="cv-empty">{t("profile.cv_no_cvs")}</p>
      )}

      {/* Portfolio URL */}
      <div class="cv-portfolio-row">
        <label class="cv-label" for="portfolio-url-input">
          {props.mode === "wizard"
            ? t("wizard.portfolio_url_label")
            : t("profile.portfolio_url_label")}
        </label>
        <input
          id="portfolio-url-input"
          type="url"
          class="cv-portfolio-input"
          value={state.portfolioUrl}
          placeholder={
            props.mode === "wizard"
              ? t("wizard.portfolio_url_placeholder")
              : t("profile.portfolio_url_placeholder")
          }
          onInput$={(e) => {
            const val = (e.target as HTMLInputElement).value;
            state.portfolioUrl = val;
            if (props.onPortfolioChange$) {
              props.onPortfolioChange$(val);
            }
          }}
          data-testid="portfolio-url-input"
        />
      </div>
    </div>
  );
});
