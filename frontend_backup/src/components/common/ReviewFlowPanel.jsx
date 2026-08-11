import { useState } from "react";
import { Link } from "react-router-dom";

import {
  Box,
  Button,
  Collapse,
  Divider,
  Paper,
  Stack,
  Typography,
} from "@mui/material";

import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import KeyboardArrowUpIcon from "@mui/icons-material/KeyboardArrowUp";

function FlowStep({ number, title, description, active = false, to = "" }) {
  const content = (
    <Box
      sx={{
        p: 1.4,
        borderRadius: 2.5,
        border: "1px solid",
        borderColor: active ? "primary.main" : "divider",
        bgcolor: active ? "#e8f5ee" : "#ffffff",
        minHeight: 88,
        display: "flex",
        gap: 1.2,
        alignItems: "flex-start",
        cursor: to ? "pointer" : "default",
        textDecoration: "none",
        color: "inherit",
        "&:hover": {
          bgcolor: to ? "#f8fafc" : active ? "#e8f5ee" : "#ffffff",
        },
      }}
    >
      <Box
        sx={{
          width: 28,
          height: 28,
          borderRadius: "50%",
          bgcolor: active ? "primary.main" : "#f1f5f9",
          color: active ? "#ffffff" : "#475569",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 13,
          fontWeight: 700,
          flexShrink: 0,
        }}
      >
        {number}
      </Box>

      <Box>
        <Typography variant="body2" sx={{ fontWeight: 700, mb: 0.25 }}>
          {title}
        </Typography>

        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ fontWeight: 400 }}
        >
          {description}
        </Typography>
      </Box>
    </Box>
  );

  if (!to) return content;

  return (
    <Box component={Link} to={to} sx={{ textDecoration: "none" }}>
      {content}
    </Box>
  );
}

export default function ReviewFlowPanel({
  title = "Review Flow",
  description = "Open this guide to see the suggested review order for this page.",
  steps = [],
  defaultOpen = false,
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <Paper
      sx={{
        mb: 2,
        borderRadius: 3,
        border: "1px solid",
        borderColor: "divider",
        bgcolor: "#ffffff",
        overflow: "hidden",
      }}
    >
      <Stack
        direction={{ xs: "column", sm: "row" }}
        justifyContent="space-between"
        alignItems={{ xs: "stretch", sm: "center" }}
        spacing={1.5}
        sx={{ p: 2 }}
      >
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 600, mb: 0.35 }}>
            {title}
          </Typography>

          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ fontWeight: 400 }}
          >
            {open
              ? description
              : "Click Show Flow Guide to view the suggested review order."}
          </Typography>
        </Box>

        <Button
          onClick={() => setOpen((current) => !current)}
          variant="outlined"
          endIcon={open ? <KeyboardArrowUpIcon /> : <KeyboardArrowDownIcon />}
        >
          {open ? "Hide Flow Guide" : "Show Flow Guide"}
        </Button>
      </Stack>

      <Collapse in={open} timeout="auto" unmountOnExit>
        <Divider />

        <Box sx={{ p: 2 }}>
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: {
                xs: "1fr",
                sm: "1fr 1fr",
                lg: "repeat(5, 1fr)",
              },
              gap: 1.2,
            }}
          >
            {steps.map((step, index) => (
              <FlowStep
                key={`${step.title}-${index}`}
                number={step.number || index + 1}
                title={step.title}
                description={step.description}
                active={step.active}
                to={step.to}
              />
            ))}
          </Box>
        </Box>
      </Collapse>
    </Paper>
  );
}