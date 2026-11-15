(() => {
  const state = {
    events: [],
    filtered: [],
    filters: { search: "", category: "", region: "", dateFrom: "", dateTo: "", sort: "date-asc" },
  };

  const els = {
    grid: document.getElementById("grid"),
    loading: document.getElementById("loading"),
    empty: document.getElementById("empty"),
    count: document.getElementById("countEvents"),
    updated: document.getElementById("updatedAt"),
    search: document.getElementById("search"),
    category: document.getElementById("category"),
    region: document.getElementById("region"),
    dateFrom: document.getElementById("dateFrom"),
    dateTo: document.getElementById("dateTo"),
    sort: document.getElementById("sort"),
    reset: document.getElementById("resetFilters"),
    modal: document.getElementById("modal"),
    modalBody: document.getElementById("modalBody"),
    themeToggle: document.getElementById("themeToggle"),
  };

  function escapeHtml(s) {
    return String(s ?? "").replace(/[&<>"']/g, c => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
  }

  function formatDate(iso) {
    if (!iso) return "Data da confermare";
    const d = new Date(iso);
    if (isNaN(d)) return String(iso);
    return d.toLocaleString("it-IT", {
      weekday: "short", day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit"
    });
  }

  function placeholderEmoji(cat) {
    const map = {
      "Sagre & Enogastronomia": "🍷",
      "Arte & Cultura": "🎨",
      "Musica": "🎵",
      "Sport": "⚽",
      "Comunita' & Tradizioni": "🏛️",
    };
    return map[cat] || "📅";
  }

  function populateFilters() {
    const cats = [...new Set(state.events.map(e => e.category).filter(Boolean))].sort();
    const regions = [...new Set(state.events.map(e => e.location?.region).filter(Boolean))].sort();
    cats.forEach(c => {
      const o = document.createElement("option");
      o.value = c; o.textContent = c;
      els.category.appendChild(o);
    });
    regions.forEach(r => {
      const o = document.createElement("option");
      o.value = r; o.textContent = r;
      els.region.appendChild(o);
    });
  }

  function applyFilters() {
    const f = state.filters;
    let list = state.events.filter(e => {
      const blob = [e.title, e.description, e.location?.city, e.location?.region, e.location?.address, e.category]
        .join(" ").toLowerCase();
      if (f.search && !blob.includes(f.search.toLowerCase())) return false;
      if (f.category && e.category !== f.category) return false;
      if (f.region && e.location?.region !== f.region) return false;
      const d = e.startDate ? new Date(e.startDate) : null;
      if (f.dateFrom && d && d < new Date(f.dateFrom)) return false;
      if (f.dateTo && d && d > new Date(f.dateTo + "T23:59:59")) return false;
      return true;
    });
    // sort
    list.sort((a, b) => {
      if (f.sort === "title") return String(a.title).localeCompare(String(b.title), "it");
      const da = a.startDate ? new Date(a.startDate).getTime() : Infinity;
      const db = b.startDate ? new Date(b.startDate).getTime() : Infinity;
      return f.sort === "date-desc" ? db - da : da - db;
    });
    state.filtered = list;
    render();
  }

  function render() {
    els.grid.innerHTML = "";
    els.loading.hidden = true;
    els.empty.hidden = state.filtered.length !== 0;
    state.filtered.forEach(e => {
      const card = document.createElement("article");
      card.className = "card";
      const imgHtml = e.image
        ? `<div class="card-img"><img src="${escapeHtml(e.image)}" alt="" loading="lazy" onerror="this.parentElement.innerHTML='${placeholderEmoji(e.category)}'" /></div>`
        : `<div class="card-img">${placeholderEmoji(e.category)}</div>`;
      card.innerHTML = `
        ${imgHtml}
        <div class="card-body">
          <span class="badge">${escapeHtml(e.category || "Evento")}</span>
          <h3 class="card-title">${escapeHtml(e.title)}</h3>
          <div class="card-meta">
            <span>📅 ${escapeHtml(formatDate(e.startDate))}</span>
            <span>📍 ${escapeHtml([e.location?.city, e.location?.region].filter(Boolean).join(", ") || e.location?.address || "Luogo da confermare")}</span>
            ${e.source ? `<span>🔗 ${escapeHtml(e.source)}</span>` : ""}
          </div>
          <div class="card-actions">
            <button class="btn-link secondary" data-detail="${escapeHtml(e.id)}">Dettagli</button>
            ${e.url && e.url !== "#" ? `<a class="btn-link" href="${escapeHtml(e.url)}" target="_blank" rel="noopener">Vai al sito</a>` : ""}
          </div>
        </div>`;
      els.grid.appendChild(card);
    });
    els.count.textContent = state.filtered.length;
  }

  function openDetail(id) {
    const e = state.events.find(x => x.id === id);
    if (!e) return;
    const imgHtml = e.image
      ? `<div class="modal-img"><img src="${escapeHtml(e.image)}" alt="" onerror="this.parentElement.innerHTML='${placeholderEmoji(e.category)}'" /></div>`
      : `<div class="modal-img">${placeholderEmoji(e.category)}</div>`;
    els.modalBody.innerHTML = `
      ${imgHtml}
      <h2>${escapeHtml(e.title)}</h2>
      <div class="meta">
        <div>📅 ${escapeHtml(formatDate(e.startDate))}${e.endDate ? " → " + escapeHtml(formatDate(e.endDate)) : ""}</div>
        <div>📍 ${escapeHtml([e.location?.name, e.location?.address, e.location?.city, e.location?.region].filter(Boolean).join(" - ") || "Luogo da confermare")}</div>
        <div>🏷️ ${escapeHtml(e.category || "Evento")} · Fonte: ${escapeHtml(e.source || "-")}</div>
      </div>
      ${e.description ? `<p class="desc">${escapeHtml(e.description)}</p>` : ""}
      ${e.url && e.url !== "#" ? `<p><a class="btn-link" href="${escapeHtml(e.url)}" target="_blank" rel="noopener">Apri pagina ufficiale</a></p>` : ""}
    `;
    els.modal.hidden = false;
    document.body.style.overflow = "hidden";
  }

  function closeModal() {
    els.modal.hidden = true;
    document.body.style.overflow = "";
  }

  // events
  els.search.addEventListener("input", e => { state.filters.search = e.target.value; applyFilters(); });
  els.category.addEventListener("change", e => { state.filters.category = e.target.value; applyFilters(); });
  els.region.addEventListener("change", e => { state.filters.region = e.target.value; applyFilters(); });
  els.dateFrom.addEventListener("change", e => { state.filters.dateFrom = e.target.value; applyFilters(); });
  els.dateTo.addEventListener("change", e => { state.filters.dateTo = e.target.value; applyFilters(); });
  els.sort.addEventListener("change", e => { state.filters.sort = e.target.value; applyFilters(); });
  els.reset.addEventListener("click", () => {
    state.filters = { search: "", category: "", region: "", dateFrom: "", dateTo: "", sort: "date-asc" };
    els.search.value = "";
    els.category.value = "";
    els.region.value = "";
    els.dateFrom.value = "";
    els.dateTo.value = "";
    els.sort.value = "date-asc";
    applyFilters();
  });

  els.grid.addEventListener("click", e => {
    const btn = e.target.closest("[data-detail]");
    if (btn) openDetail(btn.getAttribute("data-detail"));
  });
  els.modal.addEventListener("click", e => {
    if (e.target.hasAttribute("data-close")) closeModal();
  });
  document.addEventListener("keydown", e => { if (e.key === "Escape") closeModal(); });

  // theme
  const savedTheme = localStorage.getItem("theme") || "light";
  document.documentElement.setAttribute("data-theme", savedTheme);
  els.themeToggle.textContent = savedTheme === "dark" ? "☀️" : "🌙";
  els.themeToggle.addEventListener("click", () => {
    const cur = document.documentElement.getAttribute("data-theme");
    const next = cur === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("theme", next);
    els.themeToggle.textContent = next === "dark" ? "☀️" : "🌙";
  });

  // load data
  async function load() {
    try {
      const res = await fetch("data/events.json", { cache: "no-store" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const data = await res.json();
      state.events = Array.isArray(data.events) ? data.events : [];
      els.updated.textContent = data.updated ? new Date(data.updated).toLocaleString("it-IT") : "-";
      populateFilters();
      applyFilters();
    } catch (err) {
      els.loading.textContent = "Impossibile caricare gli eventi: " + err.message;
      console.error(err);
    }
  }
  load();
})();
