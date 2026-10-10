export const siteName = "ClassicsGo";
export const operatorName = "Matthew Coxall";
export const contactEmail = "matthewcoxall@googlemail.com";
export const contactPostalAddress = "48 Furzedale Park, Hythe, SO45 3HW, United Kingdom";
export const siteDescription =
  "Find classic car shows, local meets, autojumbles, road runs, club events and museum days across the UK.";

export function siteUrl() {
  // Public identity must never inherit an old Vercel/preview environment value.
  // Request origins for auth and checkout are handled separately by those routes.
  return new URL("https://classicsgo.com");
}

export function absoluteUrl(path = "/") {
  return new URL(path, siteUrl()).toString();
}
