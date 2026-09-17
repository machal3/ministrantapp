import type { SVGProps } from 'react';

interface IconProps extends SVGProps<SVGSVGElement> {
  size?: number | string;
  strokeWidth?: number | string;
}

export default function Wolf({ size = 24, strokeWidth = 2, className, ...props }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      {...props}
    >
      <path d="M6 3.5 4 12l4 3.5L12 21l4-5.5 4-3.5-2-8.5-4.5 5.5h-3z" />
      <path d="M7 7.5 9 10" />
      <path d="m17 7.5-2 2.5" />
      <path d="M8 12.5 10 13" />
      <path d="m16 12.5-2 .5" />
      <path d="M12 14.5v3" />
      <path d="M10.5 17.5h3" />
    </svg>
  );
}
