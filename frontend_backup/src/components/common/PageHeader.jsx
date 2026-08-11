import { Box, Typography } from "@mui/material";

export default function PageHeader({
  icon,
  title,
  description,
  actions = null,
  mb = 3,
}) {
  return (
    <Box
      sx={{
        mb,
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-start",
        gap: 2,
        flexDirection: {
          xs: "column",
          md: "row",
        },
      }}
    >
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1,
            mb: 0.5,
          }}
        >
          {icon && (
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                color: "primary.main",
                flexShrink: 0,
                "& svg": {
                  fontSize: 23,
                },
              }}
            >
              {icon}
            </Box>
          )}

          <Typography
            variant="h4"
            sx={{
              fontWeight: "600 !important",
              letterSpacing: "-0.01em",
              lineHeight: 1.25,
            }}
          >
            {title}
          </Typography>
        </Box>

        {description && (
          <Typography
            variant="body1"
            color="text.secondary"
            sx={{
              fontWeight: "400 !important",
              lineHeight: 1.55,
              maxWidth: 760,
            }}
          >
            {description}
          </Typography>
        )}
      </Box>

      {actions && (
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: {
              xs: "flex-start",
              md: "flex-end",
            },
            gap: 1,
            flexWrap: "wrap",
            maxWidth: {
              xs: "100%",
              md: "48%",
            },
            "& .MuiButton-root": {
              minHeight: 38,
              height: 38,
              px: 1.45,
              py: 0.6,
              borderRadius: 999,
              fontSize: 13.5,
              fontWeight: 700,
              lineHeight: 1,
              whiteSpace: "nowrap",
              textTransform: "none",
            },
            "& .MuiButton-startIcon": {
              mr: 0.75,
              "& svg": {
                fontSize: 18,
              },
            },
            "& .MuiButton-endIcon": {
              ml: 0.75,
              "& svg": {
                fontSize: 18,
              },
            },
          }}
        >
          {actions}
        </Box>
      )}
    </Box>
  );
}