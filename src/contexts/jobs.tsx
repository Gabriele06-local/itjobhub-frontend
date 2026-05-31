import { getVisitorId } from "../utils/visitor";
import {
  createContextId,
  Slot,
  component$,
  useStore,
  useContext,
  useContextProvider,
  useSignal,
  useTask$,
  Signal,
  $,
  QRL,
  isBrowser,
} from "@builder.io/qwik";
import { useAuth } from "./auth";
import { request } from "../utils/api";
import logger from "../utils/logger";
import type {
  ApiJob,
  ApiComment,
  ApiCompany,
  MatchScore,
} from "../types/models";

export interface JobListing {
  id: string;
  title: string;
  company: string;
  description?: string;
  skills: string[];
  seniority: "junior" | "mid" | "senior" | "unknown";
  availability:
    | "full_time"
    | "part_time"
    | "hybrid"
    | "contract"
    | "freelance"
    | "not_specified";
  location?: string;
  location_geo?: { coordinates: number[] };
  remote?: boolean;
  salary?: string;
  externalLink: string;
  likes: number;
  dislikes: number;
  publishDate: Date;
  companyLogo?: string;
  language?: string;
  comments_count?: number;
  user_reaction?: "LIKE" | "DISLIKE" | null;
  is_favorite?: boolean;
  companyScore?: number;
  companyLikes?: number;
  companyDislikes?: number;
  views_count?: number;
  clicks_count?: number;
}

export interface Comment {
  id: string;
  jobId: string;
  userId: string; // Added field
  author: {
    name: string;
    avatar?: string;
  };
  text: string;
  date: Date;
}

export interface Company {
  name: string;
  trustScore: number; // 0-100
  totalRatings: number;
}

export interface LikeJobRequest {
  jobId: string;
  remove?: boolean;
  wasDisliked?: boolean;
}

export interface DislikeJobRequest {
  jobId: string;
  remove?: boolean;
  wasLiked?: boolean;
}

export interface AddCommentRequest {
  jobId: string;
  author: { name: string; avatar?: string };
  text: string;
}

export interface PaginationState {
  currentPage: number;
  hasMore: boolean;
  isLoading: boolean;
  totalJobs: number;
  limit: number;
}

export interface ApiPagination {
  page: number;
  pages: number;
  total: number;
  limit: number;
}

export interface JobsState {
  jobs: JobListing[];
  favorites: JobListing[];
  comments: Comment[];
  companies: Company[];
  pagination: PaginationState;
  currentFilters: JobFilters | null;
  loadingJobId: string | null; // For favorites/actions
  loadingReactionId: string | null; // For reactions
  // Signals for triggering actions
  likeJobSignal: Signal<LikeJobRequest | null>;
  dislikeJobSignal: Signal<DislikeJobRequest | null>;
  addCommentSignal: Signal<AddCommentRequest | null>;
  // QRL functions
  fetchComments$: QRL<(jobId: string) => Promise<void>>;
  fetchJobsPage$: QRL<
    (page: number, filters?: JobFilters, append?: boolean) => Promise<void>
  >;
  loadMoreJobs$: QRL<() => Promise<void>>;
  toggleFavorite$: QRL<(jobId: string) => Promise<void>>;
  fetchFavorites$: QRL<() => Promise<void>>;
  deleteComment$: QRL<(commentId: string) => Promise<void>>;
  editComment$: QRL<(commentId: string, newContent: string) => Promise<void>>;
  fetchTopSkills$: QRL<
    (
      limit?: number,
      year?: number,
    ) => Promise<{ skill: string; count: number }[]>
  >;
  fetchJobById$: QRL<(id: string) => Promise<JobListing | null>>;
  trackJobInteraction$: QRL<
    (
      jobId: string,
      type: "VIEW" | "APPLY",
    ) => Promise<{ ok: boolean; limitReached: boolean }>
  >;
  fetchJobMatchScore$: QRL<(jobId: string) => Promise<MatchScore | null>>;
  fetchBatchMatchScores$: QRL<
    (
      jobIds: string[],
    ) => Promise<
      Record<
        string,
        { score: number; label: "excellent" | "good" | "fair" | "low" }
      >
    >
  >;
  setInitialData$: QRL<
    (jobs: ApiJob[], pagination: ApiPagination, filters?: JobFilters) => void
  >;
}

export interface JobFilters {
  skills?: string[];
  seniority?: string;
  availability?: string;
  remote?: boolean;
  query?: string;
  dateRange?: string;
  location_geo?: { lat: number; lng: number };
  radius_km?: number;
  languages?: string[];
  location?: string;
  looseSeniority?: boolean;
  salaryMin?: number;
  minMatchScore?: number;
}

// Helper to process raw API job into JobListing (outside component to avoid QRL serialization issues)
export const processApiJob = (job: ApiJob): JobListing => {
  let desc = job.description || "";
  desc = desc
    .replace(/^(&nbsp;|\s|\.|\u00A0)+/g, "")
    .replace(/^(\.\.\.)+/g, "")
    .trim();

  return {
    id: job.id,
    title: job.title,
    company: job.company?.name || "Unknown Company",
    description: desc,
    skills:
      job.technical_skills && job.technical_skills.length > 0
        ? job.technical_skills
        : job.skills || [],
    seniority: (
      job.seniority || "unknown"
    ).toLowerCase() as JobListing["seniority"],
    availability: (job.employment_type || "not_specified")
      .toLowerCase()
      .replace("-", "_") as JobListing["availability"],
    location: job.location || undefined,
    remote: job.remote || job.is_remote || false,
    salary: job.salary_min
      ? `€${job.salary_min.toLocaleString()}${job.salary_max ? ` - €${job.salary_max.toLocaleString()}` : ""}`
      : undefined,
    externalLink: job.link
      ? job.link.startsWith("http")
        ? job.link
        : `https://${job.link}`
      : "#",
    likes: job.likes || 0,
    dislikes: job.dislikes || 0,
    user_reaction: job.user_reaction,
    comments_count: job.comments_count || 0,
    publishDate: new Date(job.published_at || job.created_at || Date.now()),
    companyLogo: job.company?.logo_url || job.company?.logo || undefined,
    language: job.language || undefined,
    location_geo: job.location_geo || undefined,
    is_favorite: job.is_favorite || false,
    companyScore: job.company?.trustScore || 80,
    companyLikes: job.company?.totalLikes || 0,
    companyDislikes: job.company?.totalDislikes || 0,
    views_count: job.views_count || 0,
    clicks_count: job.clicks_count || 0,
  };
};

export const JobsContext = createContextId<JobsState>("jobs-context");
import { API_URL } from "../constants";

export const JobsProvider = component$(() => {
  const likeJobSignal = useSignal<LikeJobRequest | null>(null);
  const dislikeJobSignal = useSignal<DislikeJobRequest | null>(null);
  const addCommentSignal = useSignal<AddCommentRequest | null>(null);

  const jobsState = useStore<JobsState>({
    jobs: [],
    favorites: [],
    comments: [],
    companies: [],
    pagination: {
      currentPage: 1,
      hasMore: true,
      isLoading: false,
      totalJobs: 0,
      limit: 10, // Load 10 jobs per page
    },
    currentFilters: null,
    loadingJobId: null,
    loadingReactionId: null,
    likeJobSignal,
    dislikeJobSignal,
    addCommentSignal,
    fetchComments$: $(async () => {}), // Initialize with a no-op QRL
    fetchJobsPage$: $(async () => {}), // Will be assigned below
    loadMoreJobs$: $(async () => {}), // Will be assigned below
    toggleFavorite$: $(async () => {}), // Will be assigned below
    fetchFavorites$: $(async () => {}), // Will be assigned below
    deleteComment$: $(async () => {}), // Will be assigned below
    editComment$: $(async () => {}), // Will be assigned below
    fetchTopSkills$: $(async () => []), // Will be assigned below
    fetchJobById$: $(async () => null), // Will be assigned below
    trackJobInteraction$: $(async () => ({ ok: false, limitReached: false })), // Will be assigned below
    fetchJobMatchScore$: $(async () => null), // Will be assigned below
    fetchBatchMatchScores$: $(async () => ({})), // Will be assigned below
    setInitialData$: $(async () => {}), // Will be assigned below
  });

  // Assign the method inside useTask to avoid state mutation during render
  useTask$(() => {
    jobsState.fetchComments$ = $(async (jobId: string) => {
      try {
        const response = await request(`${API_URL}/comments/job/${jobId}`);
        if (!response.ok) throw new Error("Failed to fetch comments");
        const result = await response.json();
        if (result.success && result.data.comments) {
          const fetched = result.data.comments.map((c: ApiComment) => ({
            id: c.id,
            jobId: jobId,
            userId: c.user_id, // Map user_id
            author: {
              name: `${c.user.first_name} ${c.user.last_name}`,
              avatar: c.user.avatar,
            },
            text: c.content,
            date: new Date(c.created_at),
          }));

          const others = jobsState.comments.filter((c) => c.jobId !== jobId);
          jobsState.comments = [...others, ...fetched];
        }
      } catch (error) {
        logger.error({ error, jobId }, "Error fetching comments");
      }
    });
  });

  const auth = useAuth();

  // Assign pagination and favorite methods inside useTask
  useTask$(() => {
    // fetchJobsPage$: Fetch a specific page of jobs with filters
    jobsState.fetchJobsPage$ = $(
      async (page: number, filters?: JobFilters, append = false) => {
        if (jobsState.pagination.isLoading) return;

        jobsState.pagination.isLoading = true;

        try {
          logger.info(
            { page, limit: jobsState.pagination.limit },
            `Fetching jobs page ${page}...`,
          );
          const url = new URL(`${API_URL}/jobs`);
          url.searchParams.append("page", String(page));
          url.searchParams.append("limit", String(jobsState.pagination.limit));

          // Add filters to URL
          if (filters?.query) url.searchParams.append("q", filters.query);
          if (filters?.seniority)
            url.searchParams.append("seniority", filters.seniority);
          if (filters?.availability)
            url.searchParams.append("employment_type", filters.availability);
          if (filters?.location)
            url.searchParams.append("location", filters.location);
          if (filters?.dateRange) {
            url.searchParams.append("dateRange", filters.dateRange);
            // Send the browser UTC offset so the backend can bound "today" by
            // the user's local day, matching the locally-displayed date.
            url.searchParams.append(
              "tzOffset",
              String(new Date().getTimezoneOffset()),
            );
          }
          if (filters?.remote !== undefined)
            url.searchParams.append("remote", String(filters.remote));
          if (filters?.languages?.length)
            url.searchParams.append("languages", filters.languages.join(","));
          if (filters?.skills?.length)
            url.searchParams.append("skills", filters.skills.join(","));
          if (filters?.location_geo) {
            url.searchParams.append("lat", String(filters.location_geo.lat));
            url.searchParams.append("lng", String(filters.location_geo.lng));
            url.searchParams.append(
              "radius_km",
              String(filters.radius_km || 50),
            );
          }
          if (filters?.looseSeniority)
            url.searchParams.append("looseSeniority", "true");
          if (filters?.salaryMin)
            url.searchParams.append("salary_min", String(filters.salaryMin));
          if (filters?.minMatchScore)
            url.searchParams.append(
              "minMatchScore",
              String(filters.minMatchScore),
            );

          // Include auth token if available
          const headers: Record<string, string> = {};
          if (auth.token) {
            headers["Authorization"] = `Bearer ${auth.token}`;
          }

          const response = await request(url.toString(), { headers });

          if (!response.ok) {
            throw new Error(`Network response was not ok: ${response.status}`);
          }

          const result = await response.json();

          if (result.success && result.data && result.data.jobs) {
            const processedJobs = result.data.jobs.map(processApiJob);
            const pagination = result.data.pagination;

            // Update pagination state
            jobsState.pagination.currentPage = pagination.page;
            jobsState.pagination.totalJobs = pagination.total;
            jobsState.pagination.hasMore = pagination.page < pagination.pages;

            // Append or replace jobs
            if (append) {
              jobsState.jobs = [...jobsState.jobs, ...processedJobs];
            } else {
              jobsState.jobs = processedJobs;
            }

            // Update companies
            const realCompanies = result.data.jobs
              .map((j: ApiJob) => j.company)
              .filter(
                (c: ApiCompany | null): c is ApiCompany =>
                  c !== null && c !== undefined,
              )
              .map((c: ApiCompany) => ({
                name: c.name,
                trustScore: c.trustScore || 80,
                totalRatings: c.totalRatings || 0,
              }));

            const existingNames = new Set(
              jobsState.companies.map((c) => c.name),
            );
            realCompanies.forEach(
              (c: {
                name: string;
                trustScore: number;
                totalRatings: number;
              }) => {
                if (!existingNames.has(c.name)) {
                  jobsState.companies.push(c);
                  existingNames.add(c.name);
                }
              },
            );

            // Store current filters
            jobsState.currentFilters = filters || null;
          }
        } catch (error) {
          logger.error(
            { error, page, filters },
            "Failed to fetch jobs from API",
          );
          if (!append) {
            jobsState.jobs = [];
          }
          jobsState.pagination.hasMore = false;
        } finally {
          jobsState.pagination.isLoading = false;
        }
      },
    );

    // fetchJobById$: Fetch a single job by ID
    jobsState.fetchJobById$ = $(async (id: string) => {
      if (!id || id === "undefined") return null;
      try {
        const headers: Record<string, string> = {};
        if (auth.token) {
          headers["Authorization"] = `Bearer ${auth.token}`;
        }
        const response = await request(`${API_URL}/jobs/${id}`, { headers });
        if (!response.ok) throw new Error("Failed to fetch job");
        const result = await response.json();
        if (result.success && result.data) {
          return processApiJob(result.data);
        }
        return null;
      } catch (error) {
        logger.error({ error, id }, "Error fetching job by id");
        return null;
      }
    });

    // loadMoreJobs$: Load next page and append
    jobsState.loadMoreJobs$ = $(async () => {
      if (!jobsState.pagination.hasMore || jobsState.pagination.isLoading)
        return;

      const nextPage = jobsState.pagination.currentPage + 1;
      await jobsState.fetchJobsPage$(
        nextPage,
        jobsState.currentFilters || undefined,
        true,
      );
    });

    // toggleFavorite$: Add/remove job from favorites
    jobsState.toggleFavorite$ = $(async (jobId: string) => {
      if (jobsState.loadingJobId) return;
      jobsState.loadingJobId = jobId;

      // Find all instances of this job across state
      const allInstances = [
        ...jobsState.jobs.filter((j) => j.id === jobId),
        ...jobsState.favorites.filter((j) => j.id === jobId),
      ];

      // Get state from the first instance, or default to false if job is not in lists
      const wasFavorite =
        allInstances.length > 0 ? allInstances[0].is_favorite : false;

      // Optimistic update for ALL instances in state
      allInstances.forEach((job) => {
        job.is_favorite = !wasFavorite;
      });

      try {
        const token = auth.token;
        if (!token) {
          // Revert on no auth
          allInstances.forEach((job) => {
            job.is_favorite = wasFavorite;
          });
          return;
        }

        if (wasFavorite) {
          // Remove from favorites
          // Update local favorites state immediately
          jobsState.favorites = jobsState.favorites.filter(
            (f) => f.id !== jobId,
          );

          const res = await request(`${API_URL}/favorites?jobId=${jobId}`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${token}` },
          });

          if (!res.ok && res.status !== 404) {
            throw new Error("Failed to remove favorite");
          }
        } else {
          // Add to favorites
          // Prevent duplication
          if (
            allInstances.length > 0 &&
            !jobsState.favorites.some((f) => f.id === jobId)
          ) {
            const sourceJob = allInstances[0];
            jobsState.favorites = [sourceJob, ...jobsState.favorites];
          }

          const res = await request(`${API_URL}/favorites`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ jobId }),
          });

          // If 409 Conflict, it means it's already a favorite, which is what we want.
          // Ignore the error and keep the optimistic update.
          if (!res.ok && res.status !== 409) {
            throw new Error("Failed to add favorite");
          }
        }
      } catch (error) {
        logger.error({ error, jobId }, "Failed to toggle favorite");
        // Revert on error for ALL instances
        allInstances.forEach((job) => {
          job.is_favorite = wasFavorite;
        });
      } finally {
        jobsState.loadingJobId = null;
      }
    });

    // fetchFavorites$: Fetch all user favorites
    jobsState.fetchFavorites$ = $(async () => {
      try {
        const token = auth.token;
        if (!token) return;

        const response = await request(`${API_URL}/favorites`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!response.ok) throw new Error("Failed to fetch favorites");

        const result = await response.json();
        if (result.success && result.data) {
          jobsState.favorites = result.data.map((item: { job: ApiJob }) => {
            const job = processApiJob(item.job);
            job.is_favorite = true; // Ensure favorite status is set
            return job;
          });
        }
      } catch (error) {
        logger.error({ error }, "Failed to fetch favorites");
      }
    });
  });

  // Refetch current page when auth token changes to get user_reaction
  useTask$(async ({ track }) => {
    const token = track(() => auth.token);

    if (isBrowser && token && jobsState.jobs.length > 0) {
      // Refetch current page with auth to update user_reaction
      let filters = jobsState.currentFilters;
      if (!filters && auth.user?.languages?.length) {
        filters = { languages: Array.from(auth.user.languages) };
      }
      await jobsState.fetchJobsPage$(1, filters || undefined, false);
    }
  });

  // Like observer
  useTask$(async ({ track }) => {
    const action = track(() => likeJobSignal.value);
    if (action && isBrowser) {
      if (jobsState.loadingReactionId) return;
      const { jobId, remove } = action;
      jobsState.loadingReactionId = jobId;
      const allInstances = [
        ...jobsState.jobs.filter((j) => j.id === jobId),
        ...jobsState.favorites.filter((j) => j.id === jobId),
      ];

      if (allInstances.length > 0) {
        const job = allInstances[0];
        const currentReaction = job.user_reaction;

        if (remove) {
          if (currentReaction === "LIKE") {
            job.likes = Math.max(0, job.likes - 1);
            job.user_reaction = null;
            if (job.companyLikes !== undefined)
              job.companyLikes = Math.max(0, job.companyLikes - 1);
          }
        } else {
          if (currentReaction !== "LIKE") {
            job.likes++;
            job.user_reaction = "LIKE";
            if (job.companyLikes !== undefined) job.companyLikes++;
            if (currentReaction === "DISLIKE") {
              job.dislikes = Math.max(0, job.dislikes - 1);
              if (job.companyDislikes !== undefined)
                job.companyDislikes = Math.max(0, job.companyDislikes - 1);
            }
          }
        }

        // Update company-wide score
        if (
          job.companyLikes !== undefined &&
          job.companyDislikes !== undefined
        ) {
          const likes = job.companyLikes;
          const dislikes = job.companyDislikes;
          const newScore = ((likes + 8) / (likes + dislikes + 10)) * 100;

          allInstances.forEach((j) => {
            j.likes = job.likes;
            j.dislikes = job.dislikes;
            j.user_reaction = job.user_reaction;
            j.companyLikes = likes;
            j.companyDislikes = dislikes;
            j.companyScore = newScore;
          });
        }
      }

      // API Call
      try {
        const token = auth.token;
        if (token) {
          if (remove) {
            await request(`${API_URL}/likes?jobId=${jobId}&type=LIKE`, {
              method: "DELETE",
              headers: { Authorization: `Bearer ${token}` },
            });
          } else {
            await request(`${API_URL}/likes`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({ jobId, type: "LIKE" }),
            });
          }
        }
      } catch (error) {
        logger.error({ error, jobId }, "Failed to persist action");
      } finally {
        jobsState.loadingReactionId = null;
      }
    }
  });

  // Dislike observer
  useTask$(async ({ track }) => {
    const action = track(() => dislikeJobSignal.value);
    if (action && isBrowser) {
      if (jobsState.loadingReactionId) return;
      const { jobId, remove } = action;
      jobsState.loadingReactionId = jobId;
      const allInstances = [
        ...jobsState.jobs.filter((j) => j.id === jobId),
        ...jobsState.favorites.filter((j) => j.id === jobId),
      ];

      if (allInstances.length > 0) {
        const job = allInstances[0];
        const currentReaction = job.user_reaction;

        if (remove) {
          if (currentReaction === "DISLIKE") {
            job.dislikes = Math.max(0, job.dislikes - 1);
            job.user_reaction = null;
            if (job.companyDislikes !== undefined)
              job.companyDislikes = Math.max(0, job.companyDislikes - 1);
          }
        } else {
          if (currentReaction !== "DISLIKE") {
            job.dislikes++;
            job.user_reaction = "DISLIKE";
            if (job.companyDislikes !== undefined) job.companyDislikes++;
            if (currentReaction === "LIKE") {
              job.likes = Math.max(0, job.likes - 1);
              if (job.companyLikes !== undefined)
                job.companyLikes = Math.max(0, job.companyLikes - 1);
            }
          }
        }

        // Update company-wide score
        if (
          job.companyLikes !== undefined &&
          job.companyDislikes !== undefined
        ) {
          const likes = job.companyLikes;
          const dislikes = job.companyDislikes;
          const newScore = ((likes + 8) / (likes + dislikes + 10)) * 100;

          allInstances.forEach((j) => {
            j.likes = job.likes;
            j.dislikes = job.dislikes;
            j.user_reaction = job.user_reaction;
            j.companyLikes = likes;
            j.companyDislikes = dislikes;
            j.companyScore = newScore;
          });
        }
      }

      // API Call
      try {
        const token = auth.token;
        if (token) {
          if (remove) {
            await request(`${API_URL}/likes?jobId=${jobId}&type=DISLIKE`, {
              method: "DELETE",
              headers: { Authorization: `Bearer ${token}` },
            });
          } else {
            await request(`${API_URL}/likes`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({ jobId, type: "DISLIKE" }),
            });
          }
        }
      } catch (error) {
        logger.error({ error, jobId }, "Failed to persist action");
      } finally {
        jobsState.loadingReactionId = null;
      }
    }
  });

  // Assign deleteComment method
  useTask$(() => {
    jobsState.deleteComment$ = $(async (commentId: string) => {
      const comment = jobsState.comments.find((c) => c.id === commentId);
      if (!comment) return;
      const jobId = comment.jobId;

      // Optimistic update
      const originalComments = [...jobsState.comments];
      jobsState.comments = jobsState.comments.filter((c) => c.id !== commentId);

      // Update comment count safely handling potential shared references
      const jobsToUpdate = new Set([
        ...jobsState.jobs.filter((j) => j.id === jobId),
        ...jobsState.favorites.filter((j) => j.id === jobId),
      ]);

      jobsToUpdate.forEach((job) => {
        job.comments_count = Math.max(0, (job.comments_count || 0) - 1);
      });

      try {
        const token = auth.token;
        if (!token) throw new Error("Not authorized");

        const response = await request(`${API_URL}/comments/${commentId}`, {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          throw new Error("Failed to delete comment");
        }
      } catch (error) {
        logger.error({ error, commentId }, "Failed to delete comment");
        // Revert on error
        jobsState.comments = originalComments;

        const jobsToRevert = new Set([
          ...jobsState.jobs.filter((j) => j.id === jobId),
          ...jobsState.favorites.filter((j) => j.id === jobId),
        ]);

        jobsToRevert.forEach((job) => {
          job.comments_count = (job.comments_count || 0) + 1;
        });

        alert("Failed to delete comment");
      }
    });

    jobsState.editComment$ = $(
      async (commentId: string, newContent: string) => {
        // Optimistic update
        const commentIndex = jobsState.comments.findIndex(
          (c) => c.id === commentId,
        );
        if (commentIndex === -1) return;

        const originalComment = { ...jobsState.comments[commentIndex] };
        jobsState.comments[commentIndex].text = newContent;

        try {
          const token = auth.token;
          if (!token) throw new Error("Not authorized");

          const response = await request(`${API_URL}/comments/${commentId}`, {
            method: "PUT",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ content: newContent }),
          });

          if (!response.ok) {
            throw new Error("Failed to edit comment");
          }
        } catch (error) {
          logger.error({ error, commentId }, "Failed to edit comment");
          // Revert on error
          jobsState.comments[commentIndex] = originalComment;
          alert("Failed to edit comment");
        }
      },
    );
  });

  useTask$(async ({ track }) => {
    const commentReq = track(() => jobsState.addCommentSignal.value);
    if (commentReq && isBrowser) {
      try {
        const token = auth.token;
        if (!token) throw new Error("No token found");

        const response = await request(`${API_URL}/comments`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            commentableId: commentReq.jobId,
            commentableType: "job",
            content: commentReq.text,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(
            errorData.message || `Failed to add comment: ${response.status}`,
          );
        }

        const result = await response.json();
        if (result.success) {
          jobsState.comments.push({
            id: result.data.id,
            jobId: commentReq.jobId,
            userId: auth.user?.id || "",
            author: commentReq.author,
            text: commentReq.text,
            date: new Date(result.data.created_at),
          });

          // Increment count safely handling potential shared references
          const jobsToUpdate = new Set([
            ...jobsState.jobs.filter((j) => j.id === commentReq.jobId),
            ...jobsState.favorites.filter((j) => j.id === commentReq.jobId),
          ]);

          jobsToUpdate.forEach((job) => {
            job.comments_count = (job.comments_count || 0) + 1;
          });
        }
      } catch (error) {
        logger.error(
          { error, jobId: commentReq.jobId },
          "Error adding comment",
        );
      } finally {
        jobsState.addCommentSignal.value = null;
      }
    }
  });

  // Initialize from localStorage
  useTask$(() => {
    if (isBrowser) {
      jobsState.fetchFavorites$();
    }
  });

  // fetchTopSkills$: Fetch top skills public stats
  useTask$(() => {
    jobsState.fetchTopSkills$ = $(async (limit: number = 10, year?: number) => {
      try {
        let url = `${API_URL}/jobs/stats/skills?limit=${limit}`;
        if (year) {
          url += `&year=${year}`;
        }
        const response = await request(url);
        if (!response.ok) throw new Error("Failed to fetch top skills");
        const result = await response.json();
        if (result.success && result.data) {
          return result.data;
        }
        return [];
      } catch (error) {
        logger.error({ error, limit, year }, "Error fetching top skills");
        return [];
      }
    });

    jobsState.trackJobInteraction$ = $(
      async (jobId: string, type: "VIEW" | "APPLY") => {
        const result = { ok: false, limitReached: false };
        try {
          if (typeof window === "undefined" || !jobId || jobId === "undefined")
            return result;

          const visitorId = getVisitorId();
          const token = auth.token;

          const allInstances = [
            ...jobsState.jobs.filter((j) => j.id === jobId),
            ...jobsState.favorites.filter((j) => j.id === jobId),
          ];

          // VIEW is unlimited — bump optimistically. APPLY must NOT bump until
          // the server confirms it (the daily limit can reject it with 429;
          // bumping optimistically is what made the counter "reset" on reload).
          if (type === "VIEW") {
            allInstances.forEach((job) => {
              job.views_count = (job.views_count || 0) + 1;
            });
          }

          const response = await request(`${API_URL}/jobs/${jobId}/track`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({
              type,
              fingerprint: visitorId,
            }),
          });

          if (type === "VIEW") {
            result.ok = response.ok;
            return result;
          }

          // APPLY
          if (response.status === 429) {
            result.limitReached = true;
            return result;
          }
          if (response.ok) {
            const body = await response.json().catch(() => null);
            // already_tracked => data.success === false (no new count)
            const counted = body?.data?.success !== false;
            if (counted) {
              allInstances.forEach((job) => {
                job.clicks_count = (job.clicks_count || 0) + 1;
              });
            }
            result.ok = true;
          }
          return result;
        } catch (error) {
          logger.error({ error, jobId, type }, "Error tracking interaction");
          return result;
        }
      },
    );

    // fetchJobMatchScore$: Calculate match score
    jobsState.fetchJobMatchScore$ = $(async (jobId: string) => {
      try {
        const token = auth.token;
        if (!token || !auth.user || !jobId || jobId === "undefined")
          return null;

        const response = await request(`${API_URL}/jobs/${jobId}/match`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!response.ok) throw new Error("Failed to fetch match score");
        const result = await response.json();

        if (result.success && result.data) {
          return result.data;
        }
        return null;
      } catch (error) {
        logger.error({ error, jobId }, "Error fetching match score");
        return null;
      }
    });

    // fetchBatchMatchScores$: Calculate match scores for multiple jobs
    jobsState.fetchBatchMatchScores$ = $(async (jobIds: string[]) => {
      try {
        const token = auth.token;
        if (!token || !auth.user || !jobIds.length) return {};

        const response = await request(`${API_URL}/jobs/match/batch`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ jobIds }),
        });

        if (response.status === 401) {
          logger.warn({ jobIds }, "Batch match scores: Unauthorized");
          if (typeof window !== "undefined") {
            window.dispatchEvent(new CustomEvent("unauthorized"));
          }
          return {};
        }

        if (!response.ok) throw new Error("Failed to fetch batch match scores");
        const result = await response.json();

        if (result.success && result.data) {
          return result.data;
        }
        return {};
      } catch (error) {
        logger.error({ error, jobIds }, "Error fetching batch match scores");
        return {};
      }
    });

    // setInitialData$: Hydrate state from SSR data
    jobsState.setInitialData$ = $(
      async (
        jobs: ApiJob[],
        pagination: ApiPagination,
        filters?: JobFilters,
      ) => {
        logger.info(
          { count: jobs.length, page: pagination.page },
          "Hydrating jobs context from SSR data",
        );
        jobsState.jobs = jobs.map(processApiJob);
        jobsState.pagination.currentPage = pagination.page;
        jobsState.pagination.totalJobs = pagination.total || jobs.length;
        jobsState.pagination.hasMore = pagination.page < pagination.pages;
        jobsState.currentFilters = filters || null;

        // Update companies
        const realCompanies = jobs
          .map((j: ApiJob) => j.company)
          .filter(
            (c: ApiCompany | null): c is ApiCompany =>
              c !== null && c !== undefined,
          )
          .map((c: ApiCompany) => ({
            name: c.name,
            trustScore: c.trustScore || 80,
            totalRatings: c.totalRatings || 0,
          }));

        const existingNames = new Set(jobsState.companies.map((c) => c.name));
        realCompanies.forEach((c) => {
          if (!existingNames.has(c.name)) {
            jobsState.companies.push(c);
            existingNames.add(c.name);
          }
        });
      },
    );
  });

  useContextProvider(JobsContext, jobsState);
  return <Slot />;
});

export const useJobs = () => useContext(JobsContext);

// Haversine formula to calculate distance between two points in km
const getDistance = (
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
) => {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

export const filterJobs = (
  jobs: JobListing[],
  page = 1,
  limit = 1000,
  filters?: JobFilters,
) => {
  let filteredJobs = [...jobs];
  if (filters) {
    if (filters.query) {
      const query = filters.query.toLowerCase();
      filteredJobs = filteredJobs.filter(
        (job) =>
          job.title.toLowerCase().includes(query) ||
          job.company.toLowerCase().includes(query) ||
          (job.skills &&
            Array.isArray(job.skills) &&
            job.skills.some((skill) => skill.toLowerCase().includes(query))) ||
          (job.description && job.description.toLowerCase().includes(query)),
      );
    }
    if (filters.skills?.length) {
      filteredJobs = filteredJobs.filter(
        (job) =>
          job.skills &&
          job.skills.some((skill) =>
            filters.skills!.some((filterSkill) =>
              skill.toLowerCase().includes(filterSkill.toLowerCase()),
            ),
          ),
      );
    }
    if (filters.seniority)
      filteredJobs = filteredJobs.filter(
        (job) => job.seniority === filters.seniority,
      );
    if (filters.availability)
      filteredJobs = filteredJobs.filter(
        (job) => job.availability === filters.availability,
      );
    if (filters.remote !== undefined)
      filteredJobs = filteredJobs.filter(
        (job) => job.remote === filters.remote,
      );
    if (filters.dateRange) {
      const filterDate = new Date();
      if (filters.dateRange === "today") filterDate.setHours(0, 0, 0, 0);
      else if (filters.dateRange === "week")
        filterDate.setDate(new Date().getDate() - 7);
      else if (filters.dateRange === "month")
        filterDate.setMonth(new Date().getMonth() - 1);
      else if (filters.dateRange === "3months")
        filterDate.setMonth(new Date().getMonth() - 3);
      else filterDate.setFullYear(2000);
      filteredJobs = filteredJobs.filter(
        (job) => job.publishDate >= filterDate,
      );
    }
    if (filters.languages?.length) {
      const langMapping: { [key: string]: string } = {
        italian: "it",
        italiano: "it",
        english: "en",
        inglese: "en",
        spanish: "es",
        spagnolo: "es",
        french: "fr",
        francese: "fr",
        german: "de",
        tedesco: "de",
        portuguese: "pt",
        portoghese: "pt",
        russian: "ru",
        russo: "ru",
        chinese: "zh",
        cinese: "zh",
        japanese: "ja",
        giapponese: "ja",
        arabic: "ar",
        arabo: "ar",
        dutch: "nl",
        olandese: "nl",
        swedish: "sv",
        svedese: "sv",
      };

      const targetCodes = new Set<string>();
      filters.languages.forEach((l) => {
        const lower = l.toLowerCase();
        targetCodes.add(lower);
        if (langMapping[lower]) targetCodes.add(langMapping[lower]);
      });

      filteredJobs = filteredJobs.filter((job) => {
        if (!job.language) return true;
        const jobLang = job.language.toLowerCase();
        return Array.from(targetCodes).some(
          (code) =>
            jobLang === code ||
            (langMapping[jobLang] && targetCodes.has(langMapping[jobLang])),
        );
      });
    }
  }
  const startIndex = (page - 1) * limit;

  // Final geo filtering if coordinates provided
  if (filters?.location_geo && filters.radius_km) {
    const { lat, lng } = filters.location_geo;
    filteredJobs = filteredJobs.filter((job) => {
      // If the job has specific coordinates, use them
      if (
        job.location_geo?.coordinates &&
        job.location_geo.coordinates.length >= 2
      ) {
        const [jobLng, jobLat] = job.location_geo.coordinates;
        const dist = getDistance(lat, lng, jobLat, jobLng);
        return dist <= filters.radius_km!;
      }
      return true;
    });
  }

  return filteredJobs.slice(startIndex, startIndex + limit);
};

export const getPersonalizedJobs = (
  jobs: JobListing[],
  userSkills?: string[],
  userSeniority?: string,
  userLanguages?: string[],
  fallbackLanguage?: string,
) => {
  let filteredJobs = [...jobs];

  const targetLanguages =
    userLanguages && userLanguages.length > 0
      ? userLanguages
      : fallbackLanguage
        ? [fallbackLanguage]
        : [];

  // 1. Filter by languages
  if (targetLanguages.length > 0) {
    const langMapping: { [key: string]: string } = {
      italian: "it",
      italiano: "it",
      english: "en",
      inglese: "en",
      spanish: "es",
      spagnolo: "es",
      french: "fr",
      francese: "fr",
      german: "de",
      tedesco: "de",
      portuguese: "pt",
      portoghese: "pt",
      russian: "ru",
      russo: "ru",
      chinese: "zh",
      cinese: "zh",
      japanese: "ja",
      giapponese: "ja",
      arabic: "ar",
      arabo: "ar",
      dutch: "nl",
      olandese: "nl",
      swedish: "sv",
      svedese: "sv",
    };

    const targetCodes = new Set<string>();
    targetLanguages.forEach((l) => {
      const lower = l.toLowerCase();
      targetCodes.add(lower);
      if (langMapping[lower]) targetCodes.add(langMapping[lower]);
    });

    filteredJobs = filteredJobs.filter((job) => {
      if (!job.language) return true;
      const jobLang = job.language.toLowerCase();
      return Array.from(targetCodes).some(
        (code) =>
          jobLang === code ||
          (langMapping[jobLang] && targetCodes.has(langMapping[jobLang])),
      );
    });
  }

  // 2. Filter by Seniority (if specified)
  if (userSeniority) {
    const normalizeSeniority = (s: string) => s.toLowerCase().trim();
    const userSen = normalizeSeniority(userSeniority);

    filteredJobs = filteredJobs.filter((job) => {
      if (!job.seniority || job.seniority === "unknown") return true; // Keep unknown seniority
      return normalizeSeniority(job.seniority) === userSen;
    });
  }

  // 3. Filter by Skills (if specified) - Must match at least one skill
  if (userSkills && userSkills.length > 0) {
    filteredJobs = filteredJobs.filter((job) => {
      if (!job.skills || job.skills.length === 0) return false;
      return job.skills.some((skill) =>
        userSkills.some((userSkill) =>
          skill.toLowerCase().includes(userSkill.toLowerCase()),
        ),
      );
    });
  }

  if (!userSkills?.length && !userSeniority) return filteredJobs;

  // 4. Scoring for sort order
  const scoredJobs = filteredJobs.map((job) => {
    let score = 0;
    if (userSkills?.length) {
      const matchingSkills = job.skills.filter((skill) =>
        userSkills.some((userSkill) =>
          skill.toLowerCase().includes(userSkill.toLowerCase()),
        ),
      );
      score += (matchingSkills.length / userSkills.length) * 50;
    }
    if (
      userSeniority &&
      job.seniority &&
      job.seniority.toLowerCase() === userSeniority.toLowerCase()
    )
      score += 30; // Boost for exact seniority match

    // Recency boost
    const daysSincePosted = Math.floor(
      (new Date().getTime() - job.publishDate.getTime()) /
        (1000 * 60 * 60 * 24),
    );
    score += Math.max(0, 10 - daysSincePosted);

    return { ...job, score };
  });

  return scoredJobs
    .sort(
      (a, b) =>
        b.score - a.score || b.publishDate.getTime() - a.publishDate.getTime(),
    )
    .map((j) => {
      const { score, ...job } = j;
      void score;
      return job;
    });
};

export const getCommentsFromState = (comments: Comment[], jobId: string) => {
  return comments
    .filter((comment: Comment) => comment.jobId === jobId)
    .sort((a: Comment, b: Comment) => b.date.getTime() - a.date.getTime());
};

export const getCompanyScoreFromState = (
  companies: Company[],
  companyName: string,
) => {
  const company = companies.find((c: Company) => c.name === companyName);
  return company ? Math.round(company.trustScore) : 80;
};

export const useJobsActions = () => {
  const jobsState = useContext(JobsContext);
  return {
    getJobs: (page = 1, limit = 10, filters?: JobFilters) =>
      filterJobs(jobsState.jobs, page, limit, filters),
    getFilteredJobs: (userSkills?: string[], userAvailability?: string) =>
      getPersonalizedJobs(jobsState.jobs, userSkills, userAvailability),
    getComments: (jobId: string) =>
      getCommentsFromState(jobsState.comments, jobId),
    getCompanyScore: (companyName: string) =>
      getCompanyScoreFromState(jobsState.companies, companyName),
  };
};
