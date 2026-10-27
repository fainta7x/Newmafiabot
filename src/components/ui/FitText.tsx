import React from "react";

interface FitTextProps extends React.HTMLAttributes<HTMLElement> {
  as?: "span" | "div";
  /** The smallest font size, in px, the text may shrink to before it is cut. */
  minPx?: number;
}

/**
 * One line of text that shrinks its font until it fits its box (2026-10-27: on phones and in other fonts «Свободная
 * посадка», «Шериф · #6: ЧЁРНЫЙ!» and long nicknames were cut to «…»). Below `minPx` the box's own ellipsis applies.
 */
export function FitText({ as = "span", minPx = 9, children, style, ...rest }: FitTextProps) {
  const ref = React.useRef<HTMLElement | null>(null);

  React.useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return undefined;
    const fit = () => {
      // The stylesheets size these labels with !important, so the fitted size must be important too.
      node.style.removeProperty("font-size");
      let size = parseFloat(getComputedStyle(node).fontSize) || 0;
      while (size > minPx && node.scrollWidth > node.clientWidth + 0.5) {
        size -= 0.5;
        node.style.setProperty("font-size", `${size}px`, "important");
      }
    };
    fit();
    if (typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(fit);
    observer.observe(node);
    return () => observer.disconnect();
  }, [children, minPx]);

  return React.createElement(as, { ...rest, ref, style: { whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", ...style } }, children);
}
