import type { Metadata } from "next";
import { ContentPage } from "@/components/ContentPage";
import { photographs } from "@/lib/photography";
export const metadata: Metadata = {
  title: "Photography credits",
  alternates: { canonical: "/photography" },
};
export default function PhotographyPage() {
  return (
    <ContentPage
      eyebrow="Behind the pictures"
      title="Photography credits"
      intro="Real cars. Real photographs. Proper credit."
    >
      <p>
        Editorial and event fallback photographs are illustrative, and do not
        depict the listed event. Historic photography is captioned with its
        actual context. Assets have been resized, compressed and may be cropped
        in the layout.
      </p>
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
