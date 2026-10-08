import type { Metadata } from "next";
import { ContentPage } from "@/components/ContentPage";
import { photographs, weekendIllustration } from "@/lib/photography";
export const metadata: Metadata = {
  title: "Photography credits",
  alternates: { canonical: "/photography" },
};
export default function PhotographyPage() {
  return (
    <ContentPage
      eyebrow="Behind the pictures"
      title="Photography credits"
      intro="The sources and stories behind our pictures."
    >
      <p>
        Editorial and event fallback photographs are illustrative, and do not
        depict the listed event. Historic photography is captioned with its
        actual context. Assets have been resized, compressed and may be cropped
        in the layout.
      </p>
      <section>
        <h2>A relaxed Sunday meet</h2>
        <p>
          The homepage opening image is an AI-generated illustration of an
          Austin A35 van and an informal owners’ gathering. It depicts an
          imagined scene, not a real event or a photograph of its attendees.
        </p>
        <p>
          <a href={weekendIllustration.src}>View the illustration</a>
        </p>
      </section>
      {Object.values(photographs).map((photo) => (
        <section key={photo.src}>
          <h2>{photo.alt}</h2>
          <p>
            Photograph by <strong>{photo.credit}</strong>.{" "}
            <a href={photo.source}>View the original and attribution</a>.
            Licensed under <a href={photo.licenseUrl}>{photo.license}</a>. Our
            adapted image remains available under the same licence.
          </p>
          <p>
            <a href={photo.src}>Download the adapted photograph</a>
          </p>
        </section>
      ))}
    </ContentPage>
  );
}
