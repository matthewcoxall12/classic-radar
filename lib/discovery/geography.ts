export type DiscoveryArea = {
  key: string;
  label: string;
  countryCode: string;
  locale: string;
  timezone: string;
  searchTerms?: readonly string[];
};

export const UK_REGIONS: readonly DiscoveryArea[] = [
  ["uk-east-midlands", "East Midlands", "GB"],
  ["uk-east-england", "East of England", "GB"],
  ["uk-london", "London", "GB"],
  ["uk-north-east", "North East England", "GB"],
  ["uk-north-west", "North West England", "GB"],
  ["uk-south-east", "South East England", "GB"],
  ["uk-south-west", "South West England", "GB"],
  ["uk-west-midlands", "West Midlands", "GB"],
  ["uk-yorkshire-humber", "Yorkshire and the Humber", "GB"],
  ["uk-scotland", "Scotland", "GB"],
  ["uk-wales", "Wales", "GB"],
  ["uk-northern-ireland", "Northern Ireland", "GB"],
].map(([key, label, countryCode]) => ({
  key,
  label,
  countryCode,
  locale: "en-GB",
  timezone: "Europe/London",
}));

const englandCounties = [
  "Bedfordshire", "Berkshire", "Bristol", "Buckinghamshire", "Cambridgeshire",
  "Cheshire", "City of London", "Cornwall", "Cumbria", "Derbyshire", "Devon",
  "Dorset", "County Durham", "East Riding of Yorkshire", "East Sussex", "Essex",
  "Gloucestershire", "Greater London", "Greater Manchester", "Hampshire",
  "Herefordshire", "Hertfordshire", "Isle of Wight", "Kent", "Lancashire",
  "Leicestershire", "Lincolnshire", "Merseyside", "Norfolk", "North Yorkshire",
  "Northamptonshire", "Northumberland", "Nottinghamshire", "Oxfordshire", "Rutland",
  "Shropshire", "Somerset", "South Yorkshire", "Staffordshire", "Suffolk", "Surrey",
  "Tyne and Wear", "Warwickshire", "West Midlands", "West Sussex", "West Yorkshire",
  "Wiltshire", "Worcestershire",
] as const;

const walesAreas = [
  "Clwyd", "Dyfed", "Gwent", "Gwynedd", "Mid Glamorgan", "Powys",
  "South Glamorgan", "West Glamorgan",
] as const;

const scotlandAreas = [
  "Aberdeen City", "Aberdeenshire", "Angus", "Argyll and Bute", "City of Edinburgh",
  "Clackmannanshire", "Dumfries and Galloway", "Dundee City", "East Ayrshire",
  "East Dunbartonshire", "East Lothian", "East Renfrewshire", "Falkirk", "Fife",
  "Glasgow City", "Highland", "Inverclyde", "Midlothian", "Moray", "Na h-Eileanan Siar",
  "North Ayrshire", "North Lanarkshire", "Orkney Islands", "Perth and Kinross",
  "Renfrewshire", "Scottish Borders", "Shetland Islands", "South Ayrshire",
  "South Lanarkshire", "Stirling", "West Dunbartonshire", "West Lothian",
] as const;

const northernIrelandCounties = [
  "County Antrim", "County Armagh", "County Down", "County Fermanagh",
  "County Londonderry", "County Tyrone",
] as const;

function areaKey(label: string) {
  return label.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export const UK_COUNTIES: readonly DiscoveryArea[] = [
  ...englandCounties,
  ...walesAreas,
  ...scotlandAreas,
  ...northernIrelandCounties,
].map((label) => ({
  key: `uk-area-${areaKey(label)}`,
  label,
  countryCode: "GB",
  locale: "en-GB",
  timezone: "Europe/London",
}));

const europeanCountryData: ReadonlyArray<[
  string,
  string,
  string,
  string,
  (readonly string[])?,
]> = [
  ["IE", "Ireland", "en-IE", "Europe/Dublin"],
  ["FR", "France", "fr-FR", "Europe/Paris", ["voiture ancienne", "véhicule de collection", "bourse d'échanges"]],
  ["DE", "Germany", "de-DE", "Europe/Berlin", ["Oldtimer", "Oldtimertreffen", "Teilemarkt"]],
  ["IT", "Italy", "it-IT", "Europe/Rome", ["auto storiche", "raduno auto storiche", "mostra scambio"]],
  ["ES", "Spain", "es-ES", "Europe/Madrid", ["coches clásicos", "vehículos históricos", "concentración coches clásicos"]],
  ["PT", "Portugal", "pt-PT", "Europe/Lisbon", ["automóveis clássicos", "encontro automóveis clássicos"]],
  ["NL", "Netherlands", "nl-NL", "Europe/Amsterdam", ["oldtimer evenement", "klassieker evenement"]],
  ["BE", "Belgium", "nl-BE", "Europe/Brussels", ["oldtimer evenement", "voiture ancienne"]],
  ["LU", "Luxembourg", "fr-LU", "Europe/Luxembourg", ["voiture ancienne"]],
  ["CH", "Switzerland", "de-CH", "Europe/Zurich", ["Oldtimer", "voiture ancienne", "auto storiche"]],
  ["AT", "Austria", "de-AT", "Europe/Vienna", ["Oldtimer", "Oldtimertreffen"]],
  ["DK", "Denmark", "da-DK", "Europe/Copenhagen", ["veteranbil", "klassiske biler"]],
  ["SE", "Sweden", "sv-SE", "Europe/Stockholm", ["veteranbil", "klassiska bilar"]],
  ["NO", "Norway", "nb-NO", "Europe/Oslo", ["veteranbil", "klassiske biler"]],
  ["FI", "Finland", "fi-FI", "Europe/Helsinki", ["veteraaniauto", "klassikkoautot"]],
  ["IS", "Iceland", "is-IS", "Atlantic/Reykjavik", ["fornbíll"]],
  ["PL", "Poland", "pl-PL", "Europe/Warsaw", ["samochody zabytkowe", "zlot samochodów zabytkowych"]],
  ["CZ", "Czechia", "cs-CZ", "Europe/Prague", ["historická vozidla", "sraz veteránů"]],
  ["SK", "Slovakia", "sk-SK", "Europe/Bratislava", ["historické vozidlá", "zraz veteránov"]],
  ["HU", "Hungary", "hu-HU", "Europe/Budapest", ["veterán autó", "oldtimer találkozó"]],
  ["SI", "Slovenia", "sl-SI", "Europe/Ljubljana", ["starodobna vozila"]],
  ["HR", "Croatia", "hr-HR", "Europe/Zagreb", ["oldtimer susret"]],
  ["RO", "Romania", "ro-RO", "Europe/Bucharest", ["vehicule istorice", "mașini clasice"]],
  ["BG", "Bulgaria", "bg-BG", "Europe/Sofia", ["ретро автомобили"]],
  ["GR", "Greece", "el-GR", "Europe/Athens", ["κλασικά αυτοκίνητα"]],
  ["EE", "Estonia", "et-EE", "Europe/Tallinn", ["vanaauto"]],
  ["LV", "Latvia", "lv-LV", "Europe/Riga", ["senie auto"]],
  ["LT", "Lithuania", "lt-LT", "Europe/Vilnius", ["senoviniai automobiliai"]],
  ["MT", "Malta", "en-MT", "Europe/Malta"],
  ["CY", "Cyprus", "en-CY", "Asia/Nicosia"],
  ["TR", "Türkiye", "tr-TR", "Europe/Istanbul", ["klasik otomobil"]],
  ["RS", "Serbia", "sr-RS", "Europe/Belgrade", ["oldtajmer"]],
  ["BA", "Bosnia and Herzegovina", "bs-BA", "Europe/Sarajevo", ["oldtajmer"]],
  ["AL", "Albania", "sq-AL", "Europe/Tirane", ["makina klasike"]],
  ["ME", "Montenegro", "sr-ME", "Europe/Podgorica", ["oldtajmer"]],
  ["MK", "North Macedonia", "mk-MK", "Europe/Skopje", ["олдтајмер"]],
  ["AD", "Andorra", "ca-AD", "Europe/Andorra"],
  ["MC", "Monaco", "fr-MC", "Europe/Monaco"],
  ["SM", "San Marino", "it-SM", "Europe/San_Marino"],
  ["LI", "Liechtenstein", "de-LI", "Europe/Vaduz"],
] as const;

export const EUROPE_COUNTRIES: readonly DiscoveryArea[] = europeanCountryData.map(
  ([countryCode, label, locale, timezone, searchTerms]) => ({
    key: `eu-${countryCode.toLowerCase()}`,
    label,
    countryCode,
    locale,
    timezone,
    searchTerms,
  }),
);

export const DISCOVERY_AREAS: readonly DiscoveryArea[] = [
  ...UK_REGIONS,
  ...UK_COUNTIES,
  ...EUROPE_COUNTRIES,
];

export const SUPPORTED_DISCOVERY_COUNTRY_CODES = [
  "GB",
  ...EUROPE_COUNTRIES.map((country) => country.countryCode),
] as const;
