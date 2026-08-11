const EARTH_RADIUS_METERS = 6371000;

function toNumber(value) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

export function isValidCoordinate(latitude, longitude) {
  const lat = toNumber(latitude);
  const lon = toNumber(longitude);

  return (
    lat !== null &&
    lon !== null &&
    !(lat === 0 && lon === 0) &&
    lat >= -90 &&
    lat <= 90 &&
    lon >= -180 &&
    lon <= 180
  );
}

export function distanceMeters(a, b) {
  if (!a || !b) return Number.POSITIVE_INFINITY;
  if (!isValidCoordinate(a.latitude, a.longitude)) return Number.POSITIVE_INFINITY;
  if (!isValidCoordinate(b.latitude, b.longitude)) return Number.POSITIVE_INFINITY;

  const lat1 = Number(a.latitude) * (Math.PI / 180);
  const lat2 = Number(b.latitude) * (Math.PI / 180);
  const deltaLat = (Number(b.latitude) - Number(a.latitude)) * (Math.PI / 180);
  const deltaLon = (Number(b.longitude) - Number(a.longitude)) * (Math.PI / 180);

  const haversine =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(lat1) *
      Math.cos(lat2) *
      Math.sin(deltaLon / 2) *
      Math.sin(deltaLon / 2);

  return 2 * EARTH_RADIUS_METERS * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

function getTimestampValue(item) {
  const value =
    item?.timestamp ||
    item?.last_seen ||
    item?.first_seen ||
    item?.created_at ||
    item?.time ||
    "";

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function getDateKey(item) {
  const value =
    item?.timestamp ||
    item?.last_seen ||
    item?.first_seen ||
    item?.created_at ||
    item?.time ||
    "";

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

function getScanId(item) {
  return String(
    item?.scan_id ??
      item?.import_batch_id ??
      item?.survey_id ??
      item?.batch_id ??
      item?.scanId ??
      ""
  );
}

function average(values) {
  const valid = values.map(Number).filter(Number.isFinite);

  if (valid.length === 0) return null;

  return valid.reduce((sum, value) => sum + value, 0) / valid.length;
}

function median(values) {
  const valid = values.map(Number).filter(Number.isFinite).sort((a, b) => a - b);

  if (valid.length === 0) return null;

  const middle = Math.floor(valid.length / 2);

  if (valid.length % 2) return valid[middle];

  return (valid[middle - 1] + valid[middle]) / 2;
}

export function getAdaptiveClusterRadiusMeters(points, options = {}) {
  const minRadius = Number(options.minRadiusMeters ?? 35);
  const maxRadius = Number(options.maxRadiusMeters ?? 160);
  const defaultRadius = Number(options.defaultRadiusMeters ?? 75);

  const validPoints = points.filter((point) =>
    isValidCoordinate(point.latitude, point.longitude)
  );

  if (validPoints.length <= 2) return defaultRadius;

  const nearestDistances = validPoints
    .map((point, index) => {
      const distances = validPoints
        .filter((_, otherIndex) => otherIndex !== index)
        .map((otherPoint) => distanceMeters(point, otherPoint))
        .filter((distance) => Number.isFinite(distance) && distance > 0);

      return distances.length ? Math.min(...distances) : null;
    })
    .filter((distance) => Number.isFinite(distance));

  const medianNearest = median(nearestDistances);

  if (!medianNearest) return defaultRadius;

  const adaptiveRadius = Math.max(defaultRadius, medianNearest * 2.5);

  return Math.max(minRadius, Math.min(maxRadius, adaptiveRadius));
}

export function clusterDetectionsByArea(items = [], options = {}) {
  const radiusMeters = Number(
    options.radiusMeters ?? getAdaptiveClusterRadiusMeters(items, options)
  );

  const validItems = items
    .filter((item) => isValidCoordinate(item.latitude, item.longitude))
    .map((item, index) => ({
      ...item,
      __originalIndex: index,
      __timeValue: getTimestampValue(item),
    }))
    .sort((a, b) => a.__timeValue - b.__timeValue || a.__originalIndex - b.__originalIndex);

  const clusters = [];

  validItems.forEach((item) => {
    let bestCluster = null;
    let bestDistance = Number.POSITIVE_INFINITY;

    clusters.forEach((cluster) => {
      const distance = distanceMeters(
        { latitude: cluster.centerLatitude, longitude: cluster.centerLongitude },
        item
      );

      if (distance <= radiusMeters && distance < bestDistance) {
        bestCluster = cluster;
        bestDistance = distance;
      }
    });

    if (!bestCluster) {
      bestCluster = {
        id: clusters.length + 1,
        items: [],
        centerLatitude: Number(item.latitude),
        centerLongitude: Number(item.longitude),
        firstSeen: "",
        lastSeen: "",
        scanIds: new Set(),
        dateKeys: new Set(),
      };

      clusters.push(bestCluster);
    }

    bestCluster.items.push(item);

    bestCluster.centerLatitude =
      average(bestCluster.items.map((entry) => Number(entry.latitude))) ??
      Number(item.latitude);

    bestCluster.centerLongitude =
      average(bestCluster.items.map((entry) => Number(entry.longitude))) ??
      Number(item.longitude);

    const timestamps = bestCluster.items
      .map((entry) => getTimestampValue(entry))
      .filter((value) => value > 0)
      .sort((a, b) => a - b);

    if (timestamps.length > 0) {
      bestCluster.firstSeen = new Date(timestamps[0]).toISOString();
      bestCluster.lastSeen = new Date(timestamps[timestamps.length - 1]).toISOString();
    }

    bestCluster.scanIds = new Set(
      bestCluster.items.map(getScanId).filter((value) => value !== "")
    );

    bestCluster.dateKeys = new Set(
      bestCluster.items.map(getDateKey).filter((value) => value !== "")
    );
  });

  return clusters
    .map((cluster, index) => ({
      ...cluster,
      areaNumber: index + 1,
      detectionCount: cluster.items.length,
      scanCount: cluster.scanIds.size,
      dateCount: cluster.dateKeys.size,
      scanIdsList: Array.from(cluster.scanIds),
      dateKeysList: Array.from(cluster.dateKeys),
    }))
    .sort((a, b) => {
      const aTime = getTimestampValue({ timestamp: a.firstSeen });
      const bTime = getTimestampValue({ timestamp: b.firstSeen });

      return aTime - bTime;
    });
}

export function summarizeClusterMovement(items = [], options = {}) {
  const clusters = clusterDetectionsByArea(items, options);

  const movementDetected = clusters.length >= Number(options.minClustersForMovement ?? 2);

  const recurringPresence = clusters.some((cluster) => {
    return cluster.scanCount >= 2 || cluster.dateCount >= 2;
  });

  return {
    clusters,
    areaCount: clusters.length,
    detectionCount: items.length,
    movementDetected,
    recurringPresence,
    clusterRadiusMeters:
      Number(options.radiusMeters) || getAdaptiveClusterRadiusMeters(items, options),
  };
}
