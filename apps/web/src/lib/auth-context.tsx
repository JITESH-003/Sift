"use client";

import { useCallback, useSyncExternalStore } from "react";
import { authApi } from "./api";
import {
  getServerSnapshot,
  getSnapshot,
  setSession,
  subscribe,
} from "./session";

export function useAuth() {
  const session = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );
  const hydrated = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );

  const login = useCallback(async (email: string, password: string) => {
    setSession(await authApi.login({ email, password }));
  }, []);
  const register = useCallback(
    async (email: string, password: string, name?: string) => {
      setSession(await authApi.register({ email, password, name }));
    },
    [],
  );
  const guest = useCallback(async () => {
    setSession(await authApi.guest());
  }, []);
  const logout = useCallback(() => {
    setSession(null);
  }, []);

  return {
    user: session.user,
    accessToken: session.accessToken,
    hydrated,
    login,
    register,
    guest,
    logout,
  };
}
