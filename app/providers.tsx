"use client"

interface Props {
  children: React.ReactNode
}

export function Providers({ children }: Props) {
  return <>{children}</>
}
