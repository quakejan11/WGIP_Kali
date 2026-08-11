/**
 * normalizeMac
 *
 * Nililinis and ginagawang consistent yung MAC address.
 *
 * Purpose:
 * - decode URL-encoded MAC kung galing siya sa route
 * - trim spaces
 * - lowercase para consistent ang comparison
 *
 * Example:
 * "11%3A22%3A33%3A44%3A55%3A66"
 * becomes:
 * "11:22:33:44:55:66"
 */
export function normalizeMac(mac) {
  try {
    return decodeURIComponent(String(mac || "")).trim().toLowerCase();
  } catch {
    return String(mac || "").trim().toLowerCase();
  }
}

/**
 * isValidCustomDeviceName
 *
 * Checks kung valid ba yung custom device name.
 *
 * Bakit kailangan:
 * Ayaw natin i-save or i-display yung useless names like:
 * - empty string
 * - same lang sa MAC address
 * - "Unknown Device"
 * - "Unknown Vendor"
 *
 * Important:
 * Device name is for display/review only.
 * Hindi ito owner identity.
 */
export function isValidCustomDeviceName(name, mac) {
  const cleanName = String(name || "").trim();
  const cleanNameLower = cleanName.toLowerCase();
  const cleanMac = normalizeMac(mac);

  if (!cleanName) return false;
  if (cleanNameLower === cleanMac) return false;
  if (cleanNameLower === "observed device") return false;
  if (cleanNameLower === "unnamed device") return false;
  if (cleanNameLower === "unknown device") return false;
  if (cleanNameLower === "unknown vendor") return false;

  return true;
}

/**
 * getDeviceNameKeys
 *
 * Gumagawa ng possible localStorage keys for one device.
 *
 * Bakit marami:
 * May pages na gumagamit ng raw MAC,
 * may pages na gumagamit ng encoded MAC.
 *
 * Para hindi mawala yung saved name kahit iba format ng route.
 */
export function getDeviceNameKeys(mac) {
  const cleanMac = normalizeMac(mac);
  const encodedMac = encodeURIComponent(cleanMac);

  return [
    `wgip_device_name_${cleanMac}`,
    `wgip_device_name_${encodedMac}`,
    `wgip_device_display_name_${cleanMac}`,
    `wgip_device_display_name_${encodedMac}`,
  ];
}

/**
 * getSavedDeviceName
 *
 * Kinukuha yung saved custom device name from browser localStorage.
 *
 * Used by:
 * - ClientDeviceTimeline.jsx
 * - DeviceLinkAnalysis.jsx
 *
 * Note:
 * localStorage is per browser/device.
 * Hindi siya shared sa ibang laptop unless may backend saving.
 */
export function getSavedDeviceName(mac) {
  try {
    const keys = getDeviceNameKeys(mac);

    for (const key of keys) {
      const value = localStorage.getItem(key);

      if (isValidCustomDeviceName(value, mac)) {
        return value.trim();
      }
    }

    return "";
  } catch {
    return "";
  }
}

/**
 * saveDeviceName
 *
 * Saves custom device name to browser localStorage.
 *
 * Also dispatches an event:
 * "wgip-device-name-updated"
 *
 * Bakit may event:
 * Para kapag inedit yung name sa Device Timeline,
 * automatic malaman ng ibang open component/page like Device Link Analysis.
 */
export function saveDeviceName(mac, name) {
  try {
    const cleanName = String(name || "").trim();
    const keys = getDeviceNameKeys(mac);

    keys.forEach((key) => {
      if (cleanName) {
        localStorage.setItem(key, cleanName);
      } else {
        localStorage.removeItem(key);
      }
    });

    /**
     * Broadcast update sa frontend.
     *
     * Other pages can listen to this event para mag-refresh display name.
     */
    window.dispatchEvent(
      new CustomEvent("wgip-device-name-updated", {
        detail: {
          mac: normalizeMac(mac),
          name: cleanName,
        },
      })
    );
  } catch {
    // Ignore browser storage issues para hindi mag-crash UI.
  }
}

/**
 * pickDeviceName
 *
 * Pinipili kung anong device name ang gagamitin.
 *
 * Priority:
 * 1. savedName from localStorage
 * 2. apiName from backend/profile endpoint
 * 3. fallbackName from row/data
 * 4. empty string kung wala talagang valid name
 *
 * Purpose:
 * Consistent ang display name across pages.
 */
export function pickDeviceName({
  savedName,
  apiName,
  fallbackName,
  mac,
}) {
  if (isValidCustomDeviceName(savedName, mac)) return savedName.trim();
  if (isValidCustomDeviceName(apiName, mac)) return apiName.trim();
  if (isValidCustomDeviceName(fallbackName, mac)) return fallbackName.trim();

  return "";
}