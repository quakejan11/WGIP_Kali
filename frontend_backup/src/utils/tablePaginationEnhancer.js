const PAGE_SIZE_OPTIONS = [10, 50, 100];
const DEFAULT_PAGE_SIZE = 10;
const stateByTable = new WeakMap();

let updateTimer = null;

function formatNumber(value) {
  const numberValue = Number(value || 0);

  if (!Number.isFinite(numberValue)) return "0";

  return numberValue.toLocaleString();
}

function ensureStyle() {
  if (document.getElementById("wgip-table-pagination-style")) return;

  const style = document.createElement("style");
  style.id = "wgip-table-pagination-style";
  style.textContent = `
    .wgip-table-pagination {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      flex-wrap: wrap;
      padding: 10px 0 12px 0;
      margin: 2px 0 4px 0;
      border-bottom: 1px solid rgba(0, 0, 0, 0.08);
      font-family: inherit;
    }

    .wgip-table-pagination-left,
    .wgip-table-pagination-right {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }

    .wgip-table-pagination-label {
      font-size: 13px;
      font-weight: 700;
      color: #475569;
    }

    .wgip-table-pagination-select {
      height: 34px;
      min-width: 82px;
      border: 1px solid rgba(0, 0, 0, 0.2);
      border-radius: 10px;
      padding: 0 10px;
      background: #ffffff;
      font-size: 13px;
      font-weight: 700;
      color: #0f172a;
      outline: none;
    }

    .wgip-table-pagination-info {
      font-size: 13px;
      color: #64748b;
      font-weight: 700;
    }

    .wgip-table-pagination-button {
      height: 34px;
      border: 1px solid rgba(0, 0, 0, 0.18);
      border-radius: 10px;
      padding: 0 12px;
      background: #ffffff;
      color: #0f172a;
      font-size: 13px;
      font-weight: 800;
      cursor: pointer;
    }

    .wgip-table-pagination-button:hover:not(:disabled) {
      background: #f8fafc;
    }

    .wgip-table-pagination-button:disabled {
      opacity: 0.45;
      cursor: not-allowed;
    }
  `;

  document.head.appendChild(style);
}

function getRows(table) {
  const body = table.tBodies && table.tBodies[0];

  if (!body) return [];

  return Array.from(body.rows).filter((row) => {
    if (row.dataset.wgipPaginationSkip === "true") return false;
    return true;
  });
}

function getSignature(rows) {
  const first = rows[0]?.textContent?.trim()?.slice(0, 80) || "";
  const last = rows[rows.length - 1]?.textContent?.trim()?.slice(0, 80) || "";

  return `${rows.length}|${first}|${last}`;
}

function findInsertTarget(table) {
  const tableContainer = table.closest(".MuiTableContainer-root");

  if (tableContainer && tableContainer.parentElement) {
    return tableContainer;
  }

  if (table.parentElement) {
    return table.parentElement;
  }

  return table;
}

function createControls(table) {
  const wrapper = document.createElement("div");
  wrapper.className = "wgip-table-pagination";
  wrapper.dataset.wgipGenerated = "true";

  const left = document.createElement("div");
  left.className = "wgip-table-pagination-left";

  const right = document.createElement("div");
  right.className = "wgip-table-pagination-right";

  const label = document.createElement("span");
  label.className = "wgip-table-pagination-label";
  label.textContent = "Rows per page";

  const select = document.createElement("select");
  select.className = "wgip-table-pagination-select";

  PAGE_SIZE_OPTIONS.forEach((option) => {
    const optionElement = document.createElement("option");
    optionElement.value = String(option);
    optionElement.textContent = String(option);
    select.appendChild(optionElement);
  });

  const info = document.createElement("span");
  info.className = "wgip-table-pagination-info";

  const previousButton = document.createElement("button");
  previousButton.type = "button";
  previousButton.className = "wgip-table-pagination-button";
  previousButton.textContent = "Previous";

  const nextButton = document.createElement("button");
  nextButton.type = "button";
  nextButton.className = "wgip-table-pagination-button";
  nextButton.textContent = "Next";

  left.appendChild(label);
  left.appendChild(select);
  left.appendChild(info);

  right.appendChild(previousButton);
  right.appendChild(nextButton);

  wrapper.appendChild(left);
  wrapper.appendChild(right);

  const state = stateByTable.get(table) || {
    page: 0,
    pageSize: DEFAULT_PAGE_SIZE,
    signature: "",
  };

  state.controls = {
    wrapper,
    select,
    info,
    previousButton,
    nextButton,
  };

  stateByTable.set(table, state);

  select.value = String(state.pageSize);

  select.addEventListener("change", () => {
    const nextSize = Number(select.value);

    state.pageSize = PAGE_SIZE_OPTIONS.includes(nextSize)
      ? nextSize
      : DEFAULT_PAGE_SIZE;

    state.page = 0;
    applyPagination(table);
  });

  previousButton.addEventListener("click", () => {
    state.page = Math.max(0, state.page - 1);
    applyPagination(table);
  });

  nextButton.addEventListener("click", () => {
    const rows = getRows(table);
    const maxPage = Math.max(0, Math.ceil(rows.length / state.pageSize) - 1);

    state.page = Math.min(maxPage, state.page + 1);
    applyPagination(table);
  });

  return wrapper;
}

function attachControls(table) {
  let state = stateByTable.get(table);

  if (!state) {
    state = {
      page: 0,
      pageSize: DEFAULT_PAGE_SIZE,
      signature: "",
      controls: null,
    };

    stateByTable.set(table, state);
  }

  if (state.controls?.wrapper?.isConnected) {
    return state.controls.wrapper;
  }

  const controls = createControls(table);
  const target = findInsertTarget(table);

  if (target.parentElement) {
    target.parentElement.insertBefore(controls, target);
  }

  return controls;
}

function showAllRows(table) {
  const rows = getRows(table);

  rows.forEach((row) => {
    row.style.display = "";
  });
}

function removeControls(table) {
  const state = stateByTable.get(table);

  if (state?.controls?.wrapper?.isConnected) {
    state.controls.wrapper.remove();
  }

  if (state) {
    state.controls = null;
  }
}

function applyPagination(table) {
  if (!table || table.dataset.wgipNoPagination === "true") return;

  const rows = getRows(table);

  if (rows.length <= DEFAULT_PAGE_SIZE) {
    showAllRows(table);
    removeControls(table);
    return;
  }

  const state = stateByTable.get(table) || {
    page: 0,
    pageSize: DEFAULT_PAGE_SIZE,
    signature: "",
    controls: null,
  };

  stateByTable.set(table, state);

  const signature = getSignature(rows);

  if (state.signature !== signature) {
    state.signature = signature;
    state.page = 0;
  }

  const pageSize = PAGE_SIZE_OPTIONS.includes(Number(state.pageSize))
    ? Number(state.pageSize)
    : DEFAULT_PAGE_SIZE;

  state.pageSize = pageSize;

  const maxPage = Math.max(0, Math.ceil(rows.length / pageSize) - 1);
  state.page = Math.min(Math.max(0, state.page), maxPage);

  const start = state.page * pageSize;
  const end = Math.min(start + pageSize, rows.length);

  rows.forEach((row, index) => {
    row.style.display = index >= start && index < end ? "" : "none";
  });

  attachControls(table);

  const controls = state.controls;

  if (!controls) return;

  controls.select.value = String(pageSize);
  controls.info.textContent = `Showing ${formatNumber(start + 1)}-${formatNumber(
    end
  )} of ${formatNumber(rows.length)} records`;

  controls.previousButton.disabled = state.page <= 0;
  controls.nextButton.disabled = state.page >= maxPage;
}

function updateAllTables() {
  ensureStyle();

  const tables = Array.from(document.querySelectorAll("table"));

  tables.forEach((table) => {
    if (table.closest("[data-wgip-generated='true']")) return;
    applyPagination(table);
  });
}

function scheduleUpdate() {
  window.clearTimeout(updateTimer);

  updateTimer = window.setTimeout(() => {
    updateAllTables();
  }, 80);
}

function startTablePaginationEnhancer() {
  ensureStyle();
  updateAllTables();

  const observer = new MutationObserver(() => {
    scheduleUpdate();
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });

  window.addEventListener("resize", scheduleUpdate);
  window.addEventListener("wgip-table-refresh", scheduleUpdate);
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", startTablePaginationEnhancer);
  } else {
    startTablePaginationEnhancer();
  }
}
