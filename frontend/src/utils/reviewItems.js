import { analyzeTrackedDevices, analyzeTrackedWifi } from "./trackingRules";

export const API_BASE_URL = "http://127.0.0.1:8000";

const WIFI_KEYS = [
  "review_items",
  "reviewItems",
  "wifi_networks",
  "wifiNetworks",
  "wifi",
  "networks",
  "observations",
  "bssid_summary",
  "bssidSummary",
  "items",
  "records",
];

const CLIENT_KEYS = [
  "client_observations",
  "clientObservations",
  "observed_devices",
  "observedDevices",
  "clients",
  "devices",
];

export function formatNumber(value) {
  const numericValue = Number(value || 0);

  if (!Number.isFinite(numericValue)) {
    return "0";
  }

  return numericValue.toLocaleString();
}

export function formatDateTime(value) {
  if (!value) {
    return "—";
  }

  try {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return String(value);
    }

    return date.toLocaleString();
  } catch {
    return String(value);
  }
}

export function normalize(value = "") {
  return String(value || "")
    .trim()
    .toLowerCase();
}

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

function normalizeArray(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.records)) return data.records;
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data?.results)) return data.results;
  if (Array.isArray(data?.imports)) return data.imports;
  if (Array.isArray(data?.batches)) return data.batches;

  return [];
}

function getAny(row, keys, fallback = "") {
  for (const key of keys) {
    if (
      row &&
      Object.prototype.hasOwnProperty.call(row, key) &&
      row[key] !== null &&
      row[key] !== undefined &&
      row[key] !== ""
    ) {
      return row[key];
    }
  }

  return fallback;
}

function extractRows(data, keys) {
  if (Array.isArray(data)) {
    return data;
  }

  for (const key of keys) {
    if (Array.isArray(data?.[key]) && data[key].length > 0) {
      return data[key];
    }
  }

  return [];
}

function extractWifiRows(summary) {
  return extractRows(summary, WIFI_KEYS).filter((row) => {
    const bssid = getAny(
      row,
      ["bssid", "mac", "devmac", "device_mac"],
      ""
    );

    return isValidMacLike(bssid);
  });
}

function extractClientRows(summary) {
  return extractRows(summary, CLIENT_KEYS).filter((row) => {
    const clientMac = getAny(
      row,
      ["client_mac", "mac", "device_mac", "devmac"],
      ""
    );

    return isValidMacLike(clientMac);
  });
}

function getBatchId(batch) {
  return getAny(
    batch,
    ["id", "import_batch_id", "batch_id", "scan_id"],
    ""
  );
}

function getBatchName(batch) {
  return (
    getAny(
      batch,
      [
        "manual_area_label",
        "scan_name",
        "name",
        "original_filename",
      ],
      ""
    ) || `Scan #${getBatchId(batch) || "Unknown"}`
  );
}

function getRowScanId(row) {
  return getAny(
    row,
    [
      "import_batch_id",
      "survey_id",
      "scan_id",
      "batch_id",
    ],
    ""
  );
}

function toValueArray(value) {
  if (Array.isArray(value)) return value;
  if (value instanceof Set) return Array.from(value);

  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return [];
  }

  return [value];
}

function getTrackedScanIds(record, rows = []) {
  const directScanIds = [
    ...toValueArray(record?.scanIds),
    ...toValueArray(record?.trackingAnalysis?.scanIds),
  ];

  const rowScanIds = rows
    .map((row) => getRowScanId(row))
    .filter(Boolean);

  return Array.from(
    new Set(
      [...directScanIds, ...rowScanIds]
        .map((value) => String(value || "").trim())
        .filter(Boolean)
    )
  );
}

async function safeJsonFetch(url, fallback) {
  try {
    const response = await fetch(url);

    const data = await response
      .json()
      .catch(() => fallback);

    if (!response.ok) {
      return fallback;
    }

    return data;
  } catch {
    return fallback;
  }
}

function getWifiRowsFromSummaries(summaryResults) {
  const wifiRows = [];

  summaryResults.forEach(({ batch, summary }) => {
    const batchId = getBatchId(batch);
    const batchName = getBatchName(batch);

    extractWifiRows(summary).forEach((row) => {
      const bssid = normalizeMac(
        getAny(
          row,
          ["bssid", "mac", "devmac", "device_mac"],
          ""
        )
      );

      if (!bssid || !isValidMacLike(bssid)) {
        return;
      }

      wifiRows.push({
        ...row,

        bssid,
        mac: bssid,

        import_batch_id:
          getAny(
            row,
            [
              "import_batch_id",
              "survey_id",
              "scan_id",
              "batch_id",
            ],
            ""
          ) || batchId,

        scan_id:
          getAny(
            row,
            [
              "scan_id",
              "import_batch_id",
              "survey_id",
              "batch_id",
            ],
            ""
          ) || batchId,

        scan_name:
          getAny(
            row,
            [
              "scan_name",
              "manual_area_label",
              "area_name",
              "location_name",
            ],
            ""
          ) || batchName,
      });
    });
  });

  return wifiRows;
}

function getClientRowsFromSummaries(summaryResults) {
  const clientRows = [];

  summaryResults.forEach(({ batch, summary }) => {
    const batchId = getBatchId(batch);
    const batchName = getBatchName(batch);

    extractClientRows(summary).forEach((row) => {
      const clientMac = normalizeMac(
        getAny(
          row,
          ["client_mac", "mac", "device_mac", "devmac"],
          ""
        )
      );

      if (!clientMac || !isValidMacLike(clientMac)) {
        return;
      }

      clientRows.push({
        ...row,

        client_mac: clientMac,
        mac: clientMac,

        import_batch_id:
          getRowScanId(row) || batchId,

        scan_id:
          getRowScanId(row) || batchId,

        scan_name:
          getAny(
            row,
            [
              "scan_name",
              "manual_area_label",
              "area_name",
              "location_name",
            ],
            ""
          ) || batchName,
      });
    });
  });

  return clientRows;
}

function createWifiReviewItems(wifiRows) {
  const trackedWifiRecords = analyzeTrackedWifi(
    wifiRows,
    {
      defaultRadiusMeters: 75,
      minRadiusMeters: 35,
      maxRadiusMeters: 160,
      minimumRecurringGapMinutes: 60,
    }
  ).filter((wifi) => wifi.isTracked);

  return trackedWifiRecords.map((wifi) => {
    const rows =
      wifi.rows ||
      wifi.rawRows ||
      [];

    const scanIds = getTrackedScanIds(
      wifi,
      rows
    );

    const isMovement = Boolean(
      wifi.movementDetected
    );

    const locationCount = Number(
      wifi.scannedAreaCount || 0
    );

    const scanCount = Number(
      wifi.scanCount || 0
    );

    const observationCount = Number(
      wifi.observations ||
        wifi.observationCount ||
        wifi.rows?.length ||
        0
    );

    const ssid =
      wifi.ssid ||
      wifi.ssids?.[0] ||
      "Hidden/Unknown";

    return {
      id:
        "wifi-" +
        (isMovement ? "movement" : "recurring") +
        "-" +
        wifi.bssid,

      category: "Wi-Fi",

      statusKey: isMovement
        ? "movement"
        : "recurring",

      statusLabel: isMovement
        ? "Movement Detected"
        : "Recurring Presence",

      title: isMovement
        ? "Wi-Fi Movement Detected"
        : "Wi-Fi Recurring Presence",

      identifier: wifi.bssid,

      secondary: ssid,

      details: isMovement
        ? "Observed across " +
          formatNumber(locationCount) +
          " scanned areas with " +
          formatNumber(observationCount) +
          " detections"
        : "Recurring in the same scanned area over time with " +
          formatNumber(observationCount) +
          " detections",

      scanCount,
      locationCount,
      scannedAreaCount: locationCount,
      observationCount,

      lastSeen: wifi.lastSeen,

      actionLabel: isMovement
        ? "View Movement"
        : "View History",

      actionPath:
        "/bssids/" +
        encodeURIComponent(wifi.bssid),

      ssids: wifi.ssids || [],
      scanIds,
      trackingAnalysis: wifi.trackingAnalysis,
    };
  });
}

function createDeviceReviewItems(clientRows) {
  const trackedDeviceRecords = analyzeTrackedDevices(
    clientRows,
    {
      defaultRadiusMeters: 75,
      minRadiusMeters: 35,
      maxRadiusMeters: 160,
      minimumRecurringGapMinutes: 60,
    }
  ).filter((device) => device.isTracked);

  return trackedDeviceRecords.map((device) => {
    const rows =
      device.rows ||
      device.rawRows ||
      [];

    const scanIds = getTrackedScanIds(
      device,
      rows
    );

    const linkedBssids = Array.from(
      new Set(
        rows
          .map((row) =>
            normalizeMac(
              getAny(
                row,
                ["bssid", "linked_bssid"],
                ""
              )
            )
          )
          .filter(Boolean)
      )
    );

    const linkedSsids = Array.from(
      new Set(
        rows
          .map((row) =>
            getAny(
              row,
              [
                "ssid",
                "linked_ssid",
                "network_name",
              ],
              ""
            )
          )
          .filter(Boolean)
      )
    );

    const locationCount = Number(
      device.scannedAreaCount || 0
    );

    const scanCount = Number(
      device.scanCount || 0
    );

    const observationCount = Number(
      device.observations ||
        device.observationCount ||
        rows.length ||
        0
    );

    const isMovement = Boolean(
      device.movementDetected
    );

    return {
      id:
        "device-" +
        (isMovement ? "movement" : "recurring") +
        "-" +
        device.clientMac,

      category: "Device",

      statusKey: isMovement
        ? "movement"
        : "recurring",

      statusLabel: isMovement
        ? "Movement Detected"
        : "Recurring Presence",

      title: isMovement
        ? "Device Movement Detected"
        : "Device Recurring Presence",

      identifier: device.clientMac,

      secondary:
        device.vendor ||
        "Unknown Manufacturer",

      details: isMovement
        ? "Observed across " +
          formatNumber(locationCount) +
          " scanned areas with " +
          formatNumber(observationCount) +
          " detections"
        : "Recurring in the same scanned area over time with " +
          formatNumber(observationCount) +
          " detections",

      scanCount,
      locationCount,
      scannedAreaCount: locationCount,
      observationCount,

      lastSeen: device.lastSeen,

      actionLabel: isMovement
        ? "View Movement"
        : "View History",

      actionPath:
        "/devices/" +
        encodeURIComponent(device.clientMac) +
        "/link-analysis",

      linkedBssids,
      linkedSsids,
      scanIds,
      trackingAnalysis: device.trackingAnalysis,
    };
  });
}

function sortReviewItems(items) {
  return [...items].sort((a, b) => {
    const priority = {
      movement: 1,
      recurring: 2,
    };

    const priorityDifference =
      (priority[a.statusKey] || 99) -
      (priority[b.statusKey] || 99);

    if (priorityDifference !== 0) {
      return priorityDifference;
    }

    const aTime = new Date(
      a.lastSeen || 0
    ).getTime();

    const bTime = new Date(
      b.lastSeen || 0
    ).getTime();

    const safeATime = Number.isFinite(aTime)
      ? aTime
      : 0;

    const safeBTime = Number.isFinite(bTime)
      ? bTime
      : 0;

    return safeBTime - safeATime;
  });
}

export async function loadReviewItems(options = {}) {
  const requestedScanId = String(
    typeof options === "string"
      ? options
      : options?.scanId ||
          options?.importBatchId ||
          options?.batchId ||
          ""
  ).trim();

  const importsData = await safeJsonFetch(
    `${API_BASE_URL}/kismet-imports/`,
    []
  );

  const importRows = normalizeArray(importsData);

  const summaryResults = await Promise.all(
    importRows.map(async (batch) => {
      const batchId = getBatchId(batch);

      if (!batchId) {
        return {
          batch,
          summary: {},
        };
      }

      const summary = await safeJsonFetch(
        `${API_BASE_URL}/kismet-imports/${batchId}/processed-summary`,
        {}
      );

      return {
        batch,
        summary,
      };
    })
  );

  const clientData = await safeJsonFetch(
    `${API_BASE_URL}/client-observations?limit=20000`,
    []
  );

  const apiClientRows = normalizeArray(clientData);

  const summaryClientRows =
    getClientRowsFromSummaries(summaryResults);

  const clientRows =
    summaryClientRows.length > 0
      ? summaryClientRows
      : apiClientRows;

  const wifiRows =
    getWifiRowsFromSummaries(summaryResults);

  const wifiItems =
    createWifiReviewItems(wifiRows);

  const deviceItems =
    createDeviceReviewItems(clientRows);

  const allItems = sortReviewItems([
    ...wifiItems,
    ...deviceItems,
  ]);

  const items = requestedScanId
    ? allItems.filter((item) =>
        (item.scanIds || []).some(
          (scanId) =>
            String(scanId) === requestedScanId
        )
      )
    : allItems;

  const stats = {
    reviewItems: items.length,

    movementDetected: items.filter(
      (item) =>
        item.statusKey === "movement"
    ).length,

    recurringPresence: items.filter(
      (item) =>
        item.statusKey === "recurring"
    ).length,

    trackedWifi: items.filter(
      (item) =>
        item.category === "Wi-Fi"
    ).length,

    trackedDevices: items.filter(
      (item) =>
        item.category === "Device"
    ).length,

    scansReviewed: requestedScanId
      ? 1
      : importRows.length,
  };

  return {
    items,
    stats,
  };
}
