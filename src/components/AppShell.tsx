"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import clsx from "clsx";
import { clearSession, getSessionUser } from "@/lib/auth";
import NexaChatWidget from "@/components/NexaChatWidget";
import { useAppDispatch, useAppSelector } from "@/store";
import { clearSessionState } from "@/store/authSlice";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: "dashboard" },
  { href: "/users", label: "Users", icon: "users" },
  { href: "/roles", label: "Roles", icon: "shield" },
  { href: "/datasources", label: "Datasources", icon: "database" },
  { href: "/dashboard-builder", label: "Dashboard Builder", icon: "spark" },
  { href: "/dashboards", label: "My Dashboards", icon: "tiles" },
  { href: "/report-builder", label: "Report Builder", icon: "builder" },
  { href: "/reports", label: "My Reports", icon: "reports" },
  { href: "/settings", label: "Settings", icon: "settings" },
];

function NavIcon({ name }: { name: string }) {
  const props = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className: "navIconSvg",
    "aria-hidden": true,
  };

  switch (name) {
    case "dashboard":
      return <svg {...props}><rect x="3" y="3" width="8" height="8" rx="2" /><rect x="13" y="3" width="8" height="5" rx="2" /><rect x="13" y="10" width="8" height="11" rx="2" /><rect x="3" y="13" width="8" height="8" rx="2" /></svg>;
    case "users":
      return <svg {...props}><path d="M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" /><circle cx="9.5" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>;
    case "shield":
      return <svg {...props}><path d="M12 3l7 3v6c0 5-3.5 8-7 9-3.5-1-7-4-7-9V6l7-3z" /><path d="M9.5 12.5l1.8 1.8 3.7-4.3" /></svg>;
    case "database":
      return <svg {...props}><ellipse cx="12" cy="5" rx="8" ry="3" /><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5" /><path d="M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" /></svg>;
    case "reports":
      return <svg {...props}><path d="M7 3h7l5 5v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" /><path d="M14 3v6h6" /><path d="M9 13h6" /><path d="M9 17h6" /></svg>;
    case "builder":
      return <svg {...props}><path d="M14 3l7 7-9.5 9.5H4v-7.5L14 3z" /><path d="M13 4l7 7" /></svg>;
    case "spark":
      return <svg {...props}><path d="M12 3l1.7 4.8L19 9.5l-4 3.1 1.4 5-4.4-3.2-4.4 3.2 1.4-5-4-3.1 5.3-1.7L12 3z" /></svg>;
    case "tiles":
      return <svg {...props}><rect x="3" y="3" width="8" height="8" rx="2" /><rect x="13" y="3" width="8" height="8" rx="2" /><rect x="3" y="13" width="8" height="8" rx="2" /><rect x="13" y="13" width="8" height="8" rx="2" /></svg>;
    default:
      return <svg {...props}><circle cx="12" cy="12" r="3" /><path d="M12 2v3" /><path d="M12 19v3" /><path d="M4.9 4.9l2.1 2.1" /><path d="M17 17l2.1 2.1" /><path d="M2 12h3" /><path d="M19 12h3" /><path d="M4.9 19.1L7 17" /><path d="M17 7l2.1-2.1" /></svg>;
  }
}

function isActivePath(pathname: string, href: string) {
  if (pathname === href) {
    return true;
  }

  if (href === "/reports" && pathname.startsWith("/reports/")) {
    return true;
  }

  if (href === "/dashboards" && pathname.startsWith("/dashboards/")) {
    return true;
  }

  return false;
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const dispatch = useAppDispatch();
  const sessionUser = useAppSelector((state) => state.auth.user);
  const [fallbackUser] = useState<ReturnType<typeof getSessionUser>>(() => getSessionUser());
  const isDashboardViewRoute = pathname.startsWith("/dashboards/");
  const [isSidebarOpen, setIsSidebarOpen] = useState(!isDashboardViewRoute);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const userMenuRef = useRef<HTMLDivElement | null>(null);
  const sidebarExpanded = isSidebarOpen && !pathname.startsWith("/dashboard-builder");

  useEffect(() => { setMounted(true); }, []);

  const displayUser = mounted ? (sessionUser ?? fallbackUser) : null;
  const rawDisplayName = displayUser?.fullName ?? displayUser?.username ?? "User";
  const displayName = typeof rawDisplayName === "string" ? rawDisplayName : String(rawDisplayName ?? "User");
  const avatarInitial = (displayName.trim().slice(0, 1) || "U").toUpperCase();
  const username = typeof displayUser?.username === "string" ? displayUser.username : String(displayUser?.username ?? "unknown");

  useEffect(() => {
    const onDocumentClick = (event: MouseEvent) => {
      if (!userMenuRef.current) {
        return;
      }

      if (!userMenuRef.current.contains(event.target as Node)) {
        setIsUserMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", onDocumentClick);
    return () => {
      document.removeEventListener("mousedown", onDocumentClick);
    };
  }, []);

  useEffect(() => {
    if (isDashboardViewRoute) {
      setIsSidebarOpen(false);
    }
  }, [isDashboardViewRoute]);

  return (
    <div className={clsx("shell", !sidebarExpanded && "sidebarCollapsed")}>
      <aside className={clsx("sidebar", !sidebarExpanded && "collapsed")}>
        <div className="brandRow">
          <div className="brandBadge">AN</div>
          <div className="brandText">
            <div className="brand">Analytixa</div>
            <p className="brandSub">Enterprise Reports</p>
          </div>
        </div>
        <nav>
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={clsx(
                "navItem",
                isActivePath(pathname, item.href) && "active"
              )}
            >
              <span className="navIcon"><NavIcon name={item.icon} /></span>
              <span className="navLabel">{item.label}</span>
            </Link>
          ))}
        </nav>
      </aside>

      <main className="mainArea">
        <header className="topBar fixedTopBar">
          <div className="topBarLeft">
            <button
              type="button"
              className="menuToggle hamburgerToggle"
              aria-label="Toggle menu"
              onClick={() => setIsSidebarOpen((prev) => !prev)}
            >
              <span />
              <span />
              <span />
            </button>
          </div>
          <div className="topBarTitle">
            <h1>Analytixa</h1>
            <p>Enterprise Reports</p>
          </div>
          <div className="userMenuWrap" ref={userMenuRef}>
            <button
              type="button"
              className="userMenuTrigger"
              onClick={() => setIsUserMenuOpen((prev) => !prev)}
            >
              <span className="userAvatar">{avatarInitial}</span>
              <span className="userTriggerText">{displayName}</span>
            </button>
            {isUserMenuOpen ? (
              <div className="userMenuDropdown">
                <div className="userMeta">
                  <strong>{displayName}</strong>
                  <span>@{username}</span>
                </div>
                <button
                  type="button"
                  className="danger smallButton"
                  onClick={() => {
                    clearSession();
                    dispatch(clearSessionState());
                    router.push("/login");
                  }}
                >
                  Logout
                </button>
              </div>
            ) : null}
          </div>
        </header>
        <section className="contentSection">{children}</section>
        <NexaChatWidget />
      </main>
    </div>
  );
}
