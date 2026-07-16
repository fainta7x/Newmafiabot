import React from "react";

export const PistolIcon = ({ className = "w-4 h-4" }: { className?: string }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M4 9h14a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1H12.5l-2.5 5.5a1 1 0 0 1-1 .5H5.5a1 1 0 0 1-1-1v-3.5H4a1 1 0 0 1-1-1v-1a1 1 0 0 1 1-1z" />
    <path d="M8.5 14c0 1.5-1 2-2 1" />
    <line x1="14" y1="9" x2="14" y2="14" />
  </svg>
);

export const MafiaHatIcon = ({ className = "w-4 h-4" }: { className?: string }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M2 16.5c3.5-1.5 16.5-1.5 20 0" />
    <path d="M6 14.5V9c0-1.5 1.5-2.5 3.5-2.5 1 0 2 .5 2.5 1 .5-.5 1.5-1 2.5-1 2 0 3.5 1 3.5 2.5v5.5" />
    <path d="M6 12h12" />
  </svg>
);
