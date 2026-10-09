import type { ReactNode, SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement> & { size?: number }

function Icon({ size = 18, children, ...rest }: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  )
}

export const Play = (p: IconProps) => (
  <Icon {...p}>
    <path d="M7 5.5v13l11-6.5z" />
  </Icon>
)
export const Pause = (p: IconProps) => (
  <Icon {...p}>
    <path d="M8 5v14M16 5v14" />
  </Icon>
)
export const Next = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6 6l8 6-8 6zM18 6v12" />
  </Icon>
)
export const Back = (p: IconProps) => (
  <Icon {...p}>
    <path d="M18 6l-8 6 8 6zM6 6v12" />
  </Icon>
)
export const Stop = (p: IconProps) => (
  <Icon {...p}>
    <rect x="6.5" y="6.5" width="11" height="11" rx="1.5" />
  </Icon>
)
export const Flip = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 3v18M9 7L4 17h5zM15 7l5 10h-5z" />
  </Icon>
)
export const Grey = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="8" />
    <path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor" stroke="none" />
  </Icon>
)
export const Float = (p: IconProps) => (
  <Icon {...p}>
    <rect x="3" y="7" width="12" height="13" rx="1.5" />
    <path d="M9 4h10.5A1.5 1.5 0 0 1 21 5.5V16" />
  </Icon>
)
export const Pin = (p: IconProps) => (
  <Icon {...p}>
    <path d="M9 4h6l-1 6 3 3H7l3-3zM12 13v7" />
  </Icon>
)
export const Lock = (p: IconProps) => (
  <Icon {...p}>
    <rect x="5" y="11" width="14" height="9" rx="1.5" />
    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
  </Icon>
)
export const Through = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5 4l5.5 15 2.2-6.3L19 10.5z" />
    <path d="M14 14l5 5" />
  </Icon>
)
export const Close = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Icon>
)
export const Minimize = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6 12h12" />
  </Icon>
)
export const Maximize = (p: IconProps) => (
  <Icon {...p}>
    <rect x="6" y="6" width="12" height="12" rx="1" />
  </Icon>
)
export const Gear = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M10.3 3.5h3.4l.5 2.4 1.9 1.1 2.3-.8 1.7 2.9-1.8 1.6v2.2l1.8 1.6-1.7 2.9-2.3-.8-1.9 1.1-.5 2.4h-3.4l-.5-2.4-1.9-1.1-2.3.8-1.7-2.9 1.8-1.6v-2.2L3.9 9.1l1.7-2.9 2.3.8 1.9-1.1z" />
  </Icon>
)
export const Plus = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 5v14M5 12h14" />
  </Icon>
)
export const Folder = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3 7.5A1.5 1.5 0 0 1 4.5 6H9l2 2h8.5A1.5 1.5 0 0 1 21 9.5v8a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5z" />
  </Icon>
)
export const Images = (p: IconProps) => (
  <Icon {...p}>
    <rect x="3" y="5" width="18" height="14" rx="1.5" />
    <path d="M3 16l5-5 4 4 3-3 6 6" />
    <circle cx="15.5" cy="9" r="1.3" />
  </Icon>
)
export const Link = (p: IconProps) => (
  <Icon {...p}>
    <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" />
    <path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
  </Icon>
)
export const Refresh = (p: IconProps) => (
  <Icon {...p}>
    <path d="M20 11a8 8 0 0 0-14.3-4.9L4 8M4 4v4h4M4 13a8 8 0 0 0 14.3 4.9L20 16M20 20v-4h-4" />
  </Icon>
)
export const Trash = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12.5A1.5 1.5 0 0 0 8.5 21h7a1.5 1.5 0 0 0 1.5-1.5L18 7M9 7V4.5A1.5 1.5 0 0 1 10.5 3h3A1.5 1.5 0 0 1 15 4.5V7" />
  </Icon>
)
export const Check = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </Icon>
)
export const Camera = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 8.5A1.5 1.5 0 0 1 5.5 7H8l1.5-2h5L16 7h2.5A1.5 1.5 0 0 1 20 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5z" />
    <circle cx="12" cy="13" r="3.2" />
  </Icon>
)
export const Redo = (p: IconProps) => (
  <Icon {...p}>
    <path d="M19 8H9.5a5 5 0 0 0 0 10H16" />
    <path d="M15 4l4 4-4 4" />
  </Icon>
)
export const ArrowLeft = (p: IconProps) => (
  <Icon {...p}>
    <path d="M15 5l-7 7 7 7" />
  </Icon>
)
export const ArrowRight = (p: IconProps) => (
  <Icon {...p}>
    <path d="M9 5l7 7-7 7" />
  </Icon>
)
export const Star = ({ filled, ...p }: IconProps & { filled?: boolean }) => (
  <Icon {...p}>
    <path
      d="M12 3.6l2.6 5.3 5.8.8-4.2 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.2-4.1 5.8-.8z"
      fill={filled ? 'currentColor' : 'none'}
    />
  </Icon>
)
export const Pen = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 20l1.2-4.6L15.6 5a2 2 0 0 1 2.8 0l.6.6a2 2 0 0 1 0 2.8L8.6 18.8z" />
    <path d="M13.5 7l3.5 3.5" />
  </Icon>
)
export const Undo = (p: IconProps) => (
  <Icon {...p}>
    <path d="M9 7L5 11l4 4" />
    <path d="M5 11h9.5a4.5 4.5 0 0 1 0 9H12" />
  </Icon>
)
export const Crop = (p: IconProps) => (
  <Icon {...p}>
    <path d="M7 3v14h14M3 7h14v14" />
  </Icon>
)
export const Copy = (p: IconProps) => (
  <Icon {...p}>
    <rect x="8.5" y="8.5" width="11" height="11" rx="2" />
    <path d="M15.5 8.5V6.5a2 2 0 0 0-2-2h-7a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h2" />
  </Icon>
)
export const Move = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3.5 7.5a2 2 0 0 1 2-2h4l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z" />
    <path d="M10 13.5h5.5M13 11l2.5 2.5L13 16" />
  </Icon>
)
export const Search = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="11" cy="11" r="6" />
    <path d="m20 20-4.2-4.2" />
  </Icon>
)
export const Filter = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 6h16M7 12h10M10 18h4" />
  </Icon>
)
