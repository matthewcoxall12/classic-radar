import { redirect } from "next/navigation";

export default function MyEventsPage() {
  redirect("/account?tab=going");
}
