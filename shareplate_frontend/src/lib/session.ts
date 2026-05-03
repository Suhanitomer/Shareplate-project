import type { User } from "@/lib/api";

const USER_KEY = "shareplate.user";

export const saveUserSession = (user: User) => {
  sessionStorage.setItem(USER_KEY, JSON.stringify(user));
  sessionStorage.setItem("userRole", user.role || "");
  sessionStorage.setItem("userName", user.first_name || user.email || "User");
};

export const getStoredUser = (): User | null => {
  const raw = sessionStorage.getItem(USER_KEY);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as User;
  } catch {
    sessionStorage.removeItem(USER_KEY);
    return null;
  }
};

export const clearUserSession = () => {
  sessionStorage.removeItem(USER_KEY);
  sessionStorage.removeItem("userRole");
  sessionStorage.removeItem("userName");
  sessionStorage.removeItem("authToken");
};
