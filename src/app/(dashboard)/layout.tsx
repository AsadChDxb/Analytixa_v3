"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/AppShell";
import { getSessionUser } from "@/lib/auth";
import { useAppDispatch } from "@/store";
import { setSession } from "@/store/authSlice";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const dispatch = useAppDispatch();

  useEffect(() => {
    const user = getSessionUser();
    const token = localStorage.getItem("accessToken");

    if (!user || !token) {
      router.push("/login");
      return;
    }

    dispatch(setSession(user));
  }, [dispatch, router]);

  return <AppShell>{children}</AppShell>;
}
