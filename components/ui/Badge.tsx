import type { HTMLAttributes } from "react";

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  color?: string;
  textColor?: string;
}

export function Badge({ color, textColor = "#ffffff", className = "", style, children, ...props }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${className}`}
      style={{ backgroundColor: color, color: textColor, ...style }}
      {...props}
    >
      {children}
    </span>
  );
}
