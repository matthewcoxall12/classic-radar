import type { Metadata } from "next";
import AdminQueue from "@/components/admin-queue";
import { requireAdminPageUser } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Operations queue | ClassicsGo",
  description: "Private operations queue for ClassicsGo submissions.",
  robots: { index: false, follow: false },
};

export default async function AdminPage() {
  const { user } = await requireAdminPageUser();
  return <AdminQueue currentAdmin={user.authenticatedEmail.trim().toLowerCase()} />;
}
