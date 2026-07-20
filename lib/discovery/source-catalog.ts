import type { DiscoveryEndpointAdapter } from "@/lib/discovery/types";

export type CatalogSource = {
  key: string;
  name: string;
  url: string;
  countryCode: string;
  locale?: string;
  timezone: string;
  adapter?: DiscoveryEndpointAdapter;
  scheduleHours?: number;
  cursor?: number;
};

export const DISCOVERY_SOURCE_CATALOG_VERSION = 4;

/**
 * Official discovery roots researched for ClassicsGo. These are registered as
 * pending and cannot run until an operator records a terms/robots/permission
 * review and activates the source. Registration is not permission to crawl.
 */
export const DISCOVERY_SOURCE_CATALOG: readonly CatalogSource[] = [
  { key: "fbhvc_events", name: "Federation of British Historic Vehicle Clubs", url: "https://www.fbhvc.co.uk/events", countryCode: "GB", timezone: "Europe/London" },
  { key: "motorsport_uk", name: "Motorsport UK", url: "https://www.motorsportuk.org/", countryCode: "GB", timezone: "Europe/London" },
  { key: "classic_shows", name: "Classic Shows", url: "https://www.classicshows.org/", countryCode: "GB", timezone: "Europe/London" },
  { key: "hero_era", name: "HERO-ERA", url: "https://www.hero-era.com/calendar/", countryCode: "GB", timezone: "Europe/London" },
  { key: "rally_the_globe", name: "Rally the Globe", url: "https://rallytheglobe.com/events/", countryCode: "GB", timezone: "Europe/London" },
  { key: "motor_racing_legends", name: "Motor Racing Legends", url: "https://www.motorracinglegends.com/events/", countryCode: "GB", timezone: "Europe/London" },
  { key: "hscc", name: "Historic Sports Car Club", url: "https://hscc.org.uk/events/", countryCode: "GB", timezone: "Europe/London" },
  { key: "vscc", name: "Vintage Sports-Car Club", url: "https://www.vscc.co.uk/page/events", countryCode: "GB", timezone: "Europe/London" },
  { key: "masters_historic", name: "Masters Historic Racing", url: "https://mastershistoricracing.com/calendar/", countryCode: "GB", timezone: "Europe/London" },
  { key: "msv_calendar", name: "MotorSport Vision", url: "https://www.msv.com/calendar", countryCode: "GB", timezone: "Europe/London" },
  { key: "goodwood_motorsport", name: "Goodwood Motorsport", url: "https://www.goodwood.com/motorsport/", countryCode: "GB", timezone: "Europe/London" },
  { key: "silverstone", name: "Silverstone", url: "https://www.silverstone.co.uk/events", countryCode: "GB", timezone: "Europe/London" },
  { key: "bicester_heritage", name: "Bicester Heritage", url: "https://bicesterheritage.co.uk/events/", countryCode: "GB", timezone: "Europe/London" },
  { key: "brooklands_museum", name: "Brooklands Museum", url: "https://www.brooklandsmuseum.com/whats-on/calendar/", countryCode: "GB", timezone: "Europe/London" },
  { key: "british_motor_museum", name: "British Motor Museum", url: "https://www.britishmotormuseum.co.uk/whats-on", countryCode: "GB", timezone: "Europe/London" },
  { key: "beaulieu", name: "National Motor Museum Beaulieu", url: "https://www.beaulieu.co.uk/events/", countryCode: "GB", timezone: "Europe/London" },
  { key: "haynes_museum", name: "Haynes Motor Museum", url: "https://www.haynesmuseum.org/whats-on/motoring-events/", countryCode: "GB", timezone: "Europe/London" },
  { key: "lakeland_motor_museum", name: "Lakeland Motor Museum", url: "https://www.lakelandmotormuseum.co.uk/events/", countryCode: "GB", timezone: "Europe/London" },
  { key: "great_british_car_journey", name: "Great British Car Journey", url: "https://greatbritishcarjourney.com/events/", countryCode: "GB", timezone: "Europe/London" },
  { key: "shuttleworth", name: "Shuttleworth", url: "https://www.shuttleworth.org/events/", countryCode: "GB", timezone: "Europe/London" },
  { key: "mgcc", name: "MG Car Club", url: "https://www.mgcc.co.uk/club-events-calendar/", countryCode: "GB", timezone: "Europe/London" },
  { key: "mgoc", name: "MG Owners Club", url: "https://www.mgownersclub.co.uk/events", countryCode: "GB", timezone: "Europe/London" },
  { key: "jaguar_enthusiasts", name: "Jaguar Enthusiasts’ Club", url: "https://jec.org.uk/events", countryCode: "GB", timezone: "Europe/London" },
  { key: "porsche_club_gb", name: "Porsche Club GB", url: "https://www.porscheclubgb.com/events", countryCode: "GB", timezone: "Europe/London" },
  { key: "tr_register", name: "TR Register", url: "https://www.tr-register.co.uk/news-events/events", countryCode: "GB", timezone: "Europe/London" },
  { key: "austin_healey_club", name: "Austin-Healey Club", url: "https://www.austinhealeyclub.com/events/", countryCode: "GB", timezone: "Europe/London" },
  { key: "aston_martin_owners", name: "Aston Martin Owners Club", url: "https://www.amoc.org/events", countryCode: "GB", timezone: "Europe/London" },
  { key: "alfa_romeo_owners", name: "Alfa Romeo Owners Club UK", url: "https://aroc-uk.com/events/", countryCode: "GB", timezone: "Europe/London" },
  { key: "barc", name: "British Automobile Racing Club", url: "https://www.barc.net/events/", countryCode: "GB", timezone: "Europe/London" },
  { key: "brscc", name: "British Racing and Sports Car Club", url: "https://brscc.co.uk/events/", countryCode: "GB", timezone: "Europe/London" },
  { key: "newark_autojumble", name: "Newark Autojumble", url: "https://www.newarkautojumble.co.uk/", countryCode: "GB", timezone: "Europe/London" },
  { key: "kempton_autojumble", name: "Kempton Autojumble", url: "https://www.kemptonautojumble.co.uk/", countryCode: "GB", timezone: "Europe/London" },
  { key: "fiva", name: "FIVA", url: "https://www.fiva.org/en", countryCode: "CH", timezone: "Europe/Zurich" },
  { key: "ffve", name: "Fédération Française des Véhicules d’Époque", url: "https://www.ffve.org/", countryCode: "FR", timezone: "Europe/Paris" },
  { key: "asi_italy", name: "Automotoclub Storico Italiano", url: "https://asifed.it/eventi/", countryCode: "IT", timezone: "Europe/Rome" },
  { key: "feva_spain", name: "Federación Española de Vehículos Antiguos", url: "https://www.feva.es/", countryCode: "ES", timezone: "Europe/Madrid" },
  { key: "behva", name: "Belgian Historic Vehicle Association", url: "https://www.behva.be/", countryCode: "BE", timezone: "Europe/Brussels" },
  { key: "fehac", name: "FEHAC Netherlands", url: "https://www.fehac.nl/", countryCode: "NL", timezone: "Europe/Amsterdam" },
  { key: "ivvcc", name: "Irish Veteran and Vintage Car Club", url: "https://www.ivvcc.ie/", countryCode: "IE", timezone: "Europe/Dublin" },
  { key: "fia_historic", name: "FIA Historic", url: "https://www.fia.com/events/historic", countryCode: "FR", timezone: "Europe/Paris" },
  { key: "peter_auto", name: "Peter Auto", url: "https://www.peterauto.fr/en/events/", countryCode: "FR", timezone: "Europe/Paris" },
  { key: "lemans_classic", name: "Le Mans Classic", url: "https://www.lemansclassic.com/", countryCode: "FR", timezone: "Europe/Paris" },
  { key: "retromobile", name: "Rétromobile", url: "https://www.retromobile.com/", countryCode: "FR", timezone: "Europe/Paris" },
  { key: "tour_auto", name: "Tour Auto", url: "https://www.tourauto.com/", countryCode: "FR", timezone: "Europe/Paris" },
  { key: "techno_classica", name: "Techno-Classica Essen", url: "https://www.siha.de/tce.php", countryCode: "DE", timezone: "Europe/Berlin" },
  { key: "retro_classics", name: "Retro Classics Stuttgart", url: "https://www.retro-classics.de/", countryCode: "DE", timezone: "Europe/Berlin" },
  { key: "veterama", name: "Veterama", url: "https://www.veterama.de/", countryCode: "DE", timezone: "Europe/Berlin" },
  { key: "motorworld", name: "Motorworld", url: "https://motorworld.de/events/", countryCode: "DE", timezone: "Europe/Berlin" },
  { key: "mille_miglia", name: "Mille Miglia", url: "https://1000miglia.it/events/", countryCode: "IT", timezone: "Europe/Rome" },
  { key: "auto_moto_epoca", name: "Auto e Moto d’Epoca", url: "https://autoemotodepoca.com/", countryCode: "IT", timezone: "Europe/Rome" },
  { key: "villa_d_este", name: "Concorso d’Eleganza Villa d’Este", url: "https://www.concorsodeleganzavilladeste.com/", countryCode: "IT", timezone: "Europe/Rome" },
  { key: "spa_six_hours", name: "Spa Six Hours", url: "https://www.spasixhours.com/", countryCode: "BE", timezone: "Europe/Brussels" },
  { key: "interclassics", name: "InterClassics", url: "https://interclassics.events/", countryCode: "NL", timezone: "Europe/Amsterdam" },
  { key: "historic_gp_zandvoort", name: "Historic Grand Prix Zandvoort", url: "https://historicgrandprix.nl/", countryCode: "NL", timezone: "Europe/Amsterdam" },
  { key: "classic_madrid", name: "ClassicMadrid", url: "https://www.classicmadrid.com/", countryCode: "ES", timezone: "Europe/Madrid" },
  { key: "estoril_classics", name: "Estoril Classics", url: "https://www.estorilclassics.com/", countryCode: "PT", timezone: "Europe/Lisbon" },
  { key: "monaco_historic", name: "Grand Prix de Monaco Historique", url: "https://acm.mc/en/edition/grand-prix-de-monaco-historique/", countryCode: "MC", timezone: "Europe/Monaco" },
  { key: "arosa_classiccar", name: "Arosa ClassicCar", url: "https://www.arosaclassiccar.ch/", countryCode: "CH", timezone: "Europe/Zurich" },
  { key: "copenhagen_historic_gp", name: "Copenhagen Historic Grand Prix", url: "https://chgp.dk/", countryCode: "DK", timezone: "Europe/Copenhagen" },
  { key: "classic_car_week", name: "Classic Car Week Rättvik", url: "https://classiccarweek.com/", countryCode: "SE", timezone: "Europe/Stockholm" },
  { key: "eifel_rallye", name: "Eifel Rallye Festival", url: "https://www.eifel-rallye-festival.de/", countryCode: "DE", timezone: "Europe/Berlin" },
  { key: "rallylegend", name: "Rallylegend", url: "https://www.rallylegend.com/", countryCode: "SM", timezone: "Europe/San_Marino" },
  // Local authority and regional calendars catch smaller public events that
  // do not appear on national ticketing platforms.
  { key: "swaffham_council_events", name: "Swaffham Town Council events", url: "https://www.swaffhamtowncouncil.gov.uk/council_events/", countryCode: "GB", timezone: "Europe/London" },
  { key: "south_kesteven_events", name: "South Kesteven District Council events", url: "https://www.southkesteven.gov.uk/events", countryCode: "GB", timezone: "Europe/London" },
  { key: "darlington_whats_on", name: "Darlington Borough Council what's on", url: "https://www.darlington.gov.uk/town-centre/events/whats-on/", countryCode: "GB", timezone: "Europe/London" },
  { key: "west_lindsey_events", name: "West Lindsey District Council events", url: "https://www.west-lindsey.gov.uk/events", countryCode: "GB", timezone: "Europe/London" },
  { key: "faversham_council_events", name: "Faversham Town Council events", url: "https://favershamtowncouncil.gov.uk/events/", countryCode: "GB", timezone: "Europe/London" },
  { key: "cirencester_whats_on", name: "Cirencester Town Council what's on", url: "https://cirencester.gov.uk/whats-on", countryCode: "GB", timezone: "Europe/London" },
  { key: "sidmouth_council_events", name: "Sidmouth Town Council events", url: "https://sidmouth.gov.uk/events/", countryCode: "GB", timezone: "Europe/London" },
  { key: "newton_abbot_events", name: "Newton Abbot Town Council events", url: "https://www.newtonabbot-tc.gov.uk/events", countryCode: "GB", timezone: "Europe/London" },
  { key: "west_norfolk_events", name: "King's Lynn and West Norfolk events", url: "https://www.west-norfolk.gov.uk/events", countryCode: "GB", timezone: "Europe/London" },
  { key: "broxbourne_events", name: "Borough of Broxbourne events", url: "https://www.broxbourne.gov.uk/events", countryCode: "GB", timezone: "Europe/London" },
  { key: "classic_car_meet_midlands", name: "Classic Car & Bike Meet Midlands", url: "https://www.classiccarmeet.co.uk/meetings", countryCode: "GB", timezone: "Europe/London" },
  { key: "seeccc", name: "Spalding & East Elloe Classic Car Club", url: "https://seeccc.co.uk/", countryCode: "GB", timezone: "Europe/London" },
  { key: "southend_district_ccc", name: "Southend & District Classic Car Club", url: "https://www.thesdccc.co.uk/", countryCode: "GB", timezone: "Europe/London" },
  { key: "classic_club_italia", name: "Classic Club Italia", url: "https://www.classicclubitalia.it/", countryCode: "IT", timezone: "Europe/Rome" },
  { key: "classic_sport_como", name: "Classic & Sport Car Club Como", url: "https://www.csc-como.it/eventi/", countryCode: "IT", timezone: "Europe/Rome" },
  { key: "benaco_auto_classiche", name: "Benaco Auto Classiche", url: "https://www.benacoautoclassiche.it/", countryCode: "IT", timezone: "Europe/Rome" },
  { key: "classic_car_club_molise", name: "Classic Car Club Molise", url: "https://cccmolise.it/eventi/", countryCode: "IT", timezone: "Europe/Rome" },
  { key: "officina_ferrarese", name: "Officina Ferrarese Motorismo Storico", url: "https://www.officinaferrarese.it/", countryCode: "IT", timezone: "Europe/Rome" },
  { key: "la_manivelle", name: "La Manivelle Savoie", url: "https://www.la-manivelle.org/", countryCode: "FR", timezone: "Europe/Paris" },
  { key: "club_vem", name: "Véhicules d'Époque du Maine", url: "https://clubvem.fr/", countryCode: "FR", timezone: "Europe/Paris" },
  { key: "teuf_teuf_vccf", name: "Club des Teuf-Teuf VCCF", url: "https://www.teufteuf-vccf.org/", countryCode: "FR", timezone: "Europe/Paris" },
  { key: "club_71_va", name: "Club 71 des Voitures Anciennes", url: "https://www.club71va.fr/", countryCode: "FR", timezone: "Europe/Paris" },
  // Competitor and federation research leads. These remain disabled until a
  // written permission, partner API, or organiser-owned feed is recorded.
  { key: "carevents_partner_lead", name: "CarEvents.com partnership lead", url: "https://www.carevents.com/", countryCode: "GB", timezone: "Europe/London" },
  { key: "classicshowsuk_partner_lead", name: "Classic Shows UK partnership lead", url: "https://www.classicshowsuk.co.uk/", countryCode: "GB", timezone: "Europe/London" },
  { key: "yeomans_yearbook", name: "Yeomans Yearbook", url: "https://www.yeomansyearbook.org.uk/index.html", countryCode: "GB", timezone: "Europe/London" },
  { key: "steam_heritage_classic_cars", name: "Steam Heritage classic-car events", url: "https://www.steamheritage.co.uk/steam-rallies-and-events/category/classic_cars", countryCode: "GB", timezone: "Europe/London" },
  { key: "retrocalage", name: "Rétrocalage", url: "https://retrocalage.com/evenements", countryCode: "FR", timezone: "Europe/Paris" },
  { key: "oldtimerweb", name: "Oldtimerweb", url: "https://www.oldtimerweb.nl/oldtimer-evenementen", countryCode: "NL", timezone: "Europe/Amsterdam" },
  { key: "classics_termine", name: "Classics Termine", url: "https://www.classics-termine.de/", countryCode: "DE", timezone: "Europe/Berlin" },
  { key: "classiccarpassion_agenda", name: "ClassicCarPassion agenda", url: "https://www.classiccarpassion.com/en/agenda", countryCode: "BE", timezone: "Europe/Brussels" },
] as const;

const FIRECRAWL_SEARCH_SHARDS = 16;
export const SYSTEM_DISCOVERY_ENDPOINTS: readonly CatalogSource[] = [
  ...Array.from({ length: FIRECRAWL_SEARCH_SHARDS }, (_, shard) => ({
    key: `firecrawl_search_${shard + 1}`,
    name: `Firecrawl licensed search · shard ${shard + 1}`,
    url: `https://api.firecrawl.dev/v2/search?shard=${shard}&shards=${FIRECRAWL_SEARCH_SHARDS}`,
    adapter: "firecrawl_search" as const,
    scheduleHours: 6,
    countryCode: "GB",
    timezone: "Europe/London",
    cursor: shard,
  })),
  { key: "eventbrite_organisations", name: "Eventbrite authorised organisations", url: "https://www.eventbriteapi.com/v3/", adapter: "eventbrite", scheduleHours: 12, countryCode: "GB", timezone: "Europe/London" },
];
