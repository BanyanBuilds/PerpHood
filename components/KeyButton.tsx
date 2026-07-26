"use client";

import { motion, type HTMLMotionProps } from "framer-motion";
import type { ReactNode } from "react";

export type KeyTone = "default" | "dark" | "green" | "red" | "ghost";

type Props = Omit<HTMLMotionProps<"button">, "children"> & {
  children: ReactNode;
  tone?: KeyTone;
  selected?: boolean;
  compact?: boolean;
  full?: boolean;
};

export function KeyButton({ children, tone = "default", selected = false, compact = false, full = false, className = "", ...props }: Props) {
  return (
    <motion.button
      whileTap={{ y: 7 }}
      transition={{ type: "spring", stiffness: 700, damping: 28 }}
      className={`key-button key-${tone} ${selected ? "is-selected" : ""} ${compact ? "is-compact" : ""} ${full ? "is-full" : ""} ${className}`}
      {...props}
    >
      <span>{children}</span>
    </motion.button>
  );
}
