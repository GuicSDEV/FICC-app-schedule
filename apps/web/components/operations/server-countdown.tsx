"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";

import { transitions } from "@/lib/motion";

/** Milliseconds left until `target`, by the server's clock (`serverNow` from the same response). */
export function useServerCountdown(target: string | null, serverNow: string | null) {
  // The phone's clock may be wrong: keep only the difference to the server, measured once.
  const offset = useRef(0);
  useEffect(() => {
    if (serverNow) offset.current = Date.parse(serverNow) - Date.now();
  }, [serverNow]);
  const remaining = () =>
    target ? Math.max(0, Date.parse(target) - (Date.now() + offset.current)) : 0;
  const [left, setLeft] = useState(remaining);
  useEffect(() => {
    if (!target) return;
    setLeft(remaining());
    const timer = setInterval(() => setLeft(remaining()), 250);
    return () => clearInterval(timer);
    // remaining reads the refs and the target only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, serverNow]);
  return left;
}

const pad = (value: number) => String(value).padStart(2, "0");

/** "02:13:09" with each digit rolling as it changes. */
export function CountdownDigits({
  milliseconds,
  className,
}: {
  milliseconds: number;
  className?: string;
}) {
  const total = Math.ceil(milliseconds / 1000);
  const text = `${pad(Math.floor(total / 3600))}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`;
  return (
    <span className={className} aria-hidden>
      {text.split("").map((char, index) =>
        char === ":" ? (
          <span key={index} className="px-0.5 opacity-60">
            :
          </span>
        ) : (
          <span
            key={index}
            className="relative inline-flex h-[1.1em] w-[0.62em] justify-center overflow-hidden"
          >
            <AnimatePresence initial={false} mode="popLayout">
              <motion.span
                key={`${index}-${char}`}
                initial={{ y: "-100%", opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: "100%", opacity: 0 }}
                transition={transitions.fast}
              >
                {char}
              </motion.span>
            </AnimatePresence>
          </span>
        ),
      )}
    </span>
  );
}
