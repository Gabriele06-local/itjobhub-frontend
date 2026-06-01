import {
  component$,
  useStylesScoped$,
  $,
  type PropFunction,
  type Signal,
} from "@builder.io/qwik";
import { useI18n, translate } from "~/contexts/i18n";
import { useAuth } from "~/contexts/auth";
import { BreadcrumbSchema, JobPostingSchema } from "~/components/seo/json-ld";
import { JobHeader } from "~/components/jobs/job-header";
import { JobMapSection } from "~/components/jobs/job-map-section";
import { JobDescription } from "~/components/jobs/job-description";
import { JobSkillsList } from "~/components/jobs/job-skills-list";
import { CompanyInfoBox } from "~/components/jobs/company-info-box";
import { MatchBreakdown } from "~/components/jobs/match-breakdown";
import { Modal } from "~/components/ui/modal";
import { ScrollButtons } from "~/components/ui/scroll-buttons";
import { UnifiedCommentsSection } from "~/components/ui/comments-section";
import { SITE_URL } from "~/constants";
import type { JobListing } from "~/contexts/jobs";
import type { MatchScore } from "~/types/models";
import styles from "../../routes/jobs/detail/[id]/index.css?inline";

interface JobDetailContentProps {
  job: JobListing;
  matchScore: MatchScore | null;
  onToggleFavorite$: PropFunction<() => Promise<void>>;
  onApplyClick$: PropFunction<() => void>;
  onReactionComplete$: PropFunction<() => void>;
  onDeleteJob$: PropFunction<() => Promise<void>>;
  onAddSkill$: PropFunction<(skill: string) => Promise<void>>;
  isDeleting: boolean;
  showDeleteModal: Signal<boolean>;
  /** Daily apply limit reached — disable the Apply button with a message. */
  applyDisabled?: boolean;
  applyLimit?: number;
}

export const JobDetailContent = component$<JobDetailContentProps>((props) => {
  useStylesScoped$(styles);
  const i18n = useI18n();
  const auth = useAuth();
  const { job, matchScore, isDeleting, showDeleteModal } = props;

  return (
    <div class="mainContent">
      <BreadcrumbSchema
        items={[
          { name: "Home", url: `${SITE_URL}/` },
          {
            name: "Jobs",
            url: `${SITE_URL}/jobs`,
          },
          { name: job.title, url: `${SITE_URL}/jobs/detail/${job.id}` },
        ]}
      />
      {/* JobPosting JSON-LD for SEO */}
      <JobPostingSchema
        title={job.title}
        description={
          job.description?.replace(/<[^>]*>/g, "").substring(0, 500) ||
          job.title
        }
        datePosted={
          job.publishDate instanceof Date
            ? job.publishDate.toISOString()
            : new Date().toISOString()
        }
        employmentType={job.availability || "full_time"}
        hiringOrganization={{
          name: job.company,
          logo: job.companyLogo,
        }}
        jobLocation={
          job.location
            ? {
                addressLocality: job.location,
                addressCountry: "IT",
              }
            : undefined
        }
        isRemote={job.remote}
        skills={job.skills}
      />

      {/* Header Card */}
      <div class="card">
        <JobHeader
          job={job}
          isAuthenticated={auth.isAuthenticated}
          isAdmin={auth.user?.role === "admin"}
          onToggleFavorite$={props.onToggleFavorite$}
          onApplyClick$={props.onApplyClick$}
          onReactionComplete$={props.onReactionComplete$}
          applyDisabled={props.applyDisabled}
          applyLimit={props.applyLimit}
        />
        <div class="px-8 md:px-10 pb-8">
          {auth.user?.role === "admin" && (
            <>
              <button
                data-testid="delete-button"
                onClick$={$(() => (showDeleteModal.value = true))}
                class="hover:bg-red-50 px-4 py-2 border border-red-200 rounded font-bold text-red-600"
              >
                {translate("job.delete", i18n.currentLanguage)}
              </button>

              {showDeleteModal.value && (
                <Modal
                  title={translate(
                    "job.confirm_delete_title",
                    i18n.currentLanguage,
                  )}
                  isOpen={showDeleteModal}
                  onConfirm$={props.onDeleteJob$}
                  isDestructive={true}
                  isLoading={isDeleting}
                  confirmText={translate("job.delete", i18n.currentLanguage)}
                  cancelText={translate("common.cancel", i18n.currentLanguage)}
                >
                  <p>
                    {translate("job.confirm_delete_msg", i18n.currentLanguage)}
                  </p>
                </Modal>
              )}
            </>
          )}
        </div>
      </div>

      {/* Map Card - if GPS available */}
      {job.location_geo && job.location_geo.coordinates && (
        <div class="card">
          <JobMapSection
            location={job.location || ""}
            geo={{
              lat: job.location_geo.coordinates[1],
              lng: job.location_geo.coordinates[0],
            }}
          />
        </div>
      )}

      {/* Description Card */}
      <div class="card">
        <JobDescription description={job.description || ""} />
      </div>

      {/* Skills Card */}
      {job.skills && job.skills.length > 0 && (
        <div class="card">
          <JobSkillsList
            skills={job.skills || []}
            userSkills={auth.user?.skills || []}
            onAddSkill$={props.onAddSkill$}
          />
        </div>
      )}

      <CompanyInfoBox company={job.company} companyScore={job.companyScore} />

      {/* Match Breakdown Card */}
      {matchScore && (
        <MatchBreakdown
          score={matchScore.score}
          factors={matchScore.factors}
          details={matchScore.details}
        />
      )}

      <UnifiedCommentsSection ownerId={job.id} type="job" />

      <ScrollButtons />
    </div>
  );
});
