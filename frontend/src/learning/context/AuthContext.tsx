/**
 * Auth bridge for the learning module.
 *
 * Source (Shalom) screens call `useAuth()` and read a normalized user. In Pingan
 * the source of truth is the existing JS `UserContext`; this shim adapts the
 * Pingan user into the shape the ported screens expect (id/name/email/role/avatar).
 */
import React, { createContext, useContext, useMemo } from "react";
import { UserContext } from "../../context/UserContext";
import { formatName } from "../../utils/formatName";

export type LearningRole = "student" | "instructor" | "admin";

export interface LearningUser {
  id: string;
  name: string;
  email: string;
  role: LearningRole;
  avatarUrl?: string | null;
  isAdmin: boolean;
  isInstructor: boolean;
}

export interface AuthContextValue {
  user: LearningUser | null;
  userId: string | null;
  isAuthenticated: boolean;
  isResettingPassword: boolean;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  userId: null,
  isAuthenticated: false,
  isResettingPassword: false,
});

const toLearningUser = (pinganUser: any): LearningUser | null => {
  if (!pinganUser) return null;
  const isAdmin = !!pinganUser.admin;
  const isInstructor = !!pinganUser.instructor || isAdmin;
  const role: LearningRole = isAdmin ? "admin" : isInstructor ? "instructor" : "student";
  const name =
    formatName(pinganUser.firstName, pinganUser.lastName) ||
    pinganUser.email ||
    "User";
  return {
    id: pinganUser.id != null ? String(pinganUser.id) : "",
    name,
    email: pinganUser.email || "",
    role,
    avatarUrl: pinganUser.profileImage ?? null,
    isAdmin,
    isInstructor,
  };
};

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const pingan = useContext(UserContext as unknown as React.Context<any>) || {};
  const value = useMemo<AuthContextValue>(() => {
    const user = toLearningUser(pingan.user);
    return {
      user,
      userId: user?.id || null,
      isAuthenticated: !!user,
      isResettingPassword: false,
    };
  }, [pingan.user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextValue => useContext(AuthContext);

export default AuthContext;
