"use client";

// True on a hub-backed deploy (Vercel): posts are read from Spacehub and every
// control that saves, generates or syncs is hidden.
import { createContext, useContext } from "react";

const ViewOnly = createContext(false);

export function ViewOnlyProvider({ value, children }: { value: boolean; children: React.ReactNode }) {
  return <ViewOnly.Provider value={value}>{children}</ViewOnly.Provider>;
}

export const useViewOnly = () => useContext(ViewOnly);
