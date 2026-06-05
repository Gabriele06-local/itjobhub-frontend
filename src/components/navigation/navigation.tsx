import {
  component$,
  $,
  useStore,
  useStyles$,
  useTask$,
} from "@builder.io/qwik";
import { Link, useLocation } from "@builder.io/qwik-city";
import { useAuth } from "~/contexts/auth";
import {
  useI18n,
  useTranslate,
  setLanguage,
  type SupportedLanguage,
} from "~/contexts/i18n";
import { useTheme } from "~/contexts/theme";
import { Logo } from "~/components/common/logo";
import styles from "./navigation.css?inline";

export const Navigation = component$(() => {
  useStyles$(styles);
  const auth = useAuth();
  const i18n = useI18n();
  const theme = useTheme();
  const t = useTranslate();
  const location = useLocation();

  // Extract values and signals to avoid serialization issues
  const currentLanguage = i18n.currentLanguage;
  const logoutSignal = auth.logoutSignal;

  /* State for mobile menu */
  const state = useStore({
    showLanguageDropdown: false,
    isMenuOpen: false,
  });

  // Close menu when route changes
  useTask$(({ track }) => {
    track(() => location.url.pathname);
    state.isMenuOpen = false;
  });

  const handleLogout = $(() => {
    // Trigger logout through signal
    logoutSignal.value = true;
    state.isMenuOpen = false;
  });

  const toggleLanguageDropdown = $(() => {
    state.showLanguageDropdown = !state.showLanguageDropdown;
  });

  const toggleMenu = $(() => {
    state.isMenuOpen = !state.isMenuOpen;
  });

  const closeMenu = $(() => {
    state.isMenuOpen = false;
  });

  const selectLanguage = $((lang: SupportedLanguage) => {
    // Persists the cookie and re-renders via SSR — see setLanguage's doc.
    state.showLanguageDropdown = false;
    setLanguage(lang);
  });

  const languages = [
    { code: "it" as SupportedLanguage, name: t("lang.italian"), flag: "🇮🇹" },
    { code: "en" as SupportedLanguage, name: t("lang.english"), flag: "🇺🇸" },
    { code: "es" as SupportedLanguage, name: t("lang.spanish"), flag: "🇪🇸" },
    { code: "de" as SupportedLanguage, name: t("lang.german"), flag: "🇩🇪" },
    { code: "fr" as SupportedLanguage, name: t("lang.french"), flag: "🇫🇷" },
  ];

  const currentLanguageObj = languages.find(
    (lang) => lang.code === currentLanguage,
  );

  return (
    <nav class="nav-wrapper">
      <div class="container">
        <div class="nav-content">
          {/* Left Side: Brand & (Desktop) Links */}
          <div class="nav-left">
            <Link href="/" class="brand-link" aria-label="DevBoards.io Home">
              <Logo />
            </Link>

            {/* Desktop Navigation Links */}
            <div class="desktop-links">
              <Link href="/jobs" class="nav-link">
                {t("nav.jobs")}
              </Link>
              <Link href="/news" class="nav-link">
                {t("nav.news")}
              </Link>
              {auth.user?.role === "admin" && (
                <Link href="/admin/stats" class="nav-link">
                  {t("nav.dashboard")}
                </Link>
              )}
              {auth.isAuthenticated && (
                <Link href="/favorites" class="nav-link">
                  {t("nav.favorites")}
                </Link>
              )}
            </div>
          </div>

          {/* Right Side: Theme, Lang, Auth (Desktop), Hamburger (Mobile) */}
          <div class="nav-right">
            {/* Theme toggle - Always Visible */}
            <button
              onClick$={theme.toggleTheme}
              class="theme-toggle"
              aria-label="Toggle theme"
              data-testid="theme-toggle"
            >
              {theme.theme === "light" ? (
                <svg
                  class="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"
                  />
                </svg>
              ) : (
                <svg
                  class="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
                  />
                </svg>
              )}
            </button>

            {/* Language selector - Always Visible */}
            <div class="lang-selector">
              <button onClick$={toggleLanguageDropdown} class="lang-btn">
                <span>{currentLanguageObj?.flag}</span>
                <span class="hidden md:inline">{currentLanguageObj?.name}</span>
                <svg
                  class="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </button>

              {state.showLanguageDropdown && (
                <div class="lang-dropdown">
                  <div class="py-1">
                    {languages.map((lang) => (
                      <button
                        key={lang.code}
                        onClick$={$(() => selectLanguage(lang.code))}
                        data-testid={`lang-select-${lang.code}`}
                        class={`lang-dropdown-item ${
                          lang.code === currentLanguage
                            ? "lang-dropdown-item-active"
                            : "lang-dropdown-item-default"
                        }`}
                      >
                        <span class="mr-2">{lang.flag}</span>
                        {lang.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Desktop Auth Buttons */}
            <div class="desktop-auth">
              {auth.isAuthenticated ? (
                <>
                  <Link
                    href="/user/messages"
                    class={`nav-icon-link ${location.url.pathname.startsWith("/user/messages") ? "active" : ""}`}
                    title={t("nav.messages")}
                    aria-label={t("nav.messages")}
                  >
                    <svg
                      class="w-5 h-5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                      />
                    </svg>
                  </Link>
                  <Link
                    href="/profile"
                    class={`nav-icon-link nav-avatar ${location.url.pathname.startsWith("/profile") ? "active" : ""}`}
                    title={t("nav.profile")}
                    aria-label={t("nav.profile")}
                  >
                    {auth.user?.avatar ? (
                      <img
                        src={auth.user.avatar}
                        alt={t("nav.profile")}
                        class="nav-avatar-img"
                        width={28}
                        height={28}
                      />
                    ) : (
                      <svg
                        class="w-7 h-7"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                        aria-hidden="true"
                      >
                        <path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          stroke-width="2"
                          d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                        />
                      </svg>
                    )}
                  </Link>
                  <button
                    onClick$={handleLogout}
                    class="btn-logout"
                    data-testid="logout-button-desktop"
                  >
                    {t("nav.logout")}
                  </button>
                </>
              ) : (
                <>
                  <Link href="/login" class="nav-link">
                    {t("nav.login")}
                  </Link>
                  <Link href="/register" class="rounded-sm btn-primary btn-sm">
                    {t("nav.register")}
                  </Link>
                </>
              )}
            </div>

            {/* Mobile Hamburger Button */}
            <div class="mobile-menu-btn-wrapper">
              <button
                onClick$={toggleMenu}
                type="button"
                data-testid="mobile-menu-button"
                class="mobile-menu-btn"
                aria-expanded="false"
              >
                <span class="sr-only">{t("nav.open_menu")}</span>
                {/* Icon when menu is closed */}
                {!state.isMenuOpen ? (
                  <svg
                    class="block w-6 h-6"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    aria-hidden="true"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M4 6h16M4 12h16M4 18h16"
                    />
                  </svg>
                ) : (
                  /* Icon when menu is open */
                  <svg
                    class="block w-6 h-6"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    aria-hidden="true"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile Menu */}
      {state.isMenuOpen && (
        <div class="mobile-menu">
          <div class="mobile-menu-panel">
            <Link
              href="/jobs"
              onClick$={closeMenu}
              class={`mobile-nav-link ${location.url.pathname.startsWith("/jobs") ? "active" : ""}`}
            >
              {t("nav.jobs")}
            </Link>
            <Link
              href="/news"
              onClick$={closeMenu}
              class={`mobile-nav-link ${location.url.pathname.startsWith("/news") ? "active" : ""}`}
            >
              {t("nav.news")}
            </Link>
            {auth.user?.role === "admin" && (
              <Link
                href="/admin/stats"
                onClick$={closeMenu}
                class={`mobile-nav-link ${location.url.pathname.startsWith("/admin") ? "active" : ""}`}
              >
                {t("nav.dashboard")}
              </Link>
            )}
            {auth.isAuthenticated && (
              <Link
                href="/favorites"
                onClick$={closeMenu}
                class={`mobile-nav-link ${location.url.pathname.startsWith("/favorites") ? "active" : ""}`}
              >
                {t("nav.favorites")}
              </Link>
            )}

            <div class="mobile-divider">
              {auth.isAuthenticated ? (
                <div class="mobile-auth-wrapper">
                  <Link
                    href="/profile"
                    onClick$={closeMenu}
                    class={`mobile-nav-link ${location.url.pathname.startsWith("/profile") ? "active" : ""}`}
                  >
                    {t("nav.profile")}
                  </Link>
                  <Link
                    href="/user/messages"
                    onClick$={closeMenu}
                    class={`mobile-nav-link ${location.url.pathname.startsWith("/user/messages") ? "active" : ""}`}
                  >
                    {t("nav.messages")}
                  </Link>
                  <button
                    onClick$={handleLogout}
                    class="mobile-btn-logout"
                    data-testid="logout-button-mobile"
                  >
                    {t("nav.logout")}
                  </button>
                </div>
              ) : (
                <div class="mobile-auth-wrapper">
                  <Link
                    href="/login"
                    onClick$={closeMenu}
                    class={`mobile-nav-link ${location.url.pathname.startsWith("/login") ? "active" : ""}`}
                  >
                    {t("nav.login")}
                  </Link>
                  <Link
                    href="/register"
                    onClick$={closeMenu}
                    class="justify-center w-full btn-primary"
                  >
                    {t("nav.register")}
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </nav>
  );
});
