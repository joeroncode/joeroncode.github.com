import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { api } from "./api";

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
  login: (email: string, password: string) => Promise<void>;
  register: (organizationName: string, name: string, email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const USER_STORAGE_KEY = "ordercheck_user";
const TOKEN_STORAGE_KEY = "ordercheck_token";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => {
    const raw = localStorage.getItem(USER_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  });

  function persist(response: AuthResponse) {
    localStorage.setItem(TOKEN_STORAGE_KEY, response.accessToken);
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(response.user));
    setUser(response.user);
  }

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      async login(email, password) {
        const response = await api.post<AuthResponse>("/auth/login", { email, password });
        persist(response);
      },
      async register(organizationName, name, email, password) {
        const response = await api.post<AuthResponse>("/auth/register", {
          organizationName,
          name,
          email,
          password,
        });
        persist(response);
      },
      logout() {
        localStorage.removeItem(TOKEN_STORAGE_KEY);
        localStorage.removeItem(USER_STORAGE_KEY);
        setUser(null);
      },
    }),
    [user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
