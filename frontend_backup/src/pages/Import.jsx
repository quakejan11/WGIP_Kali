import { useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Divider,
  FormControlLabel,
  LinearProgress,
  Stack,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import CloudUploadOutlinedIcon from "@mui/icons-material/CloudUploadOutlined";
import InsertDriveFileOutlinedIcon from "@mui/icons-material/InsertDriveFileOutlined";
import MapOutlinedIcon from "@mui/icons-material/MapOutlined";
import RouteOutlinedIcon from "@mui/icons-material/RouteOutlined";
import CheckCircleOutlineOutlinedIcon from "@mui/icons-material/CheckCircleOutlineOutlined";

const API_BASE_URL = "http://127.0.0.1:8000";

function getFileExtension(fileName = "") {
  const parts = fileName.toLowerCase().split(".");
  return parts.length > 1 ? parts.pop() : "";
}

function formatFileSize(bytes = 0) {
  if (!bytes) return "0 KB";

  const kilobytes = bytes / 1024;
  const megabytes = kilobytes / 1024;

  if (megabytes >= 1) {
    return `${megabytes.toFixed(2)} MB`;
  }

  return `${kilobytes.toFixed(2)} KB`;
}

function getBatchIdFromResponse(data = {}) {
  return (
    data?.id ||
    data?.import_batch_id ||
    data?.batch_id ||
    data?.scan_id ||
    data?.batch?.id ||
    data?.import_batch?.id ||
    data?.result?.id ||
    ""
  );
}

function getResponseMessage(data = {}) {
  return (
    data?.message ||
    data?.detail ||
    data?.status ||
    "Import completed successfully."
  );
}

export default function Import() {
  const navigate = useNavigate();
  const fileInputRef = useRef(null);

  const [selectedFile, setSelectedFile] = useState(null);
  const [scanName, setScanName] = useState("");
  const [locationName, setLocationName] = useState("");
  const [manualLatitude, setManualLatitude] = useState("");
  const [manualLongitude, setManualLongitude] = useState("");

  // Locked ON for .kismet imports.
  const [importPackets, setImportPackets] = useState(true);

  const [isImporting, setIsImporting] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [lastImportBatchId, setLastImportBatchId] = useState("");

  const selectedFileExtension = useMemo(() => {
    return getFileExtension(selectedFile?.name || "");
  }, [selectedFile]);

  const isKismetFile = selectedFileExtension === "kismet";
  const isCsvFile = selectedFileExtension === "csv";
  const isSupportedFile = isKismetFile || isCsvFile;

  const uploadEndpoint = useMemo(() => {
    if (isKismetFile) return `${API_BASE_URL}/kismet-imports/upload`;
    if (isCsvFile) return `${API_BASE_URL}/kismet-csv-imports/upload`;
    return "";
  }, [isKismetFile, isCsvFile]);

  function resetStatus() {
    setSuccessMessage("");
    setErrorMessage("");
    setLastImportBatchId("");
  }

  function handleFileSelect(event) {
    const file = event.target.files?.[0];

    resetStatus();
    setSelectedFile(file || null);

    if (file) {
      const extension = getFileExtension(file.name);

      if (extension === "kismet") {
        setImportPackets(true);
      }

      if (!scanName) {
        setScanName(file.name.replace(/\.[^/.]+$/, ""));
      }
    }
  }

  function handleChooseFile() {
    fileInputRef.current?.click();
  }

  function handleClearFile() {
    resetStatus();
    setSelectedFile(null);

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  async function handleImport() {
    resetStatus();

    if (!selectedFile) {
      setErrorMessage("Please select a .kismet or .csv file first.");
      return;
    }

    if (!isSupportedFile) {
      setErrorMessage("Unsupported file type. Please upload a .kismet or .csv file.");
      return;
    }

    if (!uploadEndpoint) {
      setErrorMessage("Upload endpoint is not available for this file type.");
      return;
    }

    const formData = new FormData();

    formData.append("file", selectedFile);

    if (scanName.trim()) {
      formData.append("scan_name", scanName.trim());
      formData.append("name", scanName.trim());
    }

    if (locationName.trim()) {
      formData.append("location_name", locationName.trim());
      formData.append("location", locationName.trim());
    }

    if (manualLatitude !== "") {
      formData.append("manual_latitude", manualLatitude);
      formData.append("latitude", manualLatitude);
    }

    if (manualLongitude !== "") {
      formData.append("manual_longitude", manualLongitude);
      formData.append("longitude", manualLongitude);
    }

    // Critical for moving hotspot/BSSID testing:
    // Always force raw packet import for .kismet files.
    if (isKismetFile) {
      formData.append("import_packets", "true");
    }

    setIsImporting(true);

    try {
      const response = await fetch(uploadEndpoint, {
        method: "POST",
        body: formData,
      });

      let data = {};

      try {
        data = await response.json();
      } catch {
        data = {};
      }

      if (!response.ok) {
        throw new Error(
          data?.detail ||
            data?.message ||
            `Import failed with status ${response.status}.`
        );
      }

      const batchId = getBatchIdFromResponse(data);
      const message = getResponseMessage(data);

      setLastImportBatchId(batchId);

      if (batchId) {
        setSuccessMessage(`${message} Scan #${batchId} is ready for review.`);
      } else {
        setSuccessMessage(message);
      }
    } catch (error) {
      setErrorMessage(error?.message || "Import failed. Please try again.");
    } finally {
      setIsImporting(false);
    }
  }

  function handleGoToScanResult() {
    if (!lastImportBatchId) return;
    navigate(`/scans/${lastImportBatchId}`);
  }

  return (
    <Box>
      <Stack spacing={2}>
        <Box>
          <Typography variant="h4" fontWeight={900}>
            Import Scan Data
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Upload Kismet or CSV scan files. For .kismet files, raw packets are
            imported automatically for movement analysis.
          </Typography>
        </Box>

        {successMessage && (
          <Alert
            severity="success"
            icon={<CheckCircleOutlineOutlinedIcon />}
            action={
              lastImportBatchId ? (
                <Button
                  color="inherit"
                  size="small"
                  onClick={handleGoToScanResult}
                  sx={{ fontWeight: 700, whiteSpace: "nowrap" }}
                >
                  Go to Scan Results
                </Button>
              ) : null
            }
          >
            {successMessage}
          </Alert>
        )}

        {errorMessage && <Alert severity="error">{errorMessage}</Alert>}

        <Card>
          <CardContent>
            <Stack spacing={2}>
              <Box>
                <Typography variant="h6" fontWeight={800}>
                  Upload File
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Supported files: .kismet and .csv
                </Typography>
              </Box>

              <Box
                onClick={handleChooseFile}
                sx={{
                  border: "1.5px dashed #CBD5E1",
                  borderRadius: 3,
                  p: 3,
                  cursor: "pointer",
                  background: "#F8FAFC",
                  textAlign: "center",
                  transition: "0.15s ease",
                  "&:hover": {
                    background: "#F1F5F9",
                    borderColor: "#94A3B8",
                  },
                }}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".kismet,.csv"
                  onChange={handleFileSelect}
                  style={{ display: "none" }}
                />

                <CloudUploadOutlinedIcon
                  sx={{
                    fontSize: 44,
                    color: "#64748B",
                    mb: 1,
                  }}
                />

                <Typography variant="body1" fontWeight={800}>
                  Click to select scan file
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Choose a Kismet database file or exported CSV file.
                </Typography>
              </Box>

              {selectedFile && (
                <Box
                  sx={{
                    border: "1px solid #E2E8F0",
                    borderRadius: 2,
                    p: 1.5,
                    background: "#FFFFFF",
                  }}
                >
                  <Stack
                    direction={{ xs: "column", md: "row" }}
                    spacing={1}
                    sx={{
                      alignItems: { xs: "flex-start", md: "center" },
                      justifyContent: "space-between",
                    }}
                  >
                    <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                      <InsertDriveFileOutlinedIcon sx={{ color: "#475569" }} />

                      <Box>
                        <Typography variant="body2" fontWeight={800}>
                          {selectedFile.name}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {formatFileSize(selectedFile.size)}
                        </Typography>
                      </Box>
                    </Stack>

                    <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                      <Chip
                        size="small"
                        label={selectedFileExtension.toUpperCase()}
                        color={isSupportedFile ? "primary" : "error"}
                        variant="outlined"
                      />

                      <Button size="small" variant="outlined" onClick={handleClearFile}>
                        Remove
                      </Button>
                    </Stack>
                  </Stack>
                </Box>
              )}

              <Divider />

              <Stack spacing={1.5}>
                <Typography variant="h6" fontWeight={800}>
                  Scan Details
                </Typography>

                <TextField
                  label="Scan Name"
                  value={scanName}
                  onChange={(event) => setScanName(event.target.value)}
                  placeholder="Example: Ortigas Moving Hotspot Test"
                  fullWidth
                  size="small"
                />

                <TextField
                  label="Location Name"
                  value={locationName}
                  onChange={(event) => setLocationName(event.target.value)}
                  placeholder="Example: Ortigas / Greenhills route"
                  fullWidth
                  size="small"
                />

                <Stack direction={{ xs: "column", md: "row" }} spacing={1.5}>
                  <TextField
                    label="Manual Latitude"
                    value={manualLatitude}
                    onChange={(event) => setManualLatitude(event.target.value)}
                    placeholder="Optional"
                    fullWidth
                    size="small"
                  />

                  <TextField
                    label="Manual Longitude"
                    value={manualLongitude}
                    onChange={(event) => setManualLongitude(event.target.value)}
                    placeholder="Optional"
                    fullWidth
                    size="small"
                  />
                </Stack>

                <Alert severity="info" icon={<RouteOutlinedIcon />}>
                  Raw packet import is automatic for .kismet files. This enables
                  movement path extraction when packet GPS data exists.
                </Alert>

                <FormControlLabel
                  control={
                    <Switch
                      checked={isKismetFile ? true : importPackets}
                      disabled
                      onChange={(event) => setImportPackets(event.target.checked)}
                    />
                  }
                  label={
                    isKismetFile
                      ? "Raw packet import is locked ON for .kismet files"
                      : "Raw packet import is only available for .kismet files"
                  }
                />
              </Stack>

              {isImporting && (
                <Box>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                    Importing scan data. Please wait...
                  </Typography>
                  <LinearProgress />
                </Box>
              )}

              <Stack
                direction={{ xs: "column", sm: "row" }}
                spacing={1}
                sx={{
                  alignItems: { xs: "stretch", sm: "center" },
                  justifyContent: "space-between",
                }}
              >
                <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                  <Chip
                    icon={<MapOutlinedIcon />}
                    label={
                      isKismetFile
                        ? "Kismet import"
                        : isCsvFile
                          ? "CSV import"
                          : "No valid file selected"
                    }
                    variant="outlined"
                    color={isSupportedFile ? "primary" : "default"}
                  />

                  {isKismetFile && (
                    <Chip
                      icon={<RouteOutlinedIcon />}
                      label="Movement-ready"
                      variant="outlined"
                      color="success"
                    />
                  )}
                </Stack>

                <Button
                  variant="contained"
                  startIcon={<CloudUploadOutlinedIcon />}
                  onClick={handleImport}
                  disabled={isImporting || !selectedFile || !isSupportedFile}
                  sx={{
                    fontWeight: 800,
                    whiteSpace: "nowrap",
                  }}
                >
                  {isImporting ? "Importing..." : "Import Scan"}
                </Button>
              </Stack>
            </Stack>
          </CardContent>
        </Card>
      </Stack>
    </Box>
  );
}