import React from "react";

interface FitTextProps extends React.HTMLAttributes<HTMLElement> {
  as?: "span" | "div";
  /** The smallest font size, in px, the text may shrink to before it is cut. */
  minPx?: number;
}

/**
 * A nickname or a short label that shrinks its font until it fits one line, and below `minPx` wraps to a second line —
 * never «…» (owner, 2026-10-27: «Уменьшать шрифт» for long nicknames and names in compact rows).
 */
export function FitText({ as = "span", minPx = 9, children, style, ...rest }: FitTextProps) {
  const ref = React.useRef<HTMLElement | null>(null);

  React.useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return undefined;
    // An inline box has no width of its own to fit into: make it a block (a flex or grid parent does the same by itself).
    if (getComputedStyle(node).display === "inline") node.style.display = "block";
    const fit = () => {
      // The stylesheets size these labels with !important, so the fitted size must be important too.
      node.style.removeProperty("font-size");
      node.style.whiteSpace = "nowrap";
      node.style.overflowWrap = "";
      let size = parseFloat(getComputedStyle(node).fontSize) || 0;
      while (size > minPx && node.scrollWidth > node.clientWidth + 0.5) {
        size -= 0.5;
        node.style.setProperty("font-size", `${size}px`, "important");
      }
      // Still too long at the smallest size: the text takes a second line instead of «…» (owner, 2026-10-27).
      if (node.scrollWidth > node.clientWidth + 0.5) {
        node.style.whiteSpace = "normal";
        node.style.overflowWrap = "anywhere";
      }
    };
    fit();
    if (typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(fit);
    observer.observe(node);
    return () => observer.disconnect();
  }, [children, minPx]);

  return React.createElement(as, { ...rest, ref, style: { whiteSpace: "nowrap", overflow: "hidden", ...style } }, children);
}
