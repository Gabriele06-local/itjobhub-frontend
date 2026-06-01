import { component$, useStylesScoped$ } from "@builder.io/qwik";
import { useTranslate } from "~/contexts/i18n";
import styles from "./cta-section.css?inline";

interface CTASectionProps {
  isAuthenticated: boolean;
}

export const CTASection = component$<CTASectionProps>(({ isAuthenticated }) => {
  useStylesScoped$(styles);
  const t = useTranslate();

  return (
    <section class="cta-section">
      <div class="bg-overlay">
        <div class="bg-pattern"></div>
        <div class="blob-1"></div>
        <div class="blob-2"></div>
      </div>
      <div class="container">
        <h2 class="heading">{t("home.cta_title")}</h2>
        <p class="description">{t("home.cta_desc")}</p>
        {!isAuthenticated && (
          <div class="actions">
            <a href="/register" class="btn-primary btn-lg">
              {t("home.register_free")}
            </a>
            <a href="/login" class="btn-login">
              {t("home.login")}
            </a>
          </div>
        )}
        <div class="actions actions-secondary">
          <a href="/contact" class="btn-login">
            {t("home.contact_cta")}
          </a>
        </div>
      </div>
    </section>
  );
});
