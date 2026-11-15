(() => {
  const state = {
    events: [],
    filtered: [],
    comuni: null,
    filters: { search: "", category: "", region: "", province: "", city: "", dateFrom: "", dateTo: "", sort: "date-asc" },
  };

  const els = {
    grid: document.getElementById("grid"),
    loading: document.getElementById("loading"),
    empty: document.getElementById("empty"),
    count: document.getElementById("countEvents"),
    countRegions: document.getElementById("countRegions"),
    updated: document.getElementById("updatedAt"),
    search: document.getElementById("search"),
    category: document.getElementById("category"),
    region: document.getElementById("region"),
    city: document.getElementById("city"),
    province: document.getElementById("province"),
    dateFrom: document.getElementById("dateFrom"),
    dateTo: document.getElementById("dateTo"),
    sort: document.getElementById("sort"),
    reset: document.getElementById("resetFilters"),
    modal: document.getElementById("modal"),
    modalBody: document.getElementById("modalBody"),
    themeToggle: document.getElementById("themeToggle"),
    scrollTop: document.getElementById("scrollTop"),
    gQuery: null,
    gSearchBtn: null,
    gResults: null,
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
      "Eventi & Cultura": "✨",
      "Cinema & Media": "🎬",
    };
    return map[cat] || "📅";
  }

  function badgeColor(cat) {
    const map = {
      "Sagre & Enogastronomia": "#f97316",
      "Arte & Cultura": "#8b5cf6",
      "Musica": "#ec4899",
      "Sport": "#10b981",
      "Comunita' & Tradizioni": "#0ea5e9",
      "Eventi & Cultura": "#4f46e5",
      "Cinema & Media": "#f59e0b",
    };
    return map[cat] || "#4f46e5";
  }

  // mappe per filtri a cascata
  const regionOf = (prov) => {
    const ev = state.events.find(e => e.location?.province === prov);
    return ev ? ev.location?.region : "";
  };
  const provinceOfCity = (city) => {
    const ev = state.events.find(e => e.location?.city === city);
    return ev ? ev.location?.province : "";
  };

  function fillSelect(sel, values, placeholder) {
    const cur = sel.value;
    sel.innerHTML = "";
    const ph = document.createElement("option");
    ph.value = ""; ph.textContent = placeholder;
    sel.appendChild(ph);
    values.forEach(v => {
      const o = document.createElement("option");
      o.value = v; o.textContent = v;
      sel.appendChild(o);
    });
    if (values.includes(cur)) sel.value = cur;
  }

  function regionOfProvince(prov) {
    if (!state.comuni) return "";
    for (const r of state.comuni.region) {
      if (state.comuni.province[r].includes(prov)) return r;
    }
    return "";
  }

  function populateFilters() {
    const cats = [...new Set(state.events.map(e => e.category).filter(Boolean))].sort();
    const regions = state.comuni ? state.comuni.regioni : [...new Set(state.events.map(e => e.location?.region).filter(Boolean))].sort();

    fillSelect(els.category, cats, "Tutte le categorie");
    fillSelect(els.region, regions, "Tutte le regioni");
    fillSelect(els.province, [], "Tutte le province");
    fillSelect(els.city, [], "Tutte le città");

    els.countRegions.textContent = regions.length;
  }

  function cascadedOptions() {
    if (!state.comuni) return;
    // province per regione
    let provinces = [];
    if (state.filters.region) {
      provinces = state.comuni.province[state.filters.region] || [];
    } else {
      provinces = Object.keys(state.comuni.comuni).sort((a,b)=>a.localeCompare(b,"it"));
    }
    fillSelect(els.province, provinces, "Tutte le province");

    // città per provincia
    let cities = [];
    if (state.filters.province && state.comuni.comuni[state.filters.province]) {
      cities = state.comuni.comuni[state.filters.province];
    } else if (state.filters.region) {
      // tutte le città della regione
      const provs = state.comuni.province[state.filters.region] || [];
      provs.forEach(p => { if (state.comuni.comuni[p]) cities = cities.concat(state.comuni.comuni[p]); });
      cities = [...new Set(cities)].sort((a,b)=>a.localeCompare(b,"it"));
    }
    fillSelect(els.city, cities, "Tutte le città");
  }

  function applyFilters() {
    const f = state.filters;
    let list = state.events.filter(e => {
      const blob = [e.title, e.description, e.location?.city, e.location?.region, e.location?.address, e.category]
        .join(" ").toLowerCase();
      if (f.search && !blob.includes(f.search.toLowerCase())) return false;
      if (f.category && e.category !== f.category) return false;
      if (f.region && e.location?.region !== f.region) return false;
      if (f.province && e.location?.province !== f.province) return false;
      if (f.city && e.location?.city !== f.city) return false;
      const d = e.startDate ? new Date(e.startDate) : null;
      if (f.dateFrom && d && d < new Date(f.dateFrom)) return false;
      if (f.dateTo && d && d > new Date(f.dateTo + "T23:59:59")) return false;
      return true;
    });
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
    els.count.textContent = state.filtered.length;

    state.filtered.forEach((e, i) => {
      const card = document.createElement("article");
      card.className = "card";
      card.style.animationDelay = (i % 12) * 0.04 + "s";
      const color = badgeColor(e.category);
      const imgHtml = e.image
        ? `<div class="card-img"><img src="${escapeHtml(e.image)}" alt="" loading="lazy" onerror="this.parentElement.innerHTML='<span class=img-fallback>${placeholderEmoji(e.category)}</span>'" /></div>`
        : `<div class="card-img"><span class="img-fallback">${placeholderEmoji(e.category)}</span></div>`;
      card.innerHTML = `
        ${imgHtml}
        <span class="card-badge" style="color:${color}">${escapeHtml(e.category || "Evento")}</span>
        <div class="card-body">
          <h3 class="card-title">${escapeHtml(e.title)}</h3>
          <div class="card-meta">
            <span>📅 ${escapeHtml(formatDate(e.startDate))}</span>
            <span>📍 ${escapeHtml([e.location?.city, e.location?.region].filter(Boolean).join(", ") || e.location?.address || "Luogo da confermare")}</span>
          </div>
          <div class="card-actions">
            <button class="btn btn-ghost" data-detail="${escapeHtml(e.id)}">Dettagli</button>
          </div>
        </div>`;
      els.grid.appendChild(card);
    });
  }

  function openDetail(id) {
    const e = state.events.find(x => x.id === id);
    if (!e) return;
    const color = badgeColor(e.category);
    const imgHtml = e.image
      ? `<div class="modal-img"><img src="${escapeHtml(e.image)}" alt="" onerror="this.parentElement.innerHTML='${placeholderEmoji(e.category)}'" /></div>`
      : `<div class="modal-img">${placeholderEmoji(e.category)}</div>`;
    els.modalBody.innerHTML = `
      ${imgHtml}
      <h2>${escapeHtml(e.title)}</h2>
      <div class="meta">
        <div>📅 ${escapeHtml(formatDate(e.startDate))}${e.endDate ? " → " + escapeHtml(formatDate(e.endDate)) : ""}</div>
        <div>📍 ${escapeHtml([e.location?.name, e.location?.address, e.location?.city, e.location?.region].filter(Boolean).join(" · ") || "Luogo da confermare")}</div>
        <div>🏷️ <span style="color:${color};font-weight:600">${escapeHtml(e.category || "Evento")}</span> · Fonte: ${escapeHtml(e.source || "-")}</div>
      </div>
      ${e.description ? `<p class="desc">${escapeHtml(e.description)}</p>` : ""}
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
  els.region.addEventListener("change", e => {
    state.filters.region = e.target.value;
    state.filters.province = "";
    state.filters.city = "";
    cascadedOptions();
    applyFilters();
  });
  els.province.addEventListener("change", e => {
    state.filters.province = e.target.value;
    state.filters.city = "";
    cascadedOptions();
    applyFilters();

  });
  els.city.addEventListener("change", e => {
    state.filters.city = e.target.value;
    applyFilters();

  });

  els.dateFrom.addEventListener("change", e => { state.filters.dateFrom = e.target.value; applyFilters(); });
  els.dateTo.addEventListener("change", e => { state.filters.dateTo = e.target.value; applyFilters(); });
  els.sort.addEventListener("change", e => { state.filters.sort = e.target.value; applyFilters(); });
  els.reset.addEventListener("click", () => {
    state.filters = { search: "", category: "", region: "", province: "", city: "", dateFrom: "", dateTo: "", sort: "date-asc" };
    els.search.value = "";
    els.category.value = "";
    els.region.value = "";
    els.province.value = "";
    els.city.value = "";
    cascadedOptions();
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
  els.themeToggle.querySelector(".theme-icon").textContent = savedTheme === "dark" ? "☀️" : "🌙";
  els.themeToggle.addEventListener("click", () => {
    const cur = document.documentElement.getAttribute("data-theme");
    const next = cur === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("theme", next);
    els.themeToggle.querySelector(".theme-icon").textContent = next === "dark" ? "☀️" : "🌙";
  });

  // scroll top
  window.addEventListener("scroll", () => {
    els.scrollTop.classList.toggle("show", window.scrollY > 400);
  });
  els.scrollTop.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));

  // Google Custom Search
  const G_API_KEY = "AIzaSyBzatinKBAVTH0zrYEjVsLuU8lUS4rShSc";
  const G_CX = "94c5f550c6c6449ac";

  function cacheKey(q) { return "gsearch:" + q.toLowerCase().trim(); }
  function getCached(q) {
    try {
      const raw = localStorage.getItem(cacheKey(q));
      if (!raw) return null;
      const obj = JSON.parse(raw);
      if (Date.now() - obj.ts > 24 * 60 * 60 * 1000) { localStorage.removeItem(cacheKey(q)); return null; }
      return obj.data;
    } catch { return null; }
  }
  function setCached(q, data) {
    try { localStorage.setItem(cacheKey(q), JSON.stringify({ ts: Date.now(), data })); } catch {}
  }

  async function googleSearch() {
    const q = (els.gQuery.value || "").trim();
    if (!q) return;
    const container = els.gResults;
    container.innerHTML = '<div class="g-loading">Ricerca in corso...</div>';
    const cached = getCached(q);
    if (cached) { renderGoogleResults(cached); return; }
    try {
      const url = `https://www.googleapis.com/customsearch/v1?key=${encodeURIComponent(G_API_KEY)}&cx=${encodeURIComponent(G_CX)}&q=${encodeURIComponent(q)}&num=8`;
      const res = await fetch(url);
      if (!res.ok) throw new Error("HTTP " + res.status);
      const data = await res.json();
      const items = data.items || [];
      setCached(q, items);
      renderGoogleResults(items);
    } catch (err) {
      container.innerHTML = `<div class="g-loading">Errore ricerca: ${escapeHtml(err.message)}</div>`;
    }
  }
  function renderGoogleResults(items) {
    const container = els.gResults;
    if (!items.length) { container.innerHTML = '<div class="g-loading">Nessun risultato.</div>'; return; }
    container.innerHTML = items.map(it => `
      <div class="g-result">
        <a href="${escapeHtml(it.link)}" target="_blank" rel="noopener">${escapeHtml(it.title)}</a>
        <div class="snippet">${escapeHtml(it.snippet || "")}</div>
      </div>
    `).join("");
  }

  els.gQuery = document.getElementById("gQuery");
  els.gSearchBtn = document.getElementById("gSearchBtn");
  els.gResults = document.getElementById("gResults");
  els.gSearchBtn.addEventListener("click", googleSearch);
  els.gQuery.addEventListener("keydown", e => { if (e.key === "Enter") googleSearch(); });

  // load data
  async function load() {
    try {
      const [res, resComuni] = await Promise.all([
        fetch("data/events.json", { cache: "no-store" }),
        fetch("data/comuni.json", { cache: "no-store" })
      ]);
      if (!res.ok) throw new Error("HTTP " + res.status);
      const data = await res.json();
      state.events = Array.isArray(data.events) ? data.events : [];
      if (resComuni.ok) state.comuni = await resComuni.json();
      els.updated.textContent = data.updated ? new Date(data.updated).toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" }) : "-";
      populateFilters();
      cascadedOptions();
      applyFilters();
  
    } catch (err) {
      els.loading.innerHTML = `<div class="empty"><div class="empty-illustration">⚠️</div><h3>Impossibile caricare gli eventi</h3><p>${escapeHtml(err.message)}</p></div>`;
      console.error(err);
    }
  }
  load();
})();
