import { AuthForm } from "@/components/AuthForm";
import { SubmitEventForm } from "@/components/SubmitEventForm";

export default function SubmitEventPage() {
  return (
    <section className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-3xl font-black">Submit a missing event</h1>
      <p className="mt-2 text-muted">Send a lead to the review queue. Admins can approve, reject or merge it with an existing listing.</p>
      <div className="mt-6"><AuthForm /></div>
      <SubmitEventForm />
    </section>
  );
}
