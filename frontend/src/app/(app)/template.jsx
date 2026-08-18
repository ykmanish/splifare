'use client';

import { motion } from 'framer-motion';

/**
 * Re-mounts on every navigation, so each screen fades in.
 * Deliberately opacity-only: a transform here would create a containing
 * block and break the `position: fixed` bars inside pages.
 */
export default function Template({ children }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  );
}
