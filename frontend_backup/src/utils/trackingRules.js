import { summarizeClusterMovement } from "./movementClustering";

import { formatManufacturerDisplay } from "./wgipDisplay";

function normalizeMac(value = "") {
  return String(value || "")
    .trim()
    .toUpperCase();
}

function isValidMacLike(value = "") {
  return /^([0-9A-F]{2}:){5}[0-9A-F]{2}$/i.test(
    String(value || "").trim()
  );
}

function normalizeManufacturer(value = "") {
  const manufacturer = String(value || "").trim();

  if (
    !manufacturer ||
    isValidMacLike(manufacturer)
  ) {
    return "Unknown Manufacturer";
  }

  return formatManufacturerDisplay(manufacturer);
}

function normalizeSsid(
  value = "",
  bssid = ""
) {
  const ssid = String(value || "").trim();
  const normalizedSsid =
    ssid.toLowerCase();

  if (
    !ssid ||
    normalizedSsid === "hidden" ||
    normalizedSsid ===
      "hidden/unknown" ||
    normalizedSsid === "unknown" ||
    normalizedSsid === "n/a" ||
    normalizeMac(ssid) ===
      normalizeMac(bssid)
  ) {
    return "";
  }

  return ssid;
}

function getAny(
  row,
  keys,
  fallback = ""
) {
  for (const key of keys) {
    if (
      row &&
      Object.prototype.hasOwnProperty.call(
        row,
        key
      ) &&
      row[key] !== null &&
      row[key] !== undefined &&
      row[key] !== ""
    ) {
      return row[key];
    }
  }

  return fallback;
}

function getScanId(row) {
  return String(
    getAny(
      row,
      [
        "import_batch_id",
        "survey_id",
        "scan_id",
        "batch_id",
      ],
      ""
    )
  );
}

function getDateKey(row) {
  const value = getAny(
    row,
    [
      "timestamp",
      "last_seen",
      "last_time",
      "first_seen",
      "first_time",
      "created_at",
      "time",
    ],
    ""
  );

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date
    .toISOString()
    .slice(0, 10);
}

function getFirstSeen(rows = []) {
  const values = rows
    .map((row) =>
      getAny(
        row,
        [
          "first_seen",
          "first_time",
          "timestamp",
          "created_at",
          "last_seen",
          "last_time",
        ],
        ""
      )
    )
    .filter(Boolean)
    .map((value) => ({
      value,
      time: new Date(value).getTime(),
    }))
    .filter((item) =>
      Number.isFinite(item.time)
    )
    .sort(
      (a, b) =>
        a.time - b.time
    );

  return values[0]?.value || "";
}

function getLastSeen(rows = []) {
  const values = rows
    .map((row) =>
      getAny(
        row,
        [
          "last_seen",
          "last_time",
          "timestamp",
          "created_at",
          "first_seen",
          "first_time",
        ],
        ""
      )
    )
    .filter(Boolean)
    .map((value) => ({
      value,
      time: new Date(value).getTime(),
    }))
    .filter((item) =>
      Number.isFinite(item.time)
    )
    .sort(
      (a, b) =>
        b.time - a.time
    );

  return values[0]?.value || "";
}

function getObservationCount(
  rows = []
) {
  return rows.reduce(
    (total, row) => {
      const rawCount = getAny(
        row,
        [
          "observation_count",
          "total_records",
          "records",
          "count",
        ],
        1
      );

      const numericCount =
        Number(rawCount);

      if (
        !Number.isFinite(
          numericCount
        ) ||
        numericCount <= 0
      ) {
        return total + 1;
      }

      return total + numericCount;
    },
    0
  );
}

function normalizeTrackingRow(
  row = {}
) {
  return {
    ...row,

    latitude: getAny(
      row,
      [
        "latitude",
        "lat",
        "avg_lat",
        "average_latitude",
        "min_lat",
        "max_lat",
      ],
      ""
    ),

    longitude: getAny(
      row,
      [
        "longitude",
        "lon",
        "lng",
        "avg_lon",
        "average_longitude",
        "min_lon",
        "max_lon",
      ],
      ""
    ),

    timestamp: getAny(
      row,
      [
        "timestamp",
        "last_seen",
        "last_time",
        "first_seen",
        "first_time",
        "created_at",
        "time",
      ],
      ""
    ),
  };
}

export function analyzeTrackedEntity(
  rows = [],
  options = {}
) {
  const normalizedRows =
    rows.map(normalizeTrackingRow);

  const summary =
    summarizeClusterMovement(
      normalizedRows,
      {
        defaultRadiusMeters:
          options.defaultRadiusMeters ??
          75,

        minRadiusMeters:
          options.minRadiusMeters ??
          35,

        maxRadiusMeters:
          options.maxRadiusMeters ??
          160,

        minClustersForMovement: 2,
      }
    );

  const scanIds = new Set(
    normalizedRows
      .map(getScanId)
      .filter(Boolean)
  );

  const dateKeys = new Set(
    normalizedRows
      .map(getDateKey)
      .filter(Boolean)
  );

  const scannedAreaCount = Number(
    summary.areaCount || 0
  );

  const detectionCount =
    normalizedRows.length;

  /*
   * Core tracking requirement:
   *
   * A Wi-Fi/BSSID or observed device
   * becomes tracked only when it appears
   * in at least two separate scan/import
   * events.
   *
   * Multiple rows or multiple GPS points
   * from only one scan are not enough.
   */
  const hasRequiredScanHistory =
    scanIds.size >= 2;

  /*
   * Movement requires both:
   * 1. At least two separate scans/imports.
   * 2. At least two confirmed GPS clusters.
   */
  const movementDetected =
    hasRequiredScanHistory &&
    scannedAreaCount >= 2;

  /*
   * If detected across separate scans but
   * there is no confirmed change of area,
   * classify it as recurring presence.
   *
   * This also covers tracked records that
   * do not have reliable GPS coordinates.
   */
  const recurringPresence =
    hasRequiredScanHistory &&
    !movementDetected;

  const isTracked =
    hasRequiredScanHistory;

  let trackingStatus =
    "Not Tracked";

  if (movementDetected) {
    trackingStatus =
      "Movement Detected";
  } else if (recurringPresence) {
    trackingStatus =
      "Recurring Presence";
  }

  return {
    ...summary,

    rows: normalizedRows,
    rawRows: rows,

    scannedAreaCount,
    detectionCount,

    movementDetected,
    recurringPresence,
    isTracked,
    trackingStatus,
    hasRequiredScanHistory,

    scanCount: scanIds.size,
    dateCount: dateKeys.size,

    scanIds: Array.from(scanIds),
    dateKeys: Array.from(dateKeys),
  };
}

export function analyzeTrackedDevices(
  clientRows = [],
  options = {}
) {
  const grouped = new Map();

  clientRows.forEach((row) => {
    const clientMac = normalizeMac(
      getAny(
        row,
        [
          "client_mac",
          "mac",
          "device_mac",
          "devmac",
        ],
        ""
      )
    );

    if (!clientMac) {
      return;
    }

    if (!grouped.has(clientMac)) {
      grouped.set(clientMac, []);
    }

    grouped
      .get(clientMac)
      .push({
        ...normalizeTrackingRow(row),
        client_mac: clientMac,
        clientMac,
      });
  });

  return Array.from(
    grouped.entries()
  ).map(([clientMac, rows]) => {
    const analysis =
      analyzeTrackedEntity(
        rows,
        options
      );

    const firstRow =
      rows[0] || {};

    const observationCount =
      getObservationCount(rows);

    return {
      clientMac,
      client_mac: clientMac,
      mac: clientMac,

      rows,
      rawRows: rows,

      vendor: normalizeManufacturer(
        getAny(
          firstRow,
          [
            "client_vendor",
            "manufacturer",
            "vendor",
            "device_vendor",
          ],
          ""
        )
      ),

      observations:
        observationCount,

      observationCount,

      records: rows.length,

      scannedAreaCount:
        analysis.scannedAreaCount,

      locationCount:
        analysis.scannedAreaCount,

      scanCount:
        analysis.scanCount,

      dateCount:
        analysis.dateCount,

      movementDetected:
        analysis.movementDetected,

      hasMovement:
        analysis.movementDetected,

      recurringPresence:
        analysis.recurringPresence,

      hasRecurringPresence:
        analysis.recurringPresence,

      isTracked:
        analysis.isTracked,

      trackingStatus:
        analysis.trackingStatus,

      trackingAnalysis:
        analysis,

      firstSeen:
        getFirstSeen(rows),

      lastSeen:
        getLastSeen(rows),
    };
  });
}

export function analyzeTrackedWifi(
  wifiRows = [],
  options = {}
) {
  const grouped = new Map();

  wifiRows.forEach((row) => {
    const bssid = normalizeMac(
      getAny(
        row,
        [
          "bssid",
          "mac",
          "devmac",
          "device_mac",
        ],
        ""
      )
    );

    if (!bssid) {
      return;
    }

    if (!grouped.has(bssid)) {
      grouped.set(bssid, []);
    }

    grouped
      .get(bssid)
      .push({
        ...normalizeTrackingRow(row),
        bssid,
        mac: bssid,
      });
  });

  return Array.from(
    grouped.entries()
  ).map(([bssid, rows]) => {
    const analysis =
      analyzeTrackedEntity(
        rows,
        options
      );

    const ssids = Array.from(
      new Set(
        rows
          .map((row) =>
            normalizeSsid(
              getAny(
                row,
                [
                  "ssid",
                  "network_name",
                  "wifi_name",
                  "name",
                ],
                ""
              ),
              bssid
            )
          )
          .filter(Boolean)
      )
    );

    const vendors = Array.from(
      new Set(
        rows
          .map((row) =>
            getAny(
              row,
              [
                "vendor",
                "manufacturer",
                "device_vendor",
              ],
              ""
            )
          )
          .filter(Boolean)
      )
    );

    const observationCount =
      getObservationCount(rows);

    const primarySsid =
      ssids[0] ||
      "Hidden/Unknown";

    return {
      bssid,
      mac: bssid,

      ssid: primarySsid,
      ssids,

      vendor: normalizeManufacturer(
        vendors[0]
      ),

      vendors,

      rows,
      rawRows: rows,

      observations:
        observationCount,

      observationCount,

      records:
        rows.length,

      scannedAreaCount:
        analysis.scannedAreaCount,

      locationCount:
        analysis.scannedAreaCount,

      scanCount:
        analysis.scanCount,

      dateCount:
        analysis.dateCount,

      movementDetected:
        analysis.movementDetected,

      hasMovement:
        analysis.movementDetected,

      recurringPresence:
        analysis.recurringPresence,

      hasRecurringPresence:
        analysis.recurringPresence,

      isTracked:
        analysis.isTracked,

      trackingStatus:
        analysis.trackingStatus,

      trackingAnalysis:
        analysis,

      firstSeen:
        getFirstSeen(rows),

      lastSeen:
        getLastSeen(rows),
    };
  });
}
