import { ReactNode } from "react";
import { Navigate } from "react-router-dom";

import { isAuthenticated } from "@/lib/api";
import { getStoredUser } from "@/lib/session";

interface ProtectedRouteProps {
  children: ReactNode;
  allowedRoles?: Array<"donor" | "recipient" | "volunteer">;
}

const ProtectedRoute = ({ children, allowedRoles }: ProtectedRouteProps) => {
  if (!isAuthenticated()) {
    return <Navigate to="/auth?mode=login" replace />;
  }

  const user = getStoredUser();
  if (allowedRoles && user?.role && !allowedRoles.includes(user.role)) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;
