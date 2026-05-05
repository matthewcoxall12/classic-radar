import type { SearchProvider, SearchResult } from "./types.ts";

const results: SearchResult[] = [
  {
    title: "Bicester Heritage Scramble 2026",
    url: "https://bicesterheritage.co.uk/events/scramble",
    snippet: "Bicester Heritage Scramble, 21 June 2026, Bicester Heritage OX27 8AL. Advance booking required.",
    dateText: "21 June 2026",
    locationText: "Bicester Heritage, Bicester OX27 8AL",
    provider: "mock"
  },
  {
    title: "Newark Autojumble and Classic Parts Day",
    url: "https://www.newarkshowground.com/events/autojumble",
    snippet: "Autojumble, restoration parts and classic parking. 7 June 2026 at Newark Showground NG24 2NY.",
    dateText: "7 June 2026",
    locationText: "Newark Showground, Newark NG24 2NY",
    provider: "mock"
  },
  {
    title: "Sunday Classics at the Old Mill",
    url: "https://facebook.com/events/sunday-classics-old-mill",
    snippet: "Classic car meet this Sunday near Shrewsbury. Venue details TBC.",
    dateText: "this Sunday",
    locationText: "near Shrewsbury",
    provider: "mock"
  },
  {
    title: "Brooklands Summer Classic Gathering",
    url: "https://www.brooklandsmuseum.com/whats-on/classic-gathering",
    snippet: "Classic cars and museum displays at Brooklands Museum, Weybridge KT13 0SL on 12 July 2026.",
    dateText: "12 July 2026",
    locationText: "Brooklands Museum, Weybridge KT13 0SL",
    provider: "mock"
  }
];

export class MockSearchProvider implements SearchProvider {
  name = "mock";

  async search() {
    return results;
  }
}
