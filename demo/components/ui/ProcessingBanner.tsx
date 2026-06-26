"use client";

import { motion, AnimatePresence } from "framer-motion";
import type { MockDocument } from "@/lib/types";

interface ProcessingBannerProps {
  doc: MockDocument;
}

export function ProcessingBanner({ doc }: ProcessingBannerProps) {
  const isProcessing = doc.status === "processing";
  const isPartial = doc.status === "partial";

  return (
    <AnimatePresence>
      {(isProcessing || isPartial) && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="overflow-hidden flex-shrink-0"
        >
          <div className="flex items-center gap-2 px-4 py-1.5 bg-status-processing/10 border-b border-status-processing/30">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-status-processing animate-pulse flex-shrink-0" />
            <span className="text-xs text-status-processing">
              {isProcessing
                ? "Indexing document — chat available after text pages are ready"
                : `${doc.readyPages} of ${doc.pageCount} pages indexed — partial answers available`}
            </span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
