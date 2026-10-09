"use client";

import type { EloPoint } from "@ficc/shared";
import { useReducedMotion } from "motion/react";
import { useFormatter } from "next-intl";
import { useMemo } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  type TooltipContentProps,
  XAxis,
  YAxis,
} from "recharts";
import type { NameType, ValueType } from "recharts/types/component/DefaultTooltipContent";

import { duration } from "@/lib/motion";
import { cn } from "@/lib/utils";

export interface EloSeries {
  key: string;
  label: string;
  /** A CSS color, normally a design token such as `var(--ball)`. */
  color: string;
  points: EloPoint[];
}

type Row = { at: number } & Record<string, number | undefined>;

/** One row per instant with each series' rating at that moment (others carry forward). */
function mergeSeries(series: EloSeries[]): Row[] {
  const events = series
    .flatMap((entry) =>
      entry.points.map((point) => ({ key: entry.key, at: Date.parse(point.at), elo: point.elo })),
    )
    .sort((a, b) => a.at - b.at);
  const last: Record<string, number | undefined> = {};
  const rows: Row[] = [];
  for (const event of events) {
    last[event.key] = event.elo;
    const previous = rows[rows.length - 1];
    if (previous && previous.at === event.at) previous[event.key] = event.elo;
    else rows.push({ at: event.at, ...last });
  }
  return rows;
}

function ChartTooltip({
  active,
  payload,
  label,
  series,
}: TooltipContentProps<ValueType, NameType> & { series: EloSeries[] }) {
  const format = useFormatter();
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-border bg-popover px-3 py-2 text-caption shadow-raised">
      <p className="mb-1 text-muted-foreground">
        {format.dateTime(new Date(Number(label)), {
          day: "2-digit",
          month: "short",
          year: "2-digit",
        })}
      </p>
      {payload.map((item) => {
        const entry = series.find((candidate) => candidate.key === item.dataKey);
        if (!entry || item.value == null) return null;
        return (
          <p key={entry.key} className="flex items-center gap-2">
            <span className="size-2 rounded-full" style={{ background: entry.color }} />
            <span className="max-w-[8rem] truncate">{entry.label}</span>
            <span className="ml-auto num font-semibold">{item.value}</span>
          </p>
        );
      })}
    </div>
  );
}

/** Elo over time for one or more players (Recharts, styled with the design tokens). */
export function EloChart({
  series,
  label,
  className,
}: {
  series: EloSeries[];
  /** Accessible summary of what the chart shows. */
  label: string;
  className?: string;
}) {
  const format = useFormatter();
  const reduce = useReducedMotion();
  const rows = useMemo(() => mergeSeries(series), [series]);
  const values = rows.flatMap((row) =>
    series.map((entry) => row[entry.key]).filter((value): value is number => value != null),
  );
  const min = values.length ? Math.min(...values) : 0;
  const max = values.length ? Math.max(...values) : 0;
  const padding = Math.max(10, Math.round((max - min) * 0.15));

  return (
    <div role="img" aria-label={label} className={cn("h-56 w-full", className)}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
          <CartesianGrid stroke="var(--border)" vertical={false} />
          <XAxis
            dataKey="at"
            type="number"
            scale="time"
            domain={["dataMin", "dataMax"]}
            tickFormatter={(value: number) =>
              format.dateTime(new Date(value), { month: "short" }).replace(".", "")
            }
            tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
            tickLine={false}
            axisLine={false}
            minTickGap={24}
          />
          <YAxis
            domain={[min - padding, max + padding]}
            allowDecimals={false}
            tick={{ fill: "var(--muted-foreground)", fontSize: 12, fontFamily: "var(--font-mono)" }}
            tickLine={false}
            axisLine={false}
            width={48}
          />
          <Tooltip
            cursor={{ stroke: "var(--border-strong)" }}
            content={(props) => <ChartTooltip {...props} series={series} />}
          />
          {series.map((entry) => (
            <Line
              key={entry.key}
              dataKey={entry.key}
              name={entry.label}
              type="monotone"
              stroke={entry.color}
              strokeWidth={2.5}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 0, fill: entry.color }}
              connectNulls
              isAnimationActive={!reduce}
              animationDuration={duration.slow * 2 * 1000}
              animationEasing="ease-out"
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
