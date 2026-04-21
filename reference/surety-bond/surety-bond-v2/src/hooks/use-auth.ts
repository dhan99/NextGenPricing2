import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Role = "agent" | "principal" | "underwriter" | null;

interface UserInfo {
  id: number;
  email: string;
  role: "agent" | "principal" | "underwriter";
  displayName: string;
  agentId: number | null;
  principalId: number | null;
}

interface AuthState {
  token: string | null;
  user: UserInfo | null;
  role: Role;
  principalId: number | null;
  agentId: number | null;
  underwriterId: number | null;
  login: (token: string, user: UserInfo) => void;
  logout: () => void;
  isAuthenticated: () => boolean;
}

export const useAuth = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      user: null,
      role: null,
      principalId: null,
      agentId: null,
      underwriterId: null,
      login: (token, user) => {
        set({
          token,
          user,
          role: user.role,
          agentId: user.agentId,
          principalId: user.principalId,
          underwriterId: user.role === "underwriter" ? user.id : null,
        });
      },
      logout: () => {
        const token = get().token;
        if (token) {
          fetch("/api/auth/logout", {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
          }).catch(() => {});
        }
        set({
          token: null,
          user: null,
          role: null,
          principalId: null,
          agentId: null,
          underwriterId: null,
        });
      },
      isAuthenticated: () => !!get().token,
    }),
    {
      name: "surety-auth-storage",
    }
  )
);
