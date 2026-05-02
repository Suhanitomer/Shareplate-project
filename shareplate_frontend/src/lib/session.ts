import type { User } from "@/lib/api";

const USER_KEY = "shareplate.user";

export const saveUserSession = (user: User) => {
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  localStorage.setItem("userRole", user.role || "");
  localStorage.setItem("userName", user.first_name || user.email || "User");
};

export const getStoredUser = (): User | null => {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as User;
  } catch {
    localStorage.removeItem(USER_KEY);
    return null;
  }
};

export const clearUserSession = () => {
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem("userRole");
  localStorage.removeItem("userName");
  localStorage.removeItem("authToken");
};
