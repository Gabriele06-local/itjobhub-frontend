import {
  component$,
  useStore,
  $,
  useTask$,
  useSignal,
  isBrowser,
} from "@builder.io/qwik";
import {
  useNavigate,
  type DocumentHead,
  useLocation,
  routeLoader$,
} from "@builder.io/qwik-city";
import { useAuth } from "~/contexts/auth";
import { useTranslate, translate, useI18n } from "~/contexts/i18n";
import { ProfileWizard } from "~/components/wizard/profile-wizard";
import { CvUploadStep } from "~/components/wizard/cv-upload-step";
import { LocationAutocomplete } from "~/components/ui/location-autocomplete";
import { Spinner } from "~/components/ui/spinner";
import { AvatarCropper } from "~/components/ui/avatar-cropper";
import type { WizardData, CvRecord, ExtractedProfile } from "~/contexts/auth";
import { listCVs } from "~/utils/cv-api";
import { request } from "~/utils/api";
import { API_URL } from "~/constants";
import { formatLocaleDate } from "~/utils/date";
import logger from "~/utils/logger";

export const useProfileProtection = routeLoader$(
  async ({ cookie, redirect, url }) => {
    const token = cookie.get("auth_token")?.value;
    if (!token) {
      throw redirect(302, `/login?returnUrl=${url.pathname}`);
    }
  },
);

interface EditFormData {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  location: string;
  birthDate: string;
  bio: string;
  salaryMin?: number;
  coordinates?: { lat: number; lng: number };
}

export default component$(() => {
  useProfileProtection();
  const nav = useNavigate();
  const auth = useAuth();
  const i18n = useI18n();
  const lang = i18n.currentLanguage;
  const t = useTranslate();

  const fileInputRef = useSignal<HTMLInputElement | undefined>();

  const state = useStore({
    isEditing: false,
    editingSection: "" as "profile" | "personal" | "",
    shouldRedirect: false,
    isSavingPersonal: false,
    message: { type: "success" as "success" | "error", text: "" },
    formData: {
      firstName: auth.user?.firstName || "",
      lastName: auth.user?.lastName || "",
      email: auth.user?.email || "",
      phone: auth.user?.phone || "",
      location: auth.user?.location || "",
      birthDate: auth.user?.birthDate || "",
      bio: auth.user?.bio || "",
      salaryMin: auth.user?.salaryMin,
    } as EditFormData,
    showCropper: false,
    cropperImage: "",
    // CV & Portfolio state
    cvs: [] as CvRecord[],
    cvsLoaded: false,
    portfolioUrl: auth.user?.portfolioUrl || "",
    editingPortfolio: false,
    isSavingPortfolio: false,
  });

  const loc = useLocation();

  // Check authentication and set redirect flag
  useTask$(({ track }) => {
    track(() => auth.isAuthenticated);
    if (isBrowser && !auth.isAuthenticated) {
      nav(`/login?returnUrl=${loc.url.pathname}`);
    }
  });

  // Handle redirect on client side only
  useTask$(({ track }) => {
    const shouldRedirect = track(() => state.shouldRedirect);
    if (shouldRedirect && isBrowser && !auth.isAuthenticated) {
      nav("/login");
    }
  });

  // Update form data when user changes
  useTask$(({ track }) => {
    const currentUser = track(() => auth.user);
    if (currentUser) {
      state.formData = {
        firstName: currentUser.firstName || "",
        lastName: currentUser.lastName || "",
        email: currentUser.email || "",
        phone: currentUser.phone || "",
        location: currentUser.location || "",
        birthDate: currentUser.birthDate || "",
        bio: currentUser.bio || "",
      };
    }
  });

  // Watch for profile update results
  useTask$(({ track }) => {
    const result = track(() => auth.profileUpdateResult.value);
    if (result) {
      state.isSavingPersonal = false;
      state.isEditing = false;
      state.editingSection = "";

      if (result.success) {
        state.message = {
          type: "success",
          text: translate("profile.update_success", i18n.currentLanguage),
        };
      } else {
        state.message = {
          type: "error",
          text:
            result.error ||
            translate("profile.update_error", i18n.currentLanguage),
        };
      }
      auth.profileUpdateResult.value = null;
      // Clear message after 5 seconds
      setTimeout(() => {
        state.message.text = "";
      }, 5000);
    }
  });

  // Watch for avatar update results
  useTask$(({ track }) => {
    const result = track(() => auth.avatarUpdateResult.value);
    if (result) {
      if (result.success) {
        state.message = {
          type: "success",
          text: translate("profile.avatar_success", i18n.currentLanguage),
        };
      } else {
        state.message = {
          type: "error",
          text: result.error
            ? translate(result.error, i18n.currentLanguage)
            : translate("profile.avatar_error", i18n.currentLanguage),
        };
      }
      auth.avatarUpdateResult.value = null;
      setTimeout(() => {
        state.message.text = "";
      }, 5000);
    }
  });

  // Load CVs once after authentication
  useTask$(({ track }) => {
    const isAuth = track(() => auth.isAuthenticated);
    if (!isAuth || state.cvsLoaded || !isBrowser) return;
    state.cvsLoaded = true;
    listCVs(auth.token || "")
      .then((cvs) => {
        state.cvs = cvs;
        state.portfolioUrl = auth.user?.portfolioUrl || "";
      })
      .catch(() => {
        state.message = {
          type: "error",
          text: translate("profile.cv_load_error", i18n.currentLanguage),
        };
      });
  });

  const handleSavePortfolio = $(async () => {
    if (!auth.token) return;
    state.isSavingPortfolio = true;
    try {
      const res = await request(`${API_URL}/users/me/profile`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${auth.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ portfolioUrl: state.portfolioUrl }),
      });
      if (res.ok) {
        if (auth.user)
          auth.user = { ...auth.user, portfolioUrl: state.portfolioUrl };
        state.editingPortfolio = false;
        state.message = {
          type: "success",
          text: translate("profile.portfolio_saved", i18n.currentLanguage),
        };
        setTimeout(() => {
          state.message.text = "";
        }, 4000);
      }
    } catch {
      // ignore
    } finally {
      state.isSavingPortfolio = false;
    }
  });

  const handleCvParsedFromProfile = $((extracted: ExtractedProfile) => {
    const u = auth.user;
    auth.updateProfileSignal.value = {
      languages:
        extracted.languages.length > 0
          ? extracted.languages
          : u?.languages || [],
      skills: extracted.skills.length > 0 ? extracted.skills : u?.skills || [],
      seniority: (extracted.seniority ||
        u?.seniority ||
        "") as WizardData["seniority"],
      availability: (extracted.availability ||
        u?.availability ||
        "") as WizardData["availability"],
      workModes:
        extracted.workModes.length > 0
          ? extracted.workModes
          : u?.workModes || [],
      salaryMin: extracted.salaryMin ?? u?.salaryMin ?? 0,
      portfolioUrl: u?.portfolioUrl || "",
    };
  });

  // Return early if not authenticated to prevent rendering
  if (!auth.isAuthenticated) {
    return null;
  }

  const handleEditProfile = $(() => {
    state.isEditing = true;
    state.editingSection = "profile";
  });

  const handleEditPersonal = $(() => {
    state.isEditing = true;
    state.editingSection = "personal";
  });

  const handleWizardComplete = $((data: WizardData) => {
    // Trigger profile update through signal
    auth.updateProfileSignal.value = data;
    state.isEditing = false;
    state.editingSection = "";
  });

  const handleCancelEdit = $(() => {
    state.isEditing = false;
    state.editingSection = "";
    // Reset form data
    state.formData = {
      firstName: auth.user?.firstName || "",
      lastName: auth.user?.lastName || "",
      email: auth.user?.email || "",
      phone: auth.user?.phone || "",
      location: auth.user?.location || "",
      birthDate: auth.user?.birthDate || "",
      bio: auth.user?.bio || "",
      salaryMin: auth.user?.salaryMin,
    };
  });

  const handleSavePersonal = $(() => {
    state.isSavingPersonal = true;
    state.message.text = "";
    // Trigger personal info update through signal
    auth.updatePersonalInfoSignal.value = { ...state.formData };
  });

  const handleAvatarClick = $(() => {
    fileInputRef.value?.click();
  });

  const handleAvatarChange = $((event: Event) => {
    const target = event.target as HTMLInputElement;
    const file = target.files?.[0];

    if (file && file.type.startsWith("image/")) {
      // Check file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        state.message = {
          type: "error",
          text: translate("profile.avatar_too_big", i18n.currentLanguage),
        };
        // Reset input
        if (fileInputRef.value) fileInputRef.value.value = "";
        return;
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result as string;
        if (result) {
          // Open cropper instead of direct update
          state.cropperImage = result;
          state.showCropper = true;
        }
      };
      reader.onerror = (e) => {
        logger.error({ e }, "FileReader error");
        state.message = {
          type: "error",
          text: translate("profile.avatar_error", i18n.currentLanguage),
        };
      };
      reader.readAsDataURL(file);
    }

    // Reset input value to allow selecting the same file again
    if (fileInputRef.value) fileInputRef.value.value = "";
  });

  const handleCropperConfirm = $((croppedImage: string) => {
    // Trigger avatar update through signal with cropped image
    auth.updateAvatarSignal.value = { avatar: croppedImage };
    state.showCropper = false;
    state.cropperImage = "";
  });

  const handleCropperCancel = $(() => {
    state.showCropper = false;
    state.cropperImage = "";
  });

  // Show wizard if editing profile data
  if (state.isEditing && state.editingSection === "profile") {
    const initialData: Partial<WizardData> = {
      languages: auth.user?.languages || [],
      skills: auth.user?.skills || [],
      seniority:
        (auth.user?.seniority as "junior" | "mid" | "senior" | "") || "",
      availability:
        (auth.user?.availability as "full-time" | "part-time" | "busy" | "") ||
        "",
      workModes: auth.user?.workModes || [],
      salaryMin: auth.user?.salaryMin || 0,
      portfolioUrl: auth.user?.portfolioUrl || "",
    };
    return (
      <ProfileWizard
        initialData={initialData}
        onComplete$={handleWizardComplete}
        onCancel$={handleCancelEdit}
        token={auth.token ?? undefined}
        showCvStep={true}
      />
    );
  }

  const formatAvailability = $((availability: string) => {
    switch (availability) {
      case "full-time":
        return translate("jobs.full_time", lang);
      case "part-time":
        return translate("jobs.part_time", lang);
      case "busy":
        return translate("profile.occupied", lang);
      default:
        return availability;
    }
  });

  const formatSeniority = $((seniority: string) => {
    switch (seniority) {
      case "junior":
        return translate("jobs.junior", lang);
      case "mid":
        return translate("jobs.mid", lang);
      case "senior":
        return translate("jobs.senior", lang);
      default:
        return seniority;
    }
  });

  return (
    <div class="mx-auto px-4 sm:px-6 lg:px-8 py-6 max-w-4xl">
      <div class="bg-brand-light-card dark:bg-brand-dark-card shadow-none border border-gray-200 dark:border-gray-800 rounded-sm overflow-hidden">
        {/* Feedback Message */}
        {state.message.text && (
          <div
            class={`p-4 rounded-t-lg text-center text-sm font-medium ${
              state.message.type === "success"
                ? "bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300"
                : "bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300"
            }`}
          >
            {state.message.text}
          </div>
        )}
        {/* Header */}
        <div class="px-4 sm:px-6 py-5 border-gray-200 dark:border-gray-700 border-b">
          <div class="flex justify-between items-center">
            <div class="flex items-center">
              <div class="relative">
                <div class="flex justify-center items-center bg-gray-100 dark:bg-gray-900 shadow-neon-sm border-2 border-brand-neon rounded-full w-20 h-20 overflow-hidden">
                  {auth.user?.avatar ? (
                    <img
                      src={auth.user.avatar}
                      alt="Avatar"
                      class="w-full h-full object-cover"
                      width="80"
                      height="80"
                    />
                  ) : (
                    <span class="font-bold text-gray-500 dark:text-gray-400 text-2xl">
                      {auth.user?.name?.charAt(0).toUpperCase() ||
                        auth.user?.email?.charAt(0).toUpperCase()}
                    </span>
                  )}
                </div>
                <button
                  class="-right-1 -bottom-1 absolute flex justify-center items-center bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 border-2 border-white dark:border-gray-800 rounded-full w-6 h-6"
                  onClick$={handleAvatarClick}
                  title={t("profile.change_avatar")}
                >
                  <svg
                    class="w-3 h-3 text-gray-600 dark:text-gray-300"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                    />
                  </svg>
                </button>
                {/* Hidden file input for avatar upload */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  class="hidden"
                  onChange$={handleAvatarChange}
                />
              </div>
              <div class="ml-4">
                <h1 class="font-bold text-gray-900 dark:text-white text-2xl">
                  {auth.user?.name || t("profile.title")}
                </h1>
                <p class="text-gray-500 dark:text-gray-400 text-sm">
                  {auth.user?.email}
                </p>
                {auth.user?.location && (
                  <p class="flex items-center mt-1 text-gray-500 dark:text-gray-400 text-sm">
                    <svg
                      class="mr-1 w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
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
                    {auth.user.location}
                  </p>
                )}
                {auth.user?.profileCompleted && (
                  <span class="inline-flex items-center bg-brand-neon/10 mt-1 px-2.5 py-0.5 border border-brand-neon/20 rounded-sm font-mono font-bold text-[10px] text-brand-neon uppercase">
                    {t("profile.completed")}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Profile content */}
        <div class="sm:p-6 px-4 py-5">
          {!auth.user?.profileCompleted ? (
            <div class="py-12 text-center">
              <div class="mx-auto mb-4 w-12 h-12 text-gray-400 dark:text-gray-500">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                  />
                </svg>
              </div>
              <h2 class="mb-2 font-medium text-gray-900 dark:text-white text-lg">
                {t("profile.complete_profile")}
              </h2>
              <p class="mb-4 text-gray-500 dark:text-gray-400">
                {t("profile.complete_desc")}
              </p>
              <div class="flex justify-center">
                <button
                  onClick$={handleEditProfile}
                  class="inline-flex items-center bg-brand-neon hover:bg-brand-neon-hover px-4 py-2 border border-transparent rounded-sm focus:outline-none focus:ring-2 focus:ring-brand-neon focus:ring-offset-2 font-mono font-bold text-white dark:text-black text-sm uppercase tracking-wide"
                >
                  {t("profile.complete_profile")}
                </button>
              </div>
            </div>
          ) : (
            <div class="space-y-8">
              {/* Personal Information */}
              <div class="bg-gray-50 dark:bg-gray-900/50 p-6 rounded-lg">
                <div class="flex justify-between items-center mb-4">
                  <h2 class="font-medium text-gray-900 dark:text-white text-lg">
                    {t("profile.personal_info")}
                  </h2>
                  <button
                    onClick$={handleEditPersonal}
                    class="text-xs btn-secondary"
                  >
                    <svg
                      class="mr-2 w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                      />
                    </svg>
                    {t("profile.edit_profile")}
                  </button>
                </div>

                {state.isEditing && state.editingSection === "personal" ? (
                  <div class="space-y-4">
                    <div class="gap-4 grid grid-cols-1 md:grid-cols-2">
                      <div>
                        <label class="block mb-1 font-medium text-gray-700 dark:text-gray-300 text-sm">
                          {t("auth.first_name")}
                        </label>
                        <input
                          type="text"
                          value={state.formData.firstName}
                          data-testid="profile-firstname"
                          onInput$={(e) =>
                            (state.formData.firstName = (
                              e.target as HTMLInputElement
                            ).value)
                          }
                          class="input"
                        />
                      </div>
                      <div>
                        <label class="block mb-1 font-medium text-gray-700 dark:text-gray-300 text-sm">
                          {t("auth.last_name")}
                        </label>
                        <input
                          type="text"
                          value={state.formData.lastName}
                          data-testid="profile-lastname"
                          onInput$={(e) =>
                            (state.formData.lastName = (
                              e.target as HTMLInputElement
                            ).value)
                          }
                          class="input"
                        />
                      </div>
                      <div>
                        <label class="block mb-1 font-mono font-bold text-gray-700 dark:text-gray-300 text-xs uppercase tracking-wider">
                          {t("profile.phone_label")}
                        </label>
                        <input
                          type="tel"
                          value={state.formData.phone}
                          onInput$={(e) =>
                            (state.formData.phone = (
                              e.target as HTMLInputElement
                            ).value)
                          }
                          class="input"
                        />
                      </div>
                    </div>
                    <div class="gap-4 grid grid-cols-1 md:grid-cols-2">
                      <div>
                        <label class="block mb-1 font-mono font-bold text-gray-700 dark:text-gray-300 text-xs uppercase tracking-wider">
                          {t("profile.location_label")}
                        </label>
                        <LocationAutocomplete
                          value={state.formData.location}
                          onInput$={(val) => {
                            state.formData.location = val;
                            state.formData.coordinates = undefined;
                          }}
                          onLocationSelect$={(location, coordinates) => {
                            state.formData.location = location;
                            state.formData.coordinates = coordinates;
                          }}
                          class="input"
                        />
                      </div>
                      <div>
                        <label class="block mb-1 font-mono font-bold text-gray-700 dark:text-gray-300 text-xs uppercase tracking-wider">
                          {t("profile.birth_date_label")}
                        </label>
                        <input
                          type="date"
                          value={state.formData.birthDate}
                          onInput$={(e) =>
                            (state.formData.birthDate = (
                              e.target as HTMLInputElement
                            ).value)
                          }
                          class="input"
                        />
                      </div>
                    </div>
                    <div>
                      <label class="block mb-1 font-mono font-bold text-gray-700 dark:text-gray-300 text-xs uppercase tracking-wider">
                        {t("profile.bio_label")}
                      </label>
                      <textarea
                        value={state.formData.bio}
                        onInput$={(e) =>
                          (state.formData.bio = (
                            e.target as HTMLTextAreaElement
                          ).value)
                        }
                        rows={4}
                        data-testid="profile-bio"
                        class="input"
                        placeholder={t("profile.complete_desc")}
                      />
                    </div>
                    <div class="flex space-x-3">
                      <button
                        onClick$={handleSavePersonal}
                        disabled={state.isSavingPersonal}
                        data-testid="profile-save"
                        class="btn-primary"
                      >
                        {state.isSavingPersonal && (
                          <Spinner size="sm" class="mr-2 -ml-1" />
                        )}
                        {state.isSavingPersonal
                          ? t("common.saving")
                          : t("profile.save_changes")}
                      </button>
                      <button onClick$={handleCancelEdit} class="btn-secondary">
                        {t("profile.cancel")}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div class="gap-6 grid grid-cols-1 md:grid-cols-2">
                    <div>
                      <dt class="font-medium text-gray-500 dark:text-gray-400 text-sm">
                        {t("profile.name_label")}
                      </dt>
                      <dd class="mt-1 text-gray-900 dark:text-white text-sm">
                        {auth.user?.name || "-"}
                      </dd>
                    </div>
                    <div>
                      <dt class="font-medium text-gray-500 dark:text-gray-400 text-sm">
                        {t("profile.email_label")}
                      </dt>
                      <dd class="mt-1 text-gray-900 dark:text-white text-sm">
                        {auth.user?.email || "-"}
                      </dd>
                    </div>
                    <div>
                      <dt class="font-medium text-gray-500 dark:text-gray-400 text-sm">
                        {t("profile.phone_label")}
                      </dt>
                      <dd class="mt-1 text-gray-900 dark:text-white text-sm">
                        {auth.user?.phone || "-"}
                      </dd>
                    </div>
                    <div>
                      <dt class="font-medium text-gray-500 dark:text-gray-400 text-sm">
                        {t("profile.location_label")}
                      </dt>
                      <dd class="mt-1 text-gray-900 dark:text-white text-sm">
                        {auth.user?.location || "-"}
                      </dd>
                    </div>
                    <div>
                      <dt class="font-medium text-gray-500 dark:text-gray-400 text-sm">
                        {t("profile.birth_date_label")}
                      </dt>
                      <dd class="mt-1 text-gray-900 dark:text-white text-sm">
                        {formatLocaleDate(auth.user?.birthDate, lang)}
                      </dd>
                    </div>
                    {auth.user?.bio && (
                      <div class="md:col-span-2">
                        <dt class="font-medium text-gray-500 dark:text-gray-400 text-sm">
                          {t("profile.bio_label")}
                        </dt>
                        <dd class="mt-1 text-gray-900 dark:text-white text-sm">
                          {auth.user.bio}
                        </dd>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Professional Information */}
              <div class="bg-gray-50 dark:bg-gray-900/50 p-6 rounded-lg">
                <div class="flex justify-between items-center mb-4">
                  <h2 class="font-medium text-gray-900 dark:text-white text-lg">
                    {t("profile.professional_info")}
                  </h2>
                  <button
                    onClick$={handleEditProfile}
                    class="text-xs btn-secondary"
                  >
                    <svg
                      class="mr-2 w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                      />
                    </svg>
                    {t("profile.edit_profile")}
                  </button>
                </div>

                <div class="space-y-6">
                  {/* Languages */}
                  <div>
                    <h3 class="mb-3 font-medium text-gray-500 dark:text-gray-400 text-sm">
                      {t("profile.languages_title")}
                    </h3>
                    <div class="flex flex-wrap gap-2">
                      {auth.user?.languages?.map((lang) => {
                        // Try to translate the language name
                        // If the language is stored as "Italian", we need to find the matching key
                        const langKey = `lang.${lang.toLowerCase()}`;
                        const translatedLang = t(langKey);
                        // If translation returns the key itself, use the original value
                        const displayLang =
                          translatedLang === langKey ? lang : translatedLang;

                        return (
                          <span
                            key={lang}
                            class="inline-flex items-center bg-brand-neon/10 px-3 py-1 border border-brand-neon/20 rounded-sm font-mono font-bold text-brand-neon text-xs"
                          >
                            {displayLang}
                          </span>
                        );
                      })}
                    </div>
                  </div>

                  {/* Skills */}
                  <div>
                    <h3 class="mb-3 font-medium text-gray-500 dark:text-gray-400 text-sm">
                      {t("profile.skills_title")}
                    </h3>
                    <div class="flex flex-wrap gap-2">
                      {auth.user?.skills?.map((skill) => (
                        <span
                          key={skill}
                          class="inline-flex items-center bg-brand-neon/10 px-3 py-1 border border-brand-neon/20 rounded-sm font-mono font-bold text-brand-neon text-xs"
                        >
                          {skill}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Seniority & Availability */}
                  <div class="gap-6 grid grid-cols-1 md:grid-cols-2">
                    <div>
                      <h3 class="mb-3 font-medium text-gray-500 dark:text-gray-400 text-sm">
                        {t("profile.seniority_title")}
                      </h3>
                      <div class="flex items-center">
                        <div class="bg-brand-neon mr-3 rounded-full w-3 h-3"></div>
                        <span class="font-medium text-gray-900 dark:text-white text-sm capitalize">
                          {formatSeniority(auth.user?.seniority || "")}
                        </span>
                      </div>
                    </div>

                    <div>
                      <h3 class="mb-3 font-medium text-gray-500 dark:text-gray-400 text-sm">
                        {t("profile.availability_title")}
                      </h3>
                      <div class="flex items-center">
                        <div class="bg-green-500 dark:bg-green-400 mr-3 rounded-full w-3 h-3"></div>
                        <span class="font-medium text-gray-900 dark:text-white text-sm capitalize">
                          {formatAvailability(auth.user?.availability || "")}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Work Modes */}
                  <div>
                    <h3 class="mb-3 font-medium text-gray-500 dark:text-gray-400 text-sm">
                      {t("profile.work_modes_title")}
                    </h3>
                    <div class="flex flex-wrap gap-2">
                      {auth.user?.workModes?.map((mode) => (
                        <span
                          key={mode}
                          class="inline-flex items-center bg-brand-neon/10 px-3 py-1 border border-brand-neon/20 rounded-sm font-mono font-bold text-brand-neon text-xs"
                        >
                          {t(`wizard.${mode}_label`)}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Minimum Salary */}
                  {(auth.user?.salaryMin ?? 0) > 0 && (
                    <div>
                      <h3 class="mb-3 font-medium text-gray-500 dark:text-gray-400 text-sm">
                        {t("profile.salary_min_label")}
                      </h3>
                      <div class="flex items-center">
                        <div class="bg-brand-neon mr-3 rounded-full w-3 h-3"></div>
                        <span class="font-mono font-bold text-brand-neon text-sm">
                          €{Number(auth.user.salaryMin).toLocaleString("it-IT")}
                          +
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
      {/* Documents Section */}
      <div
        class="mt-6 bg-white dark:bg-gray-800 shadow-lg border border-gray-100 dark:border-gray-700 rounded-2xl overflow-hidden"
        data-testid="cv-section"
      >
        <div class="p-8">
          <h2 class="mb-6 font-bold text-gray-900 dark:text-white text-xl">
            {t("profile.documents_title")}
          </h2>

          <CvUploadStep
            token={auth.token || ""}
            mode="profile"
            existingCvs={state.cvs}
            portfolioUrl={state.portfolioUrl}
            onParsed$={handleCvParsedFromProfile}
            onUploaded$={$((cv: CvRecord) => {
              const idx = state.cvs.findIndex(
                (c) => c.language === cv.language,
              );
              if (idx >= 0) {
                state.cvs[idx] = cv;
              } else {
                state.cvs = [...state.cvs, cv];
              }
            })}
            onDeleted$={$((cvId: string) => {
              state.cvs = state.cvs.filter((c) => c.id !== cvId);
            })}
            onPortfolioChange$={$((url: string) => {
              state.portfolioUrl = url;
            })}
          />

          {/* Portfolio URL save button (profile mode) */}
          <div class="flex items-center gap-3 mt-4">
            {state.editingPortfolio ? (
              <>
                <button
                  class="btn-primary text-xs"
                  onClick$={handleSavePortfolio}
                  disabled={state.isSavingPortfolio}
                >
                  {state.isSavingPortfolio ? (
                    <Spinner size="sm" />
                  ) : (
                    t("profile.save_changes")
                  )}
                </button>
                <button
                  class="btn-secondary text-xs"
                  onClick$={() => {
                    state.editingPortfolio = false;
                    state.portfolioUrl = auth.user?.portfolioUrl || "";
                  }}
                >
                  {t("profile.cancel")}
                </button>
              </>
            ) : (
              <button
                class="btn-secondary text-xs"
                onClick$={() => (state.editingPortfolio = true)}
              >
                {t("profile.save_changes")}
              </button>
            )}
          </div>
        </div>
      </div>

      {state.showCropper && (
        <AvatarCropper
          imageSrc={state.cropperImage}
          onConfirm$={handleCropperConfirm}
          onCancel$={handleCropperCancel}
        />
      )}
    </div>
  );
});

export const useProfileHeadLoader = routeLoader$(() => {
  const t = (key: string) => translate(key, "it");
  return {
    title: t("meta.profile_title"),
    description: t("meta.profile_description"),
  };
});

export const head: DocumentHead = ({ resolveValue }) => {
  const meta = resolveValue(useProfileHeadLoader);
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
