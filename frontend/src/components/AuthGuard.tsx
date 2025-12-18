import { useRouter, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { isAuthenticated } from "../lib/auth-client";

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const routerState = useRouterState();
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    // Mark as hydrated
    setIsHydrated(true);

    // Skip auth check on signin page
    if (routerState.location.pathname === "/signin") {
      return;
    }

    // Redirect to signin if not authenticated
    if (!isAuthenticated()) {
      router.navigate({
        to: "/signin",
        search: {
          redirect: routerState.location.href,
        },
      });
    }
  }, [routerState.location.pathname, routerState.location.href, router]);

  // Always render children to avoid hydration mismatch
  // The redirect will happen on client side after hydration
  return <>{children}</>;
}
