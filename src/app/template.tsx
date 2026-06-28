import React from "react";

/**
 * Next.js Template component that wraps all pages.
 * Unlike layouts, templates create a new instance for each child on navigation,
 * which allows us to trigger entry animations on every route change.
 */
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="page-transition">{children}</div>;
}
