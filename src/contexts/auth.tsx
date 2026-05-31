import {
  createContextId,
  Slot,
  component$,
  useStore,
  useContext,
  useContextProvider,
  useSignal,
  useTask$,
  useOnWindow,
  Signal,
  $,
} from "@builder.io/qwik";
import { useNavigate } from "@builder.io/qwik-city";
import { request } from "../utils/api";
import { setCookie, deleteCookie } from "../utils/cookies";
import logger from "../utils/logger";

export interface CvRecord {
  id: string;
  language: string;
  filename: string;
  url: string;
  size: number;
  uploadedAt: string;
}

export interface ExtractedProfile {
  skills: string[];
  languages: string[];
  seniority: "junior" | "mid" | "senior" | null;
  availability: "full-time" | "part-time" | "busy" | null;
  workModes: string[];
  salaryMin: number | null;
  bio: string | null;
  confidence: number;
}

export interface User {
  id: string;
  email: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  location?: string;
  birthDate?: string;
  bio?: string;
  avatar?: string;
  salaryMin?: number;
  languages?: string[];
  skills?: string[];
  seniority?: "junior" | "mid" | "senior";
  availability?: string[];
  workModes?: string[];
  profileCompleted?: boolean;
  role?: string;
  language?: string;
  portfolioUrl?: string;
  cvs?: CvRecord[];
  location_geo?: {
    type: string;
    coordinates: number[];
  };
}

export interface WizardData {
  languages: string[];
  skills: string[];
  seniority: "junior" | "mid" | "senior" | "";
  availability: string[];
  workModes: string[];
  salaryMin: number;
  portfolioUrl?: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  name?: string;
  firstName?: string;
  lastName?: string;
}

export interface SocialLoginRequest {
  provider: "google" | "linkedin" | "github";
}

export interface PersonalInfoUpdate {
  firstName: string;
  lastName: string;
  phone: string;
  location: string;
  birthDate: string;
  bio: string;
  salaryMin?: number;
  coordinates?: { lat: number; lng: number };
}

export interface AvatarUpdateRequest {
  avatar: string;
}

export interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  token: string | null;
  unauthorizedPathname: string | null;
  loginSignal: Signal<LoginRequest | null>;
  registerSignal: Signal<RegisterRequest | null>;
  socialLoginSignal: Signal<SocialLoginRequest | null>;
  logoutSignal: Signal<boolean>;
  updateProfileSignal: Signal<WizardData | null>;
  updatePersonalInfoSignal: Signal<PersonalInfoUpdate | null>;
  updateAvatarSignal: Signal<AvatarUpdateRequest | null>;
  loginResult: Signal<{ success: boolean; error?: string } | null>;
  registerResult: Signal<{ success: boolean; error?: string } | null>;
  profileUpdateResult: Signal<{ success: boolean; error?: string } | null>;
  avatarUpdateResult: Signal<{ success: boolean; error?: string } | null>;
}

export interface BackendUser {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  role?: string;
  phone?: string;
  location?: string;
  location_geo?: {
    type: string;
    coordinates: number[];
  };
  birthDate?: string;
  salaryMin?: number;
  avatar?: string;
  profileCompleted?: boolean;
  profile?: {
    languages?: string[];
    skills?: string[];
    seniority?: "junior" | "mid" | "senior";
    availability?: string[];
    workModes?: string[];
    bio?: string;
    portfolioUrl?: string;
  };
}

export const AuthContext = createContextId<AuthState>("auth-context");

// Import centralized API_URL
import { API_URL } from "../constants";

export const AuthProvider = component$(
  (props: { initialUser?: User | null; initialToken?: string | null }) => {
    const nav = useNavigate();

    // Create signals for actions
    const loginSignal = useSignal<LoginRequest | null>(null);
    const registerSignal = useSignal<RegisterRequest | null>(null);
    const socialLoginSignal = useSignal<SocialLoginRequest | null>(null);
    const logoutSignal = useSignal(false);
    const updateProfileSignal = useSignal<WizardData | null>(null);
    const updatePersonalInfoSignal = useSignal<PersonalInfoUpdate | null>(null);
    const updateAvatarSignal = useSignal<AvatarUpdateRequest | null>(null);

    // Create result signals
    const loginResult = useSignal<{ success: boolean; error?: string } | null>(
      null,
    );
    const registerResult = useSignal<{
      success: boolean;
      error?: string;
    } | null>(null);
    const profileUpdateResult = useSignal<{
      success: boolean;
      error?: string;
    } | null>(null);
    const avatarUpdateResult = useSignal<{
      success: boolean;
      error?: string;
    } | null>(null);

    const authState = useStore<AuthState>({
      user: props.initialUser || null,
      isAuthenticated: !!props.initialToken,
      token: props.initialToken || null,
      unauthorizedPathname: null,
      loginSignal,
      registerSignal,
      socialLoginSignal,
      logoutSignal,
      updateProfileSignal,
      updatePersonalInfoSignal,
      updateAvatarSignal,
      loginResult,
      registerResult,
      profileUpdateResult,
      avatarUpdateResult,
    });

    // Sync state with props (important for SSR and route navigation)
    useTask$(({ track }) => {
      const initialUser = track(() => props.initialUser);
      const initialToken = track(() => props.initialToken);

      if (initialUser !== undefined) {
        authState.user = initialUser;
      }
      if (initialToken !== undefined) {
        authState.token = initialToken;
        authState.isAuthenticated = !!initialToken;
      }
    });

    // Handle unauthorized event
    const handleUnauthorized = $(
      (event: CustomEvent<{ pathname?: string }>) => {
        if (authState.isAuthenticated) {
          authState.unauthorizedPathname = event.detail?.pathname || null;
          authState.logoutSignal.value = true;
        }
      },
    );
    useOnWindow("unauthorized", handleUnauthorized);

    // Helper to map backend user to frontend User
    const mapUser = $((bu: BackendUser): User => {
      return {
        id: bu.id,
        email: bu.email,
        firstName: bu.firstName,
        lastName: bu.lastName,
        name: `${bu.firstName || ""} ${bu.lastName || ""}`.trim(),
        role: bu.role,
        languages: bu.profile?.languages || [],
        skills: bu.profile?.skills || [],
        seniority: bu.profile?.seniority,
        availability: bu.profile?.availability,
        workModes: bu.profile?.workModes || [],
        bio: bu.profile?.bio,
        profileCompleted:
          bu.profileCompleted !== undefined
            ? bu.profileCompleted
            : !!bu.profile,
        phone: bu.phone,
        location: bu.location,
        location_geo: bu.location_geo,
        birthDate: bu.birthDate,
        avatar: bu.avatar,
        salaryMin: bu.salaryMin,
        portfolioUrl: bu.profile?.portfolioUrl,
      };
    });

    // Handle login requests
    useTask$(async ({ track }) => {
      const loginReq = track(() => loginSignal.value);
      if (!loginReq) return;

      try {
        const response = await request(`${API_URL}/auth/login`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Accept-Language": authState.user?.language || "it",
          },
          credentials: "include",
          body: JSON.stringify(loginReq),
        });

        const data = await response.json();

        if (response.ok && data.success) {
          const { user: bu, token } = data.data;

          authState.user = await mapUser(bu);
          authState.token = token;
          authState.isAuthenticated = true;

          if (typeof document !== "undefined") {
            setCookie("auth_token", token);
          }

          loginResult.value = { success: true };
        } else {
          loginResult.value = {
            success: false,
            error: data.message || "Login failed",
          };
        }
      } catch (error) {
        logger.error({ error }, "Login error");
        loginResult.value = {
          success: false,
          error: "Network error or server unavailable",
        };
      } finally {
        loginSignal.value = null;
      }
    });

    // Handle register requests
    useTask$(async ({ track }) => {
      const registerReq = track(() => registerSignal.value);
      if (!registerReq) return;

      try {
        const payload = {
          email: registerReq.email,
          password: registerReq.password,
          firstName: registerReq.firstName || "User",
          lastName: registerReq.lastName || "New",
        };

        const response = await request(`${API_URL}/auth/register`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Accept-Language": authState.user?.language || "it",
          },
          credentials: "include",
          body: JSON.stringify(payload),
        });

        const text = await response.text();
        let data;
        try {
          data = JSON.parse(text);
        } catch {
          data = { success: false, message: "Invalid response from server" };
        }

        if (response.status === 201 && data.success) {
          const { user: bu, token } = data.data;

          authState.user = await mapUser(bu);
          authState.token = token;
          authState.isAuthenticated = true;

          if (typeof document !== "undefined") {
            setCookie("auth_token", token);
          }

          registerResult.value = { success: true };
        } else {
          registerResult.value = {
            success: false,
            error: data.message || "Registration failed",
          };
        }
      } catch (error) {
        logger.error({ error }, "Registration error");
        registerResult.value = {
          success: false,
          error: "Network error or server unavailable",
        };
      } finally {
        registerSignal.value = null;
      }
    });

    // Handle logout requests
    useTask$(async ({ track }) => {
      const shouldLogout = track(() => logoutSignal.value);
      if (!shouldLogout) return;

      try {
        await request(`${API_URL}/auth/logout`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${authState.token}`,
            "Accept-Language": authState.user?.language || "it",
          },
          credentials: "include",
        });
      } catch (e) {
        logger.error({ e }, "Logout error");
      } finally {
        authState.user = null;
        authState.token = null;
        authState.isAuthenticated = false;

        if (typeof document !== "undefined") {
          deleteCookie("auth_token");
          deleteCookie("refresh_token");

          // Smart redirect: protected routes go to home, others to login
          const protectedRoutes = ["/profile", "/wizard"];
          const wasOnProtectedRoute = protectedRoutes.some((route) =>
            authState.unauthorizedPathname?.startsWith(route),
          );

          const redirectTo = wasOnProtectedRoute ? "/" : "/login";
          nav(redirectTo);
        }

        logoutSignal.value = false;
        authState.unauthorizedPathname = null;
      }
    });

    // Handle profile update requests
    useTask$(async ({ track }) => {
      const wizardData = track(() => updateProfileSignal.value);
      if (!wizardData || !authState.user) return;

      try {
        const response = await request(`${API_URL}/users/me/profile`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${authState.token}`,
            "Accept-Language": authState.user?.language || "it",
          },
          credentials: "include",
          body: JSON.stringify({
            languages: wizardData.languages,
            skills: wizardData.skills,
            seniority: wizardData.seniority,
            availability: wizardData.availability,
            workModes: wizardData.workModes,
            salaryMin: wizardData.salaryMin,
            portfolioUrl: wizardData.portfolioUrl,
          }),
        });

        if (response.ok) {
          const data = await response.json();
          // Update user in sync with backend response
          const backendProfile = data.data;
          if (authState.user) {
            // Reassign the entire user object to trigger reactivity
            authState.user = {
              ...authState.user,
              languages: backendProfile.languages,
              skills: backendProfile.skills,
              seniority: backendProfile.seniority,
              availability: backendProfile.availability,
              workModes: backendProfile.workModes,
              salaryMin: backendProfile.salaryMin,
              portfolioUrl: backendProfile.portfolioUrl,
              profileCompleted: true,
            };
          }
          profileUpdateResult.value = { success: true };
        } else {
          const data = await response.json();
          profileUpdateResult.value = {
            success: false,
            error: data.message || "Failed to save profile data",
          };
        }
      } catch (error) {
        logger.error({ error }, "Failed to update profile on server");
        profileUpdateResult.value = {
          success: false,
          error: "Failed to save profile data",
        };
      } finally {
        updateProfileSignal.value = null;
      }
    });

    // Handle personal info update requests
    useTask$(async ({ track }) => {
      const personalInfo = track(() => updatePersonalInfoSignal.value);
      if (!personalInfo || !authState.user) return;

      try {
        // Optimistic update - reassign entire user object for reactivity
        const prevUser = { ...authState.user };
        authState.user = {
          ...authState.user,
          firstName: personalInfo.firstName,
          lastName: personalInfo.lastName,
          name: `${personalInfo.firstName} ${personalInfo.lastName}`.trim(),
          phone: personalInfo.phone,
          location: personalInfo.location,
          location_geo: personalInfo.coordinates
            ? {
                type: "Point",
                coordinates: [
                  personalInfo.coordinates.lng,
                  personalInfo.coordinates.lat,
                ],
              }
            : undefined,
          birthDate: personalInfo.birthDate,
          bio: personalInfo.bio,
          salaryMin: personalInfo.salaryMin,
        };

        const response = await request(`${API_URL}/users/me/profile`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${authState.token}`,
          },
          credentials: "include",
          body: JSON.stringify({
            bio: personalInfo.bio,
            firstName: personalInfo.firstName,
            lastName: personalInfo.lastName,
            phone: personalInfo.phone,
            birthDate: personalInfo.birthDate,
            location: personalInfo.location,
            locationGeo: personalInfo.coordinates,
            salaryMin: personalInfo.salaryMin,
          }),
        });

        if (response.ok) {
          profileUpdateResult.value = { success: true };
        } else {
          const data = await response.json();
          // Revert on failure
          authState.user = prevUser;
          profileUpdateResult.value = {
            success: false,
            error: data.message || "Failed to save personal info",
          };
        }
      } catch (error) {
        logger.error({ error }, "Failed to update profile on server");
        profileUpdateResult.value = {
          success: false,
          error: "Network error or server unavailable",
        };
      } finally {
        updatePersonalInfoSignal.value = null;
      }
    });

    // Handle avatar update requests
    useTask$(async ({ track }) => {
      const avatarUpdate = track(() => updateAvatarSignal.value);
      if (!avatarUpdate || !authState.user) return;

      try {
        const response = await request(`${API_URL}/users/me/profile`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${authState.token}`,
          },
          credentials: "include",
          body: JSON.stringify({
            avatar: avatarUpdate.avatar,
          }),
        });

        if (response.ok) {
          authState.user = { ...authState.user, avatar: avatarUpdate.avatar };
          avatarUpdateResult.value = { success: true };
        } else {
          avatarUpdateResult.value = {
            success: false,
            error: "Failed to update avatar",
          };
        }
      } catch (error) {
        logger.error({ error }, "Failed to update avatar on server");
        avatarUpdateResult.value = {
          success: false,
          error: "Network error or server unavailable",
        };
      } finally {
        updateAvatarSignal.value = null;
      }
    });

    useContextProvider(AuthContext, authState);

    return <Slot />;
  },
);

export const useAuth = () => {
  return useContext(AuthContext);
};
