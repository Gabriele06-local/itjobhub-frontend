export interface ApiCompany {
  id: string;
  name: string;
  description?: string | null;
  logo?: string | null;
  logo_url?: string | null;
  website?: string | null;
  trustScore?: number;
  totalRatings?: number;
  totalLikes?: number;
  totalDislikes?: number;
  created_at?: string;
  updated_at?: string;
}

export interface ApiJob {
  id: string;
  title: string;
  description?: string | null;
  company_id: string | null;
  location?: string | null;
  salary_min?: number | null;
  salary_max?: number | null;
  seniority?: string | null;
  skills?: string[];
  technical_skills?: string[];
  employment_type?: string | null;
  experience_level?: string | null;
  remote: boolean;
  is_remote?: boolean | null;
  published_at?: string | null;
  created_at?: string;
  link?: string | null;
  source?: string | null;
  language?: string | null;
  likes: number;
  dislikes: number;
  user_reaction?: "LIKE" | "DISLIKE" | null;
  is_favorite?: boolean;
  comments_count: number;
  company: ApiCompany | null;
  views_count: number;
  clicks_count: number;
  location_geo?: { type: string; coordinates: number[] } | null;
}

export interface ApiComment {
  id: string;
  user_id: string;
  job_id: string;
  content: string;
  created_at: string;
  updated_at: string;
  user: {
    first_name: string;
    last_name: string;
    avatar?: string;
  };
}

export interface MatchScore {
  score: number;
  factors: {
    skillsMatch: number;
    seniorityMatch: number;
    locationMatch: number;
    trustScore: number;
    timeliness: number;
    competition: number;
    applicationRate: number;
    salaryMatch?: number;
    employmentMatch?: number;
  };
  details: {
    matchedSkills: string[];
    missingSkills: string[];
    seniorityGap: string;
    locationStatus: string;
  };
}

export interface ApiNewsTranslation {
  language: string;
  title: string;
  summary?: string | null;
  content?: string | null;
}

export interface ApiNews {
  id: string;
  title: string;
  slug: string;
  summary?: string | null;
  content?: string | null;
  source_url?: string | null;
  image_url?: string | null;
  category?: string | null;
  language?: string | null;
  translations?: ApiNewsTranslation[];
  is_published: boolean;
  published_at?: string | null;
  created_at?: string;
  updated_at?: string;
  likes: number;
  dislikes: number;
  user_reaction?: "LIKE" | "DISLIKE" | null;
  comments_count: number;
  views_count: number;
  clicks_count: number;
}
