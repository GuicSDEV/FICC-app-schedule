"use client";

import dynamic from "next/dynamic";

import { Skeleton } from "@/components/ui/skeleton";

/** EloChart loaded on demand: Recharts stays out of the first load of every page. */
export const EloChart = dynamic(() => import("./elo-chart").then((module) => module.EloChart), {
  ssr: false,
  loading: () => <Skeleton className="h-56 w-full" />,
});
