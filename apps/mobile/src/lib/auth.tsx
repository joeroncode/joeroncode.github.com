import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { ApiError, api, getToken, setToken } from "./api";

interface AuthUser {
  id: string;
  email: string;
  role: string;
}

interface AuthResponse {
  accessToken: string;
  expiresIn: number;
  user: AuthUser;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getToken()
      .then((token) => {
        if (!token) return;
        // A stored token implies a previously authenticated session; the
        // profile is re-populated on the next successful API call.
      })
      .finally(() => setLoading(false));
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      async login(email, password) {
        const response = await api.post<AuthResponse>("/auth/login", { email, password });
        await setToken(response.accessToken);
        setUser(response.user);
      },
      async logout() {
        await setToken(null);
        setUser(null);
      },
    }),
    [user, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export { ApiError };
