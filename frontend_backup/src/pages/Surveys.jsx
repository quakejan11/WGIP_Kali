import { useEffect, useState } from "react";
import {
  Box,
  Typography,
  Paper,
  Alert,
  IconButton,
  Stack,
  Tooltip,
  Chip,
  CircularProgress,
} from "@mui/material";
import RefreshIcon from "@mui/icons-material/Refresh";
import { DataGrid } from "@mui/x-data-grid";

import api from "../services/api";

const columns = [
  { field: "id", headerName: "ID", width: 70 },
  { field: "survey_name", headerName: "Survey Name", width: 240 },
  { field: "operator", headerName: "Operator", width: 180 },
  { field: "start_time_display", headerName: "Start Time", width: 220 },
  { field: "end_time_display", headerName: "End Time", width: 220 },
  { field: "notes", headerName: "Notes", width: 320 },
];

export default function Surveys() {
  const [surveys, setSurveys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadSurveys() {
    try {
      setLoading(true);

      const response = await api.get("/surveys");

      const formattedRows = response.data
        .map((item) => ({
          ...item,
          start_time_display: item.start_time
            ? new Date(item.start_time).toLocaleString()
            : "",
          end_time_display: item.end_time
            ? new Date(item.end_time).toLocaleString()
            : "Ongoing / Not ended",
        }))
        .sort((a, b) => new Date(b.start_time) - new Date(a.start_time));

      setSurveys(formattedRows);
      setError("");
    } catch (err) {
      console.error(err);
      setError("Unable to load surveys from WGIP backend API.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadSurveys();
  }, []);

  return (
    <Box>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h4" gutterBottom>
          Surveys
        </Typography>

        <Typography color="text.secondary" sx={{ mb: 1.5 }}>
          Collection sessions used to organize wireless observations.
        </Typography>

        <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
          <Chip label={`${surveys.length} total surveys`} size="small" />

          <Tooltip title="Refresh surveys">
            <span>
              <IconButton
                size="small"
                onClick={loadSurveys}
                disabled={loading}
                sx={{
                  border: "1px solid",
                  borderColor: "divider",
                  backgroundColor: "background.paper",
                  width: 32,
                  height: 32,
                }}
              >
                {loading ? (
                  <CircularProgress size={16} />
                ) : (
                  <RefreshIcon fontSize="small" />
                )}
              </IconButton>
            </span>
          </Tooltip>
        </Stack>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      <Paper
        elevation={0}
        sx={{
          p: 2,
          border: "1px solid",
          borderColor: "divider",
          borderRadius: 3,
          overflow: "hidden",
        }}
      >
        <Box
          sx={{
            width: "100%",
            overflowX: "auto",
          }}
        >
          <Box sx={{ height: 560, minWidth: 1250 }}>
            <DataGrid
              rows={surveys}
              columns={columns}
              loading={loading}
              density="compact"
              pageSizeOptions={[10, 25, 50]}
              initialState={{
                pagination: {
                  paginationModel: {
                    pageSize: 10,
                    page: 0,
                  },
                },
              }}
              disableRowSelectionOnClick
              sx={{
                border: "none",
                "& .MuiDataGrid-columnHeaders": {
                  backgroundColor: "background.default",
                },
                "& .MuiDataGrid-cell": {
                  fontSize: 13,
                },
                "& .MuiDataGrid-columnHeaderTitle": {
                  fontSize: 13,
                  fontWeight: 700,
                },
              }}
            />
          </Box>
        </Box>
      </Paper>
    </Box>
  );
}