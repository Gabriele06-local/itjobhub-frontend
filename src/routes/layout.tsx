import { component$, Slot } from "@builder.io/qwik";
import { routeLoader$ } from "@builder.io/qwik-city";
import { AuthProvider, type User } from "~/contexts/auth";
import { JobsProvider } from "~/contexts/jobs";
import { I18nProvider, type SupportedLanguage } from "~/contexts/i18n";
import { ThemeProvider } from "~/contexts/theme";
import { Navigation } from "~/components/navigation/navigation";
import { Footer } from "~/components/footer/footer";
import { CookieConsent } from "~/components/common/cookie-consent/cookie-consent";
import logger from "~/utils/logger";
import { API_URL } from "~/constants";
export const useAuthLoader = routeLoader$(async ({ cookie, url, redirect }) => {
  let token = cookie.get("auth_token")?.value;
  // Prioritize query param ?lang=xx over cookie for SEO/direct links
  const queryLang = url.searchParams.get("lang");
  const cookieLang = cookie.get("preferred-language")?.value;
  const lang = (
    queryLang && ["it", "en", "es", "de", "fr"].includes(queryLang)
      ? queryLang
      : cookieLang || "it"
  ) as SupportedLanguage;

  let user: User | null = null;

  if (token) {
    try {
      // Determine API URL (handle both local and production if needed)
      // In Qwik loaders we use process.env for server-side env vars

      const response = await fetch(`${API_URL}/users/me`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          const bu = result.data;
          // Map backend user to frontend User interface
          user = {
            id: bu.id,
            email: bu.email,
            firstName: bu.firstName,
            lastName: bu.lastName,
            name: `${bu.firstName} ${bu.lastName}`,
            role: bu.role,
            phone: bu.phone,
            location: bu.location,
            location_geo: bu.location_geo,
            birthDate: bu.birthDate,
            bio: bu.bio,
            avatar: bu.avatar,
            salaryMin: bu.salaryMin,
            languages: bu.profile?.languages || [],
            skills: bu.profile?.skills || [],
            seniority: bu.profile?.seniority,
            availability: bu.profile?.availability,
            workModes: bu.profile?.workModes || [],
            portfolioUrl: bu.profile?.portfolioUrl,
            // Profile completion is now calculated by backend
            profileCompleted: bu.profileCompleted,
          };
        }
      } else if (response.status === 401) {
        // Token is invalid or expired
        cookie.delete("auth_token", { path: "/" });
        token = undefined; // Mark as invalid for subsequent checks
      }
    } catch (e) {
      logger.error({ e }, "[SSR] Failed to fetch user data");
    }
  }

  const path = url.pathname;

  // --- Authentication Guards ---

  // Helper to match route prefixes safely (e.g. /login matches /login and /login/ but not /login-foo)
  const isMatch = (routes: string[]) =>
    routes.some((r) => path === r || path.startsWith(r + "/"));

  // 1. Guest-Only Routes (Redirect to / if logged in)
  const guestRoutes = [
    "/login",
    "/register",
    "/forgot-password",
    "/reset-password",
  ];
  if (token && isMatch(guestRoutes)) {
    throw redirect(302, "/");
  }

  // 2. Protected Routes (Redirect to /login if NOT logged in)
  const protectedRoutes = ["/profile", "/favorites", "/wizard", "/admin"];
  if (!token && isMatch(protectedRoutes)) {
    throw redirect(302, `/login/?returnUrl=${encodeURIComponent(path)}`);
  }

  // 3. Profile Completion Guard (Redirect to /wizard if incomplete) - Exempt admins
  if (user && user.role !== "admin" && !user.profileCompleted) {
    const allowedPaths = [
      "/wizard",
      "/auth",
      "/privacy-policy",
      "/cookie-policy",
    ];
    const isAllowed = allowedPaths.some((p) => path.startsWith(p));

    if (!isAllowed) {
      throw redirect(302, "/wizard");
    }
  }

  return {
    token: token || null,
    user,
    lang: lang || "it",
  };
});

export default component$(() => {
  const authData = useAuthLoader();

  return (
    <ThemeProvider>
      <I18nProvider initialLanguage={authData.value.lang}>
        <AuthProvider
          initialToken={authData.value.token}
          initialUser={authData.value.user}
        >
          <JobsProvider>
            <div class="flex flex-col min-h-screen">
              {/* Skip Link for keyboard accessibility - WCAG 2.1 AA */}
              <a href="#main-content" class="skip-link">
                Skip to main content
              </a>

              <Navigation />

              <main
                id="main-content"
                class="flex-grow bg-gray-50 dark:bg-gray-950"
                role="main"
                tabIndex={-1}
              >
                <Slot />
              </main>

              <Footer />

              {/* Cookie consent banner — GDPR Art. 13 transparency notice */}
              <CookieConsent />

              {/* ARIA Live Region for dynamic announcements */}
              <div
                id="live-announcer"
                class="live-region"
                aria-live="polite"
                aria-atomic="true"
              />
            </div>
          </JobsProvider>
        </AuthProvider>
      </I18nProvider>
    </ThemeProvider>
  );
});
