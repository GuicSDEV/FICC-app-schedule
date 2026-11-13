import { useSyncExternalStore } from "react";

/**
 * Short, quiet sound effects made with the Web Audio API (no audio files to download): a chime
 * when something is done (a booking, a result), a soft ping for a new notification, a little
 * fanfare for a win or a title. Off with the switch in Profile (saved on this device).
 */
export type SoundName = "success" | "notify" | "celebrate";

const STORAGE_KEY = "ficc:sounds";
const listeners = new Set<() => void>();
let context: AudioContext | null = null;

/** Sounds are on unless the person turned them off on this device. */
export function soundsEnabled(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== "off";
  } catch {
    return true;
  }
}

export function setSoundsEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, enabled ? "on" : "off");
  } catch {
    // Private storage off: the choice lasts until the page closes.
  }
  listeners.forEach((listener) => listener());
  if (enabled) playSound("success");
}

/** The switch's state, kept in step across components. */
export function useSoundsEnabled(): boolean {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    soundsEnabled,
    () => true,
  );
}

/** Notes of each sound: frequency (Hz), start and length (s). */
const SOUNDS: Record<SoundName, { notes: [number, number, number][]; volume: number }> = {
  success: {
    volume: 0.07,
    notes: [
      [880, 0, 0.12],
      [1318.5, 0.09, 0.22],
    ],
  },
  notify: {
    volume: 0.05,
    notes: [
      [1046.5, 0, 0.1],
      [1568, 0.08, 0.18],
    ],
  },
  celebrate: {
    volume: 0.07,
    notes: [
      [523.25, 0, 0.14],
      [659.25, 0.11, 0.14],
      [783.99, 0.22, 0.14],
      [1046.5, 0.33, 0.4],
    ],
  },
};

/** Plays a sound when sounds are on (silently does nothing where audio is unavailable). */
export function playSound(name: SoundName): void {
  if (typeof window === "undefined" || !soundsEnabled()) return;
  try {
    const Audio =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Audio) return;
    context ??= new Audio();
    // Browsers start audio suspended until the first tap.
    if (context.state === "suspended") void context.resume();
    const { notes, volume } = SOUNDS[name];
    const start = context.currentTime + 0.01;
    for (const [frequency, offset, length] of notes) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      // Soft attack and a quick fade, so it never clicks.
      gain.gain.setValueAtTime(0.0001, start + offset);
      gain.gain.exponentialRampToValueAtTime(volume, start + offset + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + offset + length);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(start + offset);
      oscillator.stop(start + offset + length + 0.02);
    }
  } catch {
    // Audio blocked or unsupported: sounds are a nicety.
  }
}
