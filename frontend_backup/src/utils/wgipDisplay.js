function normalizeText(value = "") {
  return String(value ?? "").trim();
}

function pickValue(row = {}, keys = [], fallback = "") {
  for (const key of keys) {
    const value = row?.[key];

    if (
      value !== null &&
      value !== undefined &&
      value !== ""
    ) {
      return value;
    }
  }

  return fallback;
}

function isValidCoordinate(lat, lon) {
  const latitude = Number(lat);
  const longitude = Number(lon);

  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    !(latitude === 0 && longitude === 0) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
  );
}

export function isGenericLocationLabel(value = "") {
  const text = normalizeText(value).toLowerCase();

  return (
    /^location\s*#?\s*\d+$/.test(text) ||
    /^area\s*#?\s*\d+$/.test(text) ||
    /^scan\s*location\s*#?\s*\d+$/.test(text)
  );
}

export function formatSecurityType(value = "") {
  const raw = normalizeText(value);
  const normalized = raw.toUpperCase();

  if (!raw || raw === "—" || normalized === "UNKNOWN") {
    return "Unknown Security";
  }

  if (
    normalized.includes("OPEN") ||
    normalized.includes("NONE") ||
    normalized.includes("NO ENCRYPTION")
  ) {
    return "No Password (Open)";
  }

  if (normalized.includes("WEP")) {
    return "Older Security (WEP)";
  }

  if (
    normalized.includes("WPA") ||
    normalized.includes("PSK") ||
    normalized.includes("802.1X")
  ) {
    return `Password-Protected (${raw})`;
  }

  return raw;
}

export function getSecurityDescription(value = "") {
  const label = formatSecurityType(value);

  if (label.includes("No Password")) {
    return "Network does not require a password and may need review.";
  }

  if (label.includes("Password-Protected")) {
    return "Network uses Wi-Fi password protection.";
  }

  if (label.includes("Older Security")) {
    return "Network uses an older wireless security type and may need review.";
  }

  return "Security type was not clearly identified during scan.";
}

export function getSignalBand(input = {}) {
  const row =
    typeof input === "object" && input !== null
      ? input
      : { channel: input };

  const frequency = Number(
    pickValue(
      row,
      [
        "frequency",
        "freq",
        "freq_mhz",
        "frequency_mhz",
      ],
      ""
    )
  );

  const channel = Number(
    pickValue(
      row,
      [
        "channel",
        "wifi_channel",
        "radio_channel",
      ],
      ""
    )
  );

  if (Number.isFinite(frequency) && frequency > 0) {
    if (frequency >= 2400 && frequency <= 2500) {
      return {
        label: "2.4 GHz",
        description: "Common long-range Wi-Fi band.",
      };
    }

    if (frequency >= 4900 && frequency <= 5900) {
      return {
        label: "5 GHz",
        description: "Common faster Wi-Fi band with shorter range.",
      };
    }

    if (frequency >= 5925 && frequency <= 7125) {
      return {
        label: "6 GHz",
        description: "Newer Wi-Fi band for newer devices.",
      };
    }
  }

  if (Number.isFinite(channel) && channel > 0) {
    if (channel >= 1 && channel <= 14) {
      return {
        label: "2.4 GHz",
        description: "Common long-range Wi-Fi band.",
      };
    }

    if (channel >= 32 && channel <= 177) {
      return {
        label: "5 GHz",
        description: "Common faster Wi-Fi band with shorter range.",
      };
    }
  }

  return {
    label: "Unknown Band",
    description: "Band could not be identified from channel or frequency.",
  };
}

export function getSignalBandLabel(input = {}) {
  return getSignalBand(input).label;
}

export function getTrackingStatusDescription(status = "") {
  const value = normalizeText(status).toLowerCase();

  if (value.includes("movement")) {
    return "Seen in different scanned areas.";
  }

  if (value.includes("recurring")) {
    return "Seen repeatedly in the same area over time.";
  }

  return "Needs review based on scan history.";
}

export function formatVendorDisplay(value = "") {
  return formatManufacturerDisplay(value);
}

export const UNKNOWN_MANUFACTURER = "Unknown Manufacturer";
export const UNKNOWN_RANDOMIZED_MANUFACTURER =
  "Unknown Manufacturer (Randomized MAC)";

export function formatManufacturerDisplay(value = "") {
  const manufacturer = normalizeText(value);
  const normalized = manufacturer.toLowerCase();

  if (
    [
      "private/randomized mac",
      "private mac",
      "randomized mac",
      "random mac",
      "locally administered mac",
    ].includes(normalized)
  ) {
    return UNKNOWN_RANDOMIZED_MANUFACTURER;
  }

  if (
    !manufacturer ||
    manufacturer === "—" ||
    [
      "unknown",
      "unknown brand",
      "unknown vendor",
      "unknown manufacturer",
      "n/a",
      "none",
      "null",
    ].includes(normalized)
  ) {
    return UNKNOWN_MANUFACTURER;
  }

  return manufacturer;
}

export function getManufacturer(row = {}) {
  const keys = [
    "manufacturer",
    "client_vendor",
    "clientVendor",
    "vendor",
    "device_vendor",
    "deviceVendor",
    "bssid_vendor",
    "oui_vendor",
    "manuf",
    "brand",
  ];

  for (const key of keys) {
    const candidate = formatManufacturerDisplay(row?.[key]);

    if (candidate !== UNKNOWN_MANUFACTURER) {
      return candidate;
    }
  }

  return UNKNOWN_MANUFACTURER;
}

export function getReadableLocation(row = {}) {
  const directLocation = [
    "resolved_location",
    "display_location",
    "location_name",
    "place_name",
    "address",
    "manual_area_label",
    "area_name",
    "scan_name",
  ]
    .map((key) => normalizeText(row?.[key]))
    .find(
      (value) =>
        value &&
        !isGenericLocationLabel(value)
    );

  if (directLocation) {
    return directLocation;
  }

  const barangay = normalizeText(
    row?.barangay || row?.geocode_barangay
  );

  const city = normalizeText(
    row?.city || row?.municipality || row?.geocode_city
  );

  const province = normalizeText(
    row?.province || row?.region || row?.geocode_region
  );

  const composedLocation = [
    barangay,
    city,
    province,
  ]
    .filter(Boolean)
    .join(", ");

  if (composedLocation) {
    return composedLocation;
  }

  const latitude = pickValue(
    row,
    ["latitude", "lat", "avg_lat", "average_latitude"],
    ""
  );

  const longitude = pickValue(
    row,
    ["longitude", "lon", "lng", "avg_lon", "average_longitude"],
    ""
  );

  if (isValidCoordinate(latitude, longitude)) {
    return `${Number(latitude).toFixed(6)}, ${Number(longitude).toFixed(6)}`;
  }

  return "No location available";
}
