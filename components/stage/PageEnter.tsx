"use client";

import { spring, transition } from "@animate-ui/react/utils/motion";
import { motion } from "motion/react";
import { useEffect, type ReactNode } from "react";

// False until the first page has hydrated. The first page renders at rest (its heading is in the
// server HTML, visible before hydration); every page reached by a client navigation after that
// makes its entrance while the persistent stage flies to its shot.
let navigated = false;

export function PageEnter({ children }: { children: ReactNode }) {
  const animate = navigated;
  useEffect(() => {
    navigated = true;
  }, []);
  return (
    <motion.div
      initial={animate ? { opacity: 0, y: 12 } : false}
      animate={{ opacity: 1, y: 0, transition: { ...spring.entrance, opacity: transition.reveal } }}
    >
      {children}
    </motion.div>
  );
}
