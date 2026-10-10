export const photographs = {
  racing: {
    src: "/images/editorial/jaguar.webp",
    alt: "A white and green Group 44 Jaguar E-Type racing at Goodwood in 2014",
    credit: "Nic Redhead",
    source:
      "https://commons.wikimedia.org/wiki/File:Jaguar_E-Type_Team_Group_44_at_Goodwood_2014_001.jpg",
    license: "CC BY-SA 2.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/2.0/",
  },
  gathering: {
    src: "/images/editorial/mgb.webp",
    alt: "A red MGB roadster with its bonnet open at a car gathering",
    credit: "Calreyn88",
    source: "https://commons.wikimedia.org/wiki/File:1970_MG_B_Roadster.jpg",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
  },
  roadster: {
    src: "/images/editorial/meet.webp",
    alt: "A green 1963 MGB roadster parked on gravel",
    credit: "Niels de Wit",
    source:
      "https://commons.wikimedia.org/wiki/File:1963_MG_B_Roadster_(9309742858).jpg",
    license: "CC BY 2.0",
    licenseUrl: "https://creativecommons.org/licenses/by/2.0/",
  },
} as const;
export function eventPhotograph(type: string, seed = "") {
  return type === "Motorsport"
    ? photographs.racing
    : type === "Rally / road run" || type === "Vintage / pre-war"
      ? photographs.roadster
      : seed && [...seed].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 2
        ? photographs.roadster
        : photographs.gathering;
}

export const weekendIllustration = {
  src: "/images/editorial/weekend-meet-v3.webp",
  alt: "An imagined weekend classic-car meet with an Austin A35 van, Mini, Morris Minor and MG roadster, owners chatting and more cars beside a tea hut",
} as const;
