import { AdminEventTable } from "@/components/admin/AdminEventTable";
import { ManualEventForm } from "@/components/admin/ManualEventForm";
import { getAdminEvents } from "@/lib/events";

export default async function AdminEventsPage() {
  const events = await getAdminEvents();
  return (
    <div className="grid gap-6">
      <ManualEventForm />
      <AdminEventTable events={events} />
    </div>
  );
}
