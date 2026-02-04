"use client";

import { useState, useRef, useEffect } from "react";

interface TooltipProps {
  content: React.ReactNode;
  children: React.ReactNode;
  position?: "top" | "bottom";
  maxWidth?: string;
}

export function Tooltip({
  content,
  children,
  position = "top",
  maxWidth = "280px",
}: TooltipProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLSpanElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isVisible && triggerRef.current && tooltipRef.current) {
      const triggerRect = triggerRef.current.getBoundingClientRect();
      const tooltipRect = tooltipRef.current.getBoundingClientRect();

      let top: number;
      let left = triggerRect.left + triggerRect.width / 2 - tooltipRect.width / 2;

      // Keep tooltip within viewport horizontally
      if (left < 8) left = 8;
      if (left + tooltipRect.width > window.innerWidth - 8) {
        left = window.innerWidth - tooltipRect.width - 8;
      }

      if (position === "top") {
        top = triggerRect.top - tooltipRect.height - 8;
        // If tooltip would go above viewport, show below instead
        if (top < 8) {
          top = triggerRect.bottom + 8;
        }
      } else {
        top = triggerRect.bottom + 8;
        // If tooltip would go below viewport, show above instead
        if (top + tooltipRect.height > window.innerHeight - 8) {
          top = triggerRect.top - tooltipRect.height - 8;
        }
      }

      setCoords({ top, left });
    }
  }, [isVisible, position]);

  return (
    <>
      <span
        ref={triggerRef}
        onMouseEnter={() => setIsVisible(true)}
        onMouseLeave={() => setIsVisible(false)}
        onClick={() => setIsVisible(!isVisible)} // Toggle on click for mobile
        className="inline-flex items-center cursor-help"
      >
        {children}
      </span>

      {isVisible && (
        <div
          ref={tooltipRef}
          className="fixed z-50 px-3 py-2 text-xs text-slate-700 bg-white border border-slate-200 rounded-lg shadow-lg"
          style={{
            top: coords.top,
            left: coords.left,
            maxWidth,
          }}
        >
          {content}
        </div>
      )}
    </>
  );
}
