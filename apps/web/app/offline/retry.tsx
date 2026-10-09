"use client";

import { RotateCw } from "lucide-react";

import { Button } from "@/components/ui/button";

export function OfflineRetry({ label }: { label: string }) {
  return (
    <Button onClick={() => window.location.reload()}>
      <RotateCw /> {label}
    </Button>
  );
}
