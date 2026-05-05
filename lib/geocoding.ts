const developmentLocations: Record<string, { latitude: number; longitude: number; label: string }> = {
  london: { latitude: 51.5072, longitude: -0.1276, label: "London" },
  birmingham: { latitude: 52.4862, longitude: -1.8904, label: "Birmingham" },
  manchester: { latitude: 53.4808, longitude: -2.2426, label: "Manchester" },
  altrincham: { latitude: 53.3612, longitude: -2.2787, label: "Altrincham" },
  bristol: { latitude: 51.4545, longitude: -2.5879, label: "Bristol" },
  york: { latitude: 53.959, longitude: -1.0815, label: "York" },
  edinburgh: { latitude: 55.9533, longitude: -3.1883, label: "Edinburgh" },
  cardiff: { latitude: 51.4816, longitude: -3.1791, label: "Cardiff" },
  bicester: { latitude: 51.9159, longitude: -1.1401, label: "Bicester" },
  weybridge: { latitude: 51.3536, longitude: -0.4656, label: "Weybridge" },
  yeovil: { latitude: 51.0396, longitude: -2.5607, label: "Yeovil" },
  newark: { latitude: 53.1007, longitude: -0.7584, label: "Newark" },
  chichester: { latitude: 50.8594, longitude: -0.7596, label: "Chichester" },
  cirencester: { latitude: 51.7175, longitude: -1.9682, label: "Cirencester" },
  brockenhurst: { latitude: 50.8238, longitude: -1.4533, label: "Brockenhurst" },
  llandudno: { latitude: 53.3241, longitude: -3.8276, label: "Llandudno" },
  perth: { latitude: 56.4236, longitude: -3.4389, label: "Perth" },
  "cf10": { latitude: 51.4816, longitude: -3.1791, label: "Cardiff" },
  "sw1a": { latitude: 51.501, longitude: -0.1416, label: "Westminster" },
  "ox27": { latitude: 51.9159, longitude: -1.1401, label: "Bicester" },
  "kt13": { latitude: 51.3536, longitude: -0.4656, label: "Weybridge" },
  "ba22": { latitude: 51.0396, longitude: -2.5607, label: "Yeovil" },
  "ng24": { latitude: 53.1007, longitude: -0.7584, label: "Newark" },
  "po18": { latitude: 50.8594, longitude: -0.7596, label: "Chichester" },
  "gl7": { latitude: 51.7175, longitude: -1.9682, label: "Cirencester" },
  "wa15": { latitude: 53.3612, longitude: -2.2787, label: "Altrincham" },
  "so42": { latitude: 50.8238, longitude: -1.4533, label: "Brockenhurst" },
  "ll30": { latitude: 53.3241, longitude: -3.8276, label: "Llandudno" },
  "ph2": { latitude: 56.4236, longitude: -3.4389, label: "Perth" }
};

export async function geocodeLocation(input?: string | null) {
  if (!input) return null;
  const normalised = input.trim().toLowerCase();
  const postcodePrefix = normalised.replace(/\s+/g, "").match(/^[a-z]{1,2}\d[a-z\d]?/)?.[0];
  const key = normalised.split(/\s+/)[0];
  const exact = developmentLocations[normalised] ?? (postcodePrefix ? developmentLocations[postcodePrefix] : undefined) ?? developmentLocations[key];
  if (exact) return exact;

  // Connect a production geocoding provider with GEOCODING_API_KEY.
  return null;
}
