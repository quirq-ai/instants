"use client";
import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { SeedData, User } from "@/lib/data";

const DataContext = createContext<SeedData | null>(null);

export function DataProvider({
  data,
  children,
}: {
  data: SeedData;
  children: ReactNode;
}) {
  return <DataContext.Provider value={data}>{children}</DataContext.Provider>;
}

export function useData() {
  const data = useContext(DataContext);
  if (!data)
    throw new Error("Instants data is unavailable outside DataProvider.");
  return useMemo(() => {
    const users = new Map(data.users.map((user) => [user.id, user]));
    const companies = new Map(
      data.companies.map((company) => [company.id, company]),
    );
    return {
      data,
      getUser: (id: string): User =>
        id === data.currentUser.id
          ? { ...data.currentUser, verified: false, following: true }
          : (users.get(id) ?? {
              id,
              username: "unknown",
              name: "Unknown author",
              avatar: "",
              verified: false,
              following: false,
              companyId: "",
              role: "Imported activity",
            }),
      getCompany: (id?: string) => (id ? companies.get(id) : undefined),
    };
  }, [data]);
}
