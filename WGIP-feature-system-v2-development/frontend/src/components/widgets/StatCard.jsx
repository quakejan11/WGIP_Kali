import { Paper, Typography, Box, Stack } from "@mui/material";

export default function StatCard({ title, value, subtitle, icon }) {
  return (
    <Paper
      elevation={0}
      sx={{
        p: 3,
        height: "100%",
        border: "1px solid",
        borderColor: "divider",
        borderRadius: 3,
        backgroundColor: "background.paper",
      }}
    >
      <Stack direction="row" spacing={2} alignItems="flex-start">
        {icon && (
          <Box
            sx={{
              width: 48,
              height: 48,
              borderRadius: 3,
              bgcolor: "primary.light",
              color: "primary.main",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            {icon}
          </Box>
        )}

        <Box>
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.04em",
              fontSize: 12,
            }}
          >
            {title}
          </Typography>

          <Typography
            variant="h4"
            sx={{
              mt: 0.75,
              fontWeight: 800,
              letterSpacing: "-0.03em",
            }}
          >
            {value}
          </Typography>

          {subtitle && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
              {subtitle}
            </Typography>
          )}
        </Box>
      </Stack>
    </Paper>
  );
}