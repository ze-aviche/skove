/**
 * Converts a raw job location string into a normalized locationSearch value.
 * Returns space-joined keywords e.g. "us remote", "uk", "india".
 * Search queries use LIKE '%keyword%' so each part is independently matchable.
 * No AI calls — pure regex, covers the vast majority of job location formats.
 */
export function extractLocationSearch(location: string): string {
  const lower = location.toLowerCase()
  const parts: string[] = []

  // ── United States ──────────────────────────────────────────────────────────
  const isUS =
    lower.includes('united states') ||
    lower.includes('usa') ||
    // standalone "us" (not inside a word like "house")
    /(?:^|[\s,|(])us(?:$|[\s,|)])/.test(lower) ||
    // full state names
    /\b(alabama|alaska|arizona|arkansas|california|colorado|connecticut|delaware|florida|georgia|hawaii|idaho|illinois|indiana|iowa|kansas|kentucky|louisiana|maine|maryland|massachusetts|michigan|minnesota|mississippi|missouri|montana|nebraska|nevada|new hampshire|new jersey|new mexico|new york|north carolina|north dakota|ohio|oklahoma|oregon|pennsylvania|rhode island|south carolina|south dakota|tennessee|texas|utah|vermont|virginia|washington|west virginia|wisconsin|wyoming|district of columbia)\b/.test(lower) ||
    // 2-letter state abbreviations (word-boundary safe)
    /(?:^|[\s,|(])(al|ak|az|ar|ca|co|ct|de|fl|ga|hi|id|il|in|ia|ks|ky|la|me|md|ma|mi|mn|ms|mo|mt|ne|nv|nh|nj|nm|ny|nc|nd|oh|ok|or|pa|ri|sc|sd|tn|tx|ut|vt|va|wa|wv|wi|wy|dc)(?:$|[\s,|.\d)])/.test(lower) ||
    // major US cities
    /\b(new york city|nyc|los angeles|chicago|houston|phoenix|philadelphia|san antonio|san diego|dallas|san jose|austin|jacksonville|fort worth|columbus|charlotte|san francisco|seattle|denver|nashville|oklahoma city|el paso|washington|boston|portland|las vegas|memphis|louisville|baltimore|milwaukee|albuquerque|tucson|fresno|sacramento|mesa|kansas city|atlanta|omaha|colorado springs|raleigh|long beach|virginia beach|minneapolis|tampa|new orleans|arlington|wichita|cleveland|bakersfield|aurora|anaheim|santa ana|corpus christi|riverside|st\. louis|lexington|stockton|pittsburgh|saint paul|anchorage|cincinnati|greensboro|plano|newark|henderson|lincoln|buffalo|fort wayne|jersey city|chula vista|orlando|st\. petersburg|norfolk|chandler|laredo|madison|durham|lubbock|winston-salem|garland|glendale|hialeah|reno|baton rouge|irvine|chesapeake|scottsdale|north las vegas|fremont|gilbert|san bernardino|boise|birmingham|rochester|richmond|spokane|des moines|montgomery|modesto|fayetteville|tacoma|shreveport|salt lake city|fontana|knoxville|worcester|huntington beach|little rock|glendale|grand rapids|huntsville|akron|mobile|tempe|tallahassee|mcallen|augusta|overland park|columbus|oxnard|moreno valley|ontario|aurora|yonkers|amarillo|peoria|worcester|brownsville|santa rosa|elk grove|clarksville|oceanside|garden grove|chattanooga|fort lauderdale|rancho cucamonga|santa clarita|cary|eugene|providence|fort collins|hayward|corona|lancaster|murfreesboro|salinas|palmdale|sunnyvale|pomona|escondido|torrance|pasadena|bellevue|paterson|joliet|bridgeport|macon|mckinney|frisco|mesquite|dayton|hollywood|killeen|clarksville|miramar|fullerton|waco|warren|west valley city|columbia|sterling heights|hampton|olathe|cedar rapids|topeka|thousand oaks|visalia|elizabeth|gainesville|simi valley|concord|hartford|roseville|corona|athens|charleston|peoria|surprise|sioux falls|jackson|midland)\b/.test(lower)

  if (isUS) parts.push('us')

  // ── United Kingdom ─────────────────────────────────────────────────────────
  const isUK =
    lower.includes('united kingdom') ||
    lower.includes('great britain') ||
    /(?:^|[\s,|(])uk(?:$|[\s,|)])/.test(lower) ||
    /(?:^|[\s,|(])gb(?:$|[\s,|)])/.test(lower) ||
    /\b(england|scotland|wales|northern ireland|london|manchester|birmingham|leeds|glasgow|edinburgh|liverpool|bristol|sheffield|bradford|leicester|coventry|belfast|nottingham|kingston upon hull|stoke-on-trent|wolverhampton|derby|reading|luton|southampton|portsmouth|oxford|cambridge|brighton|plymouth|swansea|cardiff|aberdeen|dundee|inverness|exeter|york|newcastle|sunderland|middlesbrough)\b/.test(lower)

  if (isUK) parts.push('uk')

  // ── India ──────────────────────────────────────────────────────────────────
  const isIndia =
    lower.includes('india') ||
    /\b(bangalore|bengaluru|mumbai|delhi|new delhi|hyderabad|pune|ahmedabad|chennai|kolkata|surat|jaipur|lucknow|kanpur|nagpur|indore|thane|bhopal|visakhapatnam|pimpri|patna|vadodara|ghaziabad|ludhiana|agra|nashik|faridabad|meerut|rajkot|kalyan|vasai|varanasi|srinagar|aurangabad|dhanbad|amritsar|allahabad|ranchi|howrah|coimbatore|jabalpur|gwalior|vijayawada|jodhpur|madurai|raipur|kota|guwahati|chandigarh|solapur|hubballi|tiruchirappalli|gurgaon|noida|gurugram|navi mumbai|secunderabad|mysuru|mysore)\b/.test(lower)

  if (isIndia) parts.push('india')

  // ── Australia ──────────────────────────────────────────────────────────────
  const isAustralia =
    lower.includes('australia') ||
    /(?:^|[\s,|(])au(?:$|[\s,|)])/.test(lower) ||
    /\b(sydney|melbourne|brisbane|perth|adelaide|canberra|darwin|hobart|gold coast|newcastle|wollongong|geelong|townsville|cairns|toowoomba|ballarat|bendigo|albury|launceston|mackay|rockhampton|sunshine coast)\b/.test(lower)

  if (isAustralia) parts.push('australia')

  // ── Remote ─────────────────────────────────────────────────────────────────
  if (/\b(remote|distributed|anywhere|work from home|wfh|home.based|virtual)\b/.test(lower)) {
    parts.push('remote')
  }

  // Fallback: keep raw lowercased value so row isn't lost entirely
  return parts.length > 0 ? parts.join(' ') : lower
}
