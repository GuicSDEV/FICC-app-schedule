"use client";

import { useTranslations } from "next-intl";

import { Switch } from "@/components/ui/switch";
import { setSoundsEnabled, useSoundsEnabled } from "@/lib/sounds";

/** Profile setting: the app's sound effects on/off on this device. */
export function SoundToggle() {
  const t = useTranslations("profile");
  const enabled = useSoundsEnabled();
  return (
    <div className="px-4 py-2">
      <Switch
        checked={enabled}
        label={t("sounds")}
        hint={t("soundsHint")}
        onChange={(next) => setSoundsEnabled(next)}
      />
    </div>
  );
}
