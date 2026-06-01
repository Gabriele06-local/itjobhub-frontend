import { API_URL } from "../constants";
import { request } from "../utils/api";
import logger from "../utils/logger";
import type { SupportedLanguage } from "../contexts/i18n";

/**
 * Single internal source of truth for the platform's categorical fields.
 *
 * The BACKEND owns the canonical values (exposed via `GET /enums`). This module
 * is the one place the frontend consumes them, so every select / option list in
 * the app derives from the same data instead of hard-coding its own arrays
 * (which previously caused drift between backend, dashboard and frontend).
 *
 * Labels are returned already localized by the endpoint (via `Accept-Language`).
 * The wizard's per-option *descriptions* stay local (they are UI copy, not part
 * of the enum), so components keep their own `descKey` lookups.
 */

export type EnumKey =
  | "role"
  | "seniority"
  | "workMode"
  | "employmentType"
  | "availability";

export interface EnumOption {
  value: string;
  label: string;
}

export type EnumMap = Record<EnumKey, EnumOption[]>;

/**
 * Canonical fallback values. Kept in sync with the LOCKED backend contract.
 * Used when the `/enums` fetch fails so selects never render empty. Labels here
 * are the raw value (the UI re-localizes through i18n keys where needed).
 */
export const CANONICAL_VALUES: Record<EnumKey, string[]> = {
  role: ["user", "admin"],
  seniority: ["junior", "mid", "senior", "lead"],
  workMode: ["remote", "hybrid", "onsite"],
  employmentType: [
    "full-time",
    "part-time",
    "contract",
    "freelance",
    "internship",
  ],
  availability: [
    "full-time",
    "part-time",
    "contract",
    "freelance",
    "internship",
    "busy",
  ],
};

const toOptions = (values: string[]): EnumOption[] =>
  values.map((value) => ({ value, label: value }));

/** Canonical option lists (value === label) used as the offline fallback. */
export const FALLBACK_ENUMS: EnumMap = {
  role: toOptions(CANONICAL_VALUES.role),
  seniority: toOptions(CANONICAL_VALUES.seniority),
  workMode: toOptions(CANONICAL_VALUES.workMode),
  employmentType: toOptions(CANONICAL_VALUES.employmentType),
  availability: toOptions(CANONICAL_VALUES.availability),
};

/**
 * Normalize a single raw enum entry from the endpoint into an {value,label}.
 * The contract allows entries to be either a bare string or an object; we accept
 * both defensively so a backend shape tweak never blanks a select.
 */
const normalizeEntry = (entry: unknown): EnumOption | null => {
  if (typeof entry === "string") {
    return { value: entry, label: entry };
  }
  if (entry && typeof entry === "object") {
    const obj = entry as { value?: unknown; label?: unknown };
    if (typeof obj.value === "string") {
      return {
        value: obj.value,
        label: typeof obj.label === "string" ? obj.label : obj.value,
      };
    }
  }
  return null;
};

const normalizeList = (raw: unknown, key: EnumKey): EnumOption[] => {
  if (!Array.isArray(raw)) return FALLBACK_ENUMS[key];
  const options = raw
    .map(normalizeEntry)
    .filter((o): o is EnumOption => o !== null);
  return options.length > 0 ? options : FALLBACK_ENUMS[key];
};

/**
 * Fetch the localized enum option lists from the backend single source of truth.
 *
 * @param language one of the 5 supported locales; sent as `Accept-Language` so
 *   labels come back already localized. Falls back to English server-side.
 * @returns the full {@link EnumMap}; on any error returns {@link FALLBACK_ENUMS}
 *   so the UI never renders empty selects.
 */
export const fetchEnums = async (
  language: SupportedLanguage = "en",
): Promise<EnumMap> => {
  try {
    const res = await request(`${API_URL}/enums`, {
      headers: { "Accept-Language": language },
    });
    const json = await res.json();
    if (!res.ok || !json?.success || !json?.data) {
      logger.warn(
        { status: res.status },
        "[enums] Non-success response, using fallback",
      );
      return FALLBACK_ENUMS;
    }
    const data = json.data as Record<string, unknown>;
    return {
      role: normalizeList(data.role, "role"),
      seniority: normalizeList(data.seniority, "seniority"),
      workMode: normalizeList(data.workMode, "workMode"),
      employmentType: normalizeList(data.employmentType, "employmentType"),
      availability: normalizeList(data.availability, "availability"),
    };
  } catch (error) {
    logger.error({ error }, "[enums] Fetch failed, using fallback");
    return FALLBACK_ENUMS;
  }
};

/* -------------------------------------------------------------------------- */
/* Boundary normalization helpers                                             */
/*                                                                            */
/* Two legacy mismatches are reconciled here, in ONE documented place, rather */
/* than scattering `.replace()` calls across components:                      */
/*                                                                            */
/*  1. workMode "office" (legacy frontend value) <-> "onsite" (canonical).    */
/*  2. employmentType hyphen ("full-time") <-> underscore ("full_time"), the  */
/*     latter being how `processApiJob` stores it on a JobListing.            */
/* -------------------------------------------------------------------------- */

/** Map a canonical workMode value to the legacy UI value, and vice versa. */
export const workModeToLegacy = (value: string): string =>
  value === "onsite" ? "office" : value;

export const workModeFromLegacy = (value: string): string =>
  value === "office" ? "onsite" : value;

/** Convert a hyphenated employmentType ("full-time") to the stored underscore form. */
export const employmentTypeToStored = (value: string): string =>
  value.replace(/-/g, "_");

/** Convert a stored underscore employmentType ("full_time") back to the canonical hyphen form. */
export const employmentTypeFromStored = (value: string): string =>
  value.replace(/_/g, "-");
