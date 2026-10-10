"use client";
import { useFormStatus } from "react-dom";
export function RoadbookButton({ children, className }: { children: React.ReactNode; className?: string }) {
  const { pending } = useFormStatus();
  return <button type="submit" disabled={pending} className={`${className || ""} disabled:cursor-wait disabled:opacity-60`}>{pending ? "Saving…" : children}</button>;
}
