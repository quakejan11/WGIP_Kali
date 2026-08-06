import React from "react";
import ReactDOM from "react-dom/client";
import "leaflet/dist/leaflet.css";

import { CssBaseline, ThemeProvider } from "@mui/material";

import App from "./App.jsx";
import wgipTheme from "./theme/wgipTheme";

import "./index.css";

import "./utils/tablePaginationEnhancer";
ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ThemeProvider theme={wgipTheme}>
      <CssBaseline />
      <App />
    </ThemeProvider>
  </React.StrictMode>
);
