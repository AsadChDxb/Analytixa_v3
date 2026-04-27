export type SessionUser = {
  userId: number;
  username: string;
  fullName: string;
  roles: string[];
  permissions: string[];
};

const browserStorage = () => (typeof window === "undefined" ? null : window.localStorage);

export const saveSession = (payload: {
  accessToken: string;
  refreshToken: string;
  user: SessionUser;
}) => {
  const storage = browserStorage();
  if (!storage) {
    return;
  }

  storage.setItem("accessToken", payload.accessToken);
  storage.setItem("refreshToken", payload.refreshToken);
  storage.setItem("sessionUser", JSON.stringify(payload.user));
};

export const clearSession = () => {
  const storage = browserStorage();
  if (!storage) {
    return;
  }

  storage.removeItem("accessToken");
  storage.removeItem("refreshToken");
  storage.removeItem("sessionUser");
};

export const getSessionUser = (): SessionUser | null => {
  const storage = browserStorage();
  if (!storage) {
    return null;
  }

  const raw = storage.getItem("sessionUser");
  if (!raw) return null;

  try {
    return JSON.parse(raw) as SessionUser;
  } catch {
    return null;
  }
};

export const hasPermission = (permission: string): boolean => {
  const user = getSessionUser();
  return !!user?.permissions?.includes(permission);
};
