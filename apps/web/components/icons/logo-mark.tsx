import type { SVGProps } from "react";

export type LogoMarkProps = Pick<SVGProps<SVGSVGElement>, "className">;

export function LogoMark({ className }: LogoMarkProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      focusable="false"
      viewBox="0 0 100 100"
      fill="currentColor"
    >
      <polygon points="15 16 85 16 54 45 15 45" />
      <polygon points="15 84 85 84 85 55 46 55" />
    </svg>
  );
}
