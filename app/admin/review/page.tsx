import { ReviewQueueItem } from "@/components/admin/ReviewQueueItem";
import { getReviewQueue } from "@/lib/events";

export default async function AdminReviewPage() {
  const items = await getReviewQueue();
  return (
    <div className="grid gap-4">
      {items.map((item) => <ReviewQueueItem key={item.id} item={item} />)}
    </div>
  );
}
