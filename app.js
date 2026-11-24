const STORAGE_KEY = "inventario_costo_dpto94_local155_v1";

let activeTab = "deposito"; // 'deposito' | 'piso' | 'resumen'
let counts = loadCounts(); // { [itemCode]: { deposito: number|null, piso: number|null } }
let activeModalItem = null;

const fmtCLP = (n) =>
  new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(Math.round(n || 0));

const fmtNum = (n) =>
  new Intl.NumberFormat("es-CL", { maximumFractionDigits: 2 }).format(n || 0);

function loadCounts() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveCounts() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(counts));
  updateKPIs();
}

function getItemCount(itemCode) {
  return counts[itemCode] || { deposito: null, piso: null };
}

function setItemSectionQty(itemCode, section, val) {
  if (!counts[itemCode]) counts[itemCode] = { deposito: null, piso: null };
  if (val === "" || val === null || isNaN(val)) {
    counts[itemCode][section] = null;
  } else {
    counts[itemCode][section] = Math.max(0, parseFloat(val));
  }
  saveCounts();
}

function initCategories() {
  const select = document.getElementById("category-filter");
  const cats = [...new Set(MAESTRA_DPTO_94.map((i) => i.cat))].sort();
  cats.forEach((cat) => {
    const opt = document.createElement("option");
    opt.value = cat;
    opt.textContent = cat;
    select.appendChild(opt);
  });
}

function getFilteredItems() {
  const q = document.getElementById("search-input").value.trim().toLowerCase();
  const cat = document.getElementById("category-filter").value;
  const status = document.getElementById("status-filter").value;

  return MAESTRA_DPTO_94.filter((item) => {
    const matchQuery =
      !q ||
      item.desc.toLowerCase().includes(q) ||
      item.item.includes(q) ||
      item.upc.includes(q);
    if (!matchQuery) return false;

    if (cat !== "ALL" && item.cat !== cat) return false;

    const c = getItemCount(item.item);
    const hasCount = c.deposito !== null || c.piso !== null;
    const totalFisico = (c.deposito || 0) + (c.piso || 0);
    const diff = totalFisico - item.stockSistema;

    if (status === "PENDING" && hasCount) return false;
    if (status === "COUNTED" && !hasCount) return false;
    if (status === "DIFF" && (!hasCount || Math.abs(diff) < 0.001)) return false;

    return true;
  });
}

function renderList() {
  const listEl = document.getElementById("count-list");
  const summaryEl = document.getElementById("summary-view");
  const bannerEl = document.getElementById("section-banner");

  if (activeTab === "resumen") {
    listEl.classList.add("hidden");
    bannerEl.classList.add("hidden");
    summaryEl.classList.remove("hidden");
    renderSummary();
    return;
  }

  summaryEl.classList.add("hidden");
  listEl.classList.remove("hidden");
  bannerEl.classList.remove("hidden");

  if (activeTab === "deposito") {
    bannerEl.className = "section-banner banner-deposito";
    document.getElementById("section-banner-icon").textContent = "📦";
    document.getElementById("section-banner-text").innerHTML =
      "<strong>Modo Conteo: DEPÓSITO</strong> — Ingresa unidades o kilos en cámara y bodega.";
  } else {
    bannerEl.className = "section-banner banner-piso";
    document.getElementById("section-banner-icon").textContent = "🛒";
    document.getElementById("section-banner-text").innerHTML =
      "<strong>Modo Conteo: PISO DE VENTAS</strong> — Ingresa mercadería exhibida en góndolas/islas.";
  }

  const items = getFilteredItems();
  listEl.innerHTML = "";

  if (items.length === 0) {
    listEl.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:30px;color:#64748b;">No se encontraron ítems con esos filtros.</div>`;
    return;
  }

  items.forEach((item) => {
    const c = getItemCount(item.item);
    const currentVal = c[activeTab];
    const otherSection = activeTab === "deposito" ? "piso" : "deposito";
    const otherLabel = activeTab === "deposito" ? "Piso" : "Depósito";
    const otherVal = c[otherSection] || 0;
    const totalFisico = (c.deposito || 0) + (c.piso || 0);
    const isCounted = currentVal !== null;

    const card = document.createElement("article");
    card.className = `item-card ${isCounted ? "counted" : ""}`;
    card.innerHTML = `
      <div class="item-header">
        <div>
          <div class="item-title">${item.desc}</div>
          <div class="item-codes">ITEM: <strong>${item.item}</strong> · UPC: ${item.upc}</div>
          <span class="item-cat">${item.cat}</span>
        </div>
        <button class="calc-btn" data-calc="${item.item}" title="Calcular por cajas">
          📦 x${item.qtyCaja}
        </button>
      </div>

      <div class="item-metrics">
        <span>Sist: <strong>${fmtNum(item.stockSistema)}</strong></span>
        <span>Costo: <strong>${fmtCLP(item.costo)}</strong></span>
        <span>Total Fís: <strong>${fmtNum(totalFisico)}</strong></span>
      </div>

      <div class="count-controls">
        <button class="step-btn" data-step="-1" data-item="${item.item}">−</button>
        <input
          type="number"
          inputmode="decimal"
          step="any"
          class="qty-input"
          data-input="${item.item}"
          placeholder="0"
          value="${currentVal !== null ? currentVal : ""}"
        />
        <button class="step-btn" data-step="1" data-item="${item.item}">+</button>
      </div>

      <div class="item-footer">
        <span>En ${otherLabel}: <strong>${fmtNum(otherVal)}</strong></span>
        <span>Costo Contado: <strong>${fmtCLP(totalFisico * item.costo)}</strong></span>
      </div>
    `;
    listEl.appendChild(card);
  });
}

function renderSummary() {
  const tbody = document.getElementById("summary-tbody");
  const items = getFilteredItems();
  tbody.innerHTML = "";

  let totUnidSis = 0;
  let totUnidFis = 0;
  let totCostoDep = 0;
  let totCostoPiso = 0;

  MAESTRA_DPTO_94.forEach((item) => {
    const c = getItemCount(item.item);
    const dep = c.deposito || 0;
    const piso = c.piso || 0;
    totUnidSis += item.stockSistema;
    totUnidFis += dep + piso;
    totCostoDep += dep * item.costo;
    totCostoPiso += piso * item.costo;
  });

  document.getElementById("sum-unid-sis").textContent = fmtNum(totUnidSis);
  document.getElementById("sum-unid-fis").textContent = fmtNum(totUnidFis);
  document.getElementById("sum-costo-dep").textContent = fmtCLP(totCostoDep);
  document.getElementById("sum-costo-piso").textContent = fmtCLP(totCostoPiso);

  items.forEach((item) => {
    const c = getItemCount(item.item);
    const dep = c.deposito || 0;
    const piso = c.piso || 0;
    const totalFis = dep + piso;
    const diffUnid = totalFis - item.stockSistema;
    const diffCosto = diffUnid * item.costo;
    const diffClass = diffUnid < 0 ? "diff-neg" : diffUnid > 0 ? "diff-pos" : "";

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><strong>${item.desc}</strong><br><small style="color:#64748b">${item.item}</small></td>
      <td class="num">${fmtNum(dep)}</td>
      <td class="num">${fmtNum(piso)}</td>
      <td class="num"><strong>${fmtNum(totalFis)}</strong></td>
      <td class="num">${fmtNum(item.stockSistema)}</td>
      <td class="num ${diffClass}">${diffUnid > 0 ? "+" : ""}${fmtNum(diffUnid)}</td>
      <td class="num">${fmtCLP(item.costo)}</td>
      <td class="num ${diffClass}">${diffCosto > 0 ? "+" : ""}${fmtCLP(diffCosto)}</td>
    `;
    tbody.appendChild(tr);
  });
}

function updateKPIs() {
  let countedItems = 0;
  let depCounted = 0;
  let pisoCounted = 0;
  let costoSistema = 0;
  let costoContado = 0;

  MAESTRA_DPTO_94.forEach((item) => {
    const c = getItemCount(item.item);
    if (c.deposito !== null) depCounted++;
    if (c.piso !== null) pisoCounted++;
    if (c.deposito !== null || c.piso !== null) countedItems++;

    const totalFis = (c.deposito || 0) + (c.piso || 0);
    costoSistema += item.stockSistema * item.costo;
    costoContado += totalFis * item.costo;
  });

  const diffCosto = costoContado - costoSistema;

  document.getElementById("kpi-avance").textContent = `${countedItems} / ${MAESTRA_DPTO_94.length}`;
  document.getElementById("kpi-costo-sistema").textContent = fmtCLP(costoSistema);
  document.getElementById("kpi-costo-contado").textContent = fmtCLP(costoContado);

  const diffEl = document.getElementById("kpi-diff-costo");
  diffEl.textContent = `${diffCosto > 0 ? "+" : ""}${fmtCLP(diffCosto)}`;
  diffEl.className = `kpi-value ${diffCosto < 0 ? "kpi-negative" : diffCosto > 0 ? "kpi-positive" : ""}`;

  document.getElementById("badge-deposito").textContent = depCounted;
  document.getElementById("badge-piso").textContent = pisoCounted;
}

/* CALCULADORA POR CAJAS */
function openCalcModal(itemCode) {
  const item = MAESTRA_DPTO_94.find((i) => i.item === itemCode);
  if (!item) return;
  activeModalItem = item;

  document.getElementById("modal-item-title").textContent = item.desc;
  document.getElementById("modal-item-meta").textContent = `ITEM ${item.item} · Factor Maestra: ${item.qtyCaja} unid/caja`;
  document.getElementById("modal-section-name").textContent =
    activeTab === "deposito" ? "Depósito" : "Piso de Ventas";

  document.getElementById("calc-cajas").value = "";
  document.getElementById("calc-factor").value = item.qtyCaja;
  document.getElementById("calc-sueltas").value = "";
  updateCalcPreview();

  document.getElementById("calc-modal").classList.remove("hidden");
  document.getElementById("calc-cajas").focus();
}

function updateCalcPreview() {
  const cajas = parseFloat(document.getElementById("calc-cajas").value) || 0;
  const factor = parseFloat(document.getElementById("calc-factor").value) || 0;
  const sueltas = parseFloat(document.getElementById("calc-sueltas").value) || 0;
  const total = cajas * factor + sueltas;
  document.getElementById("calc-total-preview").textContent = fmtNum(total);
  return total;
}

function closeCalcModal() {
  document.getElementById("calc-modal").classList.add("hidden");
  activeModalItem = null;
}

/* EXPORTAR A EXCEL */
function exportToExcel() {
  const rows = MAESTRA_DPTO_94.map((item) => {
    const c = getItemCount(item.item);
    const dep = c.deposito || 0;
    const piso = c.piso || 0;
    const totalFis = dep + piso;
    const diffUnid = totalFis - item.stockSistema;

    return {
      "N° DPTO": 94,
      ITEM: Number(item.item),
      "UPC MAESTRA": item.upc,
      DESCRIPCION: item.desc,
      CATEGORIA: item.cat,
      "CONTEO DEPOSITO": dep,
      "CONTEO PISO VENTAS": piso,
      "TOTAL FISICO": totalFis,
      "STOCK SISTEMA": item.stockSistema,
      "DIFERENCIA UNIDADES": diffUnid,
      "COSTO UNITARIO": item.costo,
      "COSTO TOTAL SISTEMA": item.stockSistema * item.costo,
      "COSTO TOTAL FISICO": totalFis * item.costo,
      "DIFERENCIA COSTO ($)": diffUnid * item.costo,
    };
  });

  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Inventario_Dpto_94");

  const fecha = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `Inventario_Costo_Dpto94_L155_${fecha}.xlsx`);
  showToast("📥 Excel descargado correctamente");
}

function showToast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.remove("hidden");
  setTimeout(() => t.classList.add("hidden"), 2500);
}

/* EVENTOS */
document.addEventListener("DOMContentLoaded", () => {
  initCategories();
  updateKPIs();
  renderList();

  // Cambio de pestañas
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      activeTab = btn.dataset.tab;
      renderList();
    });
  });

  // Búsqueda y filtros
  const searchInput = document.getElementById("search-input");
  const clearBtn = document.getElementById("clear-search");

  searchInput.addEventListener("input", () => {
    clearBtn.classList.toggle("hidden", !searchInput.value);
    renderList();
  });

  clearBtn.addEventListener("click", () => {
    searchInput.value = "";
    clearBtn.classList.add("hidden");
    renderList();
  });

  document.getElementById("category-filter").addEventListener("change", renderList);
  document.getElementById("status-filter").addEventListener("change", renderList);

  // Delegación en tarjetas de conteo
  const countList = document.getElementById("count-list");

  countList.addEventListener("input", (e) => {
    if (e.target.matches(".qty-input")) {
      const itemCode = e.target.dataset.input;
      setItemSectionQty(itemCode, activeTab, e.target.value);
      const card = e.target.closest(".item-card");
      card.classList.toggle("counted", e.target.value !== "");
    }
  });

  countList.addEventListener("click", (e) => {
    const stepBtn = e.target.closest(".step-btn");
    if (stepBtn) {
      const itemCode = stepBtn.dataset.item;
      const delta = parseFloat(stepBtn.dataset.step);
      const current = getItemCount(itemCode)[activeTab] || 0;
      const next = Math.max(0, current + delta);
      setItemSectionQty(itemCode, activeTab, next);
      renderList();
      return;
    }

    const calcBtn = e.target.closest(".calc-btn");
    if (calcBtn) {
      openCalcModal(calcBtn.dataset.calc);
    }
  });

  // Modal calculadora
  ["calc-cajas", "calc-factor", "calc-sueltas"].forEach((id) => {
    document.getElementById(id).addEventListener("input", updateCalcPreview);
  });

  document.getElementById("close-modal").addEventListener("click", closeCalcModal);
  document.querySelector(".modal-backdrop").addEventListener("click", closeCalcModal);

  document.getElementById("btn-calc-replace").addEventListener("click", () => {
    if (!activeModalItem) return;
    const val = updateCalcPreview();
    setItemSectionQty(activeModalItem.item, activeTab, val);
    closeCalcModal();
    renderList();
    showToast("✅ Cantidad actualizada");
  });

  document.getElementById("btn-calc-add").addEventListener("click", () => {
    if (!activeModalItem) return;
    const addVal = updateCalcPreview();
    const current = getItemCount(activeModalItem.item)[activeTab] || 0;
    setItemSectionQty(activeModalItem.item, activeTab, current + addVal);
    closeCalcModal();
    renderList();
    showToast(`➕ Sumado +${fmtNum(addVal)}`);
  });

  // Exportar y Reiniciar
  document.getElementById("btn-export-excel").addEventListener("click", exportToExcel);

  document.getElementById("btn-reset").addEventListener("click", () => {
    if (confirm("¿Seguro que deseas borrar todo el conteo de Depósito y Piso de Ventas?")) {
      counts = {};
      saveCounts();
      renderList();
      showToast("🗑️ Conteo reiniciado");
    }
  });
});