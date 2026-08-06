import { createTheme } from "@mui/material/styles";

const fontFamily = '"Segoe UI", Roboto, Arial, "Helvetica Neue", sans-serif';

const wgipTheme = createTheme({
  palette: {
    mode: "light",
    primary: {
      main: "#087443",
      dark: "#065f36",
      light: "#e8f5ee",
    },
    secondary: {
      main: "#2563eb",
    },
    background: {
      default: "#f7f8fa",
      paper: "#ffffff",
    },
    text: {
      primary: "#111827",
      secondary: "#6b7280",
    },
    divider: "#e5e7eb",
  },

  typography: {
    fontFamily,

    h1: {
      fontSize: "1.75rem",
      fontWeight: 600,
      letterSpacing: "-0.01em",
      lineHeight: 1.2,
    },
    h2: {
      fontSize: "1.55rem",
      fontWeight: 600,
      letterSpacing: "-0.01em",
      lineHeight: 1.22,
    },
    h3: {
      fontSize: "1.38rem",
      fontWeight: 600,
      letterSpacing: "-0.01em",
      lineHeight: 1.25,
    },
    h4: {
      fontSize: "1.22rem",
      fontWeight: 600,
      letterSpacing: "-0.005em",
      lineHeight: 1.3,
    },
    h5: {
      fontSize: "1.05rem",
      fontWeight: 500,
      lineHeight: 1.35,
    },
    h6: {
      fontSize: "0.95rem",
      fontWeight: 500,
      lineHeight: 1.35,
    },
    subtitle1: {
      fontSize: "0.92rem",
      fontWeight: 400,
      lineHeight: 1.45,
    },
    subtitle2: {
      fontSize: "0.84rem",
      fontWeight: 400,
      lineHeight: 1.45,
    },
    body1: {
      fontSize: "0.9rem",
      fontWeight: 400,
      lineHeight: 1.55,
    },
    body2: {
      fontSize: "0.82rem",
      fontWeight: 400,
      lineHeight: 1.5,
    },
    caption: {
      fontSize: "0.72rem",
      fontWeight: 400,
      lineHeight: 1.4,
    },
    button: {
      fontSize: "0.78rem",
      fontWeight: 500,
      textTransform: "none",
    },
  },

  shape: {
    borderRadius: 10,
  },

  components: {
    MuiCssBaseline: {
      styleOverrides: {
        html: {
          fontFamily,
        },
        body: {
          margin: 0,
          backgroundColor: "#f7f8fa",
          color: "#111827",
          fontFamily,
          fontSize: "14px",
          WebkitFontSmoothing: "antialiased",
          MozOsxFontSmoothing: "grayscale",
        },
        "*": {
          boxSizing: "border-box",
        },
      },
    },

    MuiTypography: {
      styleOverrides: {
        root: {
          fontFamily,
        },
        h1: {
          fontWeight: 600,
        },
        h2: {
          fontWeight: 600,
        },
        h3: {
          fontWeight: 600,
        },
        h4: {
          fontWeight: 600,
        },
        h5: {
          fontWeight: 500,
        },
        h6: {
          fontWeight: 500,
        },
      },
    },

    MuiPaper: {
      defaultProps: {
        elevation: 0,
      },
      styleOverrides: {
        root: {
          backgroundImage: "none",
        },
      },
    },

    MuiButton: {
      defaultProps: {
        size: "small",
      },
      styleOverrides: {
        root: {
          borderRadius: 999,
          boxShadow: "none",
          minHeight: 34,
          paddingLeft: 14,
          paddingRight: 14,
          fontWeight: 500,
        },
        contained: {
          boxShadow: "none",
        },
      },
    },

    MuiChip: {
      defaultProps: {
        size: "small",
      },
      styleOverrides: {
        root: {
          height: 25,
          fontSize: "0.72rem",
          fontWeight: 500,
        },
      },
    },

    MuiAlert: {
      styleOverrides: {
        root: {
          borderRadius: 10,
          fontSize: "0.82rem",
        },
        message: {
          fontSize: "0.82rem",
          fontWeight: 400,
        },
      },
    },

    MuiTable: {
      defaultProps: {
        size: "small",
      },
    },

    MuiTableCell: {
      styleOverrides: {
        root: {
          fontSize: "0.8rem",
          paddingTop: 8,
          paddingBottom: 8,
          borderBottom: "1px solid #f1f5f9",
        },
        head: {
          fontSize: "0.75rem",
          fontWeight: 600,
          color: "#6b7280",
          backgroundColor: "#f8fafc",
        },
      },
    },

    MuiTextField: {
      defaultProps: {
        size: "small",
      },
    },

    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: 10,
          fontSize: "0.84rem",
          backgroundColor: "#ffffff",
        },
      },
    },

    MuiIconButton: {
      defaultProps: {
        size: "small",
      },
      styleOverrides: {
        root: {
          borderRadius: 10,
        },
      },
    },
  },
});

export default wgipTheme;