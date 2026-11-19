(() => {
  const SUPABASE_URL = "https://fnhzcphwfedmhoigyyet.supabase.co";
  const SUPABASE_KEY = "sb_publishable_jos0Aj1lGdA_khgaiqXCTA___I4B6gL";
  const supabase = (window.supabase) ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY) : null;

  const state = {
    events: [],
    filtered: [],
    comuni: null,
    filters: { search: "", category: "", region: "", province: "", city: "", dateFrom: "", dateTo: "", sort: "date-asc" },
  };

  const els = {
    grid: document.getElementById("grid"),
    weekendGrid: document.getElementById("weekendGrid"),
    weekendEmpty: document.getElementById("weekendEmpty"),
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
    prolocoBtn: document.getElementById("prolocoBtn"),
    prolocoBtn2: document.getElementById("prolocoBtn2"),
    prolocoModal: document.getElementById("prolocoModal"),
    prolocoBody: document.getElementById("prolocoBody"),
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

  function weekendRange() {
    const now = new Date();
    const day = now.getDay();
    const sat = new Date(now);
    if (day === 0) sat.setDate(now.getDate() - 1);
    else if (day !== 6) sat.setDate(now.getDate() + (6 - day));
    sat.setHours(0,0,0,0);
    const sun = new Date(sat);
    sun.setDate(sat.getDate() + 1);
    sun.setHours(23,59,59,999);
    return { sat, sun };
  }

  function renderWeekend() {
    if (!els.weekendGrid) return;
    const { sat, sun } = weekendRange();
    const list = state.events.filter(e => {
      if (!e.startDate) return false;
      const d = new Date(e.startDate);
      return d >= sat && d <= sun;
    }).sort((a,b) => new Date(a.startDate) - new Date(b.startDate));
    els.weekendGrid.innerHTML = "";
    els.weekendEmpty.hidden = list.length !== 0;
    list.forEach((e, i) => {
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
            <span>📍 ${escapeHtml([e.location?.city, e.location?.province].filter(Boolean).join(", ") || "Luogo da confermare")}</span>
          </div>
          <div class="card-actions">
            <button class="btn btn-ghost" data-detail="${escapeHtml(e.id)}">Dettagli</button>
          </div>
        </div>`;
      els.weekendGrid.appendChild(card);
    });
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
  if (els.weekendGrid) {
    els.weekendGrid.addEventListener("click", e => {
      const btn = e.target.closest("[data-detail]");
      if (btn) openDetail(btn.getAttribute("data-detail"));
    });
  }
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

  // Cookie banner
  const cookieBanner = document.getElementById("cookieBanner");
  const cookieAccept = document.getElementById("cookieAccept");
  const cookieReject = document.getElementById("cookieReject");
  const consent = localStorage.getItem("cookieConsent");
  if (!consent && cookieBanner) cookieBanner.hidden = false;
  if (cookieAccept) cookieAccept.addEventListener("click", () => { localStorage.setItem("cookieConsent", "accepted"); if (cookieBanner) cookieBanner.hidden = true; });
  if (cookieReject) cookieReject.addEventListener("click", () => { localStorage.setItem("cookieConsent", "rejected"); if (cookieBanner) cookieBanner.hidden = true; });

  // Area Pro Loco
  async function renderProlocoModal() {
    if (!els.prolocoBody) return;
    if (!supabase) { els.prolocoBody.innerHTML = "<p>Supabase non disponibile.</p>"; return; }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      els.prolocoBody.innerHTML = `
        <h2>🏛️ Area Pro Loco</h2>
        <p>Accedi per inserire le sagre del tuo comune.</p>
        <div class="field" style="margin-bottom:10px;"><input type="email" id="plEmail" placeholder="Email" /></div>
        <div class="field" style="margin-bottom:10px;"><input type="password" id="plPassword" placeholder="Password" /></div>
        <div style="display:flex;gap:8px;">
          <button class="btn btn-primary" id="plLogin">Accedi</button>
          <button class="btn btn-ghost" id="plSignup">Registrati</button>
        </div>
        <label style="display:flex;align-items:center;gap:6px;margin-top:10px;font-size:0.85rem;color:var(--muted);">
          <input type="checkbox" id="plConsent" /> Ho letto e accetto la <a href="privacy.html" target="_blank">Privacy Policy</a>
        </label>
        <p id="plMsg" style="margin-top:10px;color:var(--muted);"></p>
      `;
      document.getElementById("plLogin").onclick = async () => {
        const email = document.getElementById("plEmail").value;
        const password = document.getElementById("plPassword").value;
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) document.getElementById("plMsg").textContent = "Errore: " + error.message;
        else { document.getElementById("plMsg").textContent = "Accesso effettuato!"; renderProlocoModal(); }
      };
      document.getElementById("plSignup").onclick = async () => {
        const consent = document.getElementById("plConsent")?.checked;
        if (!consent) { document.getElementById("plMsg").textContent = "Devi accettare la Privacy Policy."; return; }
        const email = document.getElementById("plEmail").value;
        const password = document.getElementById("plPassword").value;
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) document.getElementById("plMsg").textContent = "Errore: " + error.message;
        else document.getElementById("plMsg").textContent = "Registrazione completata. Controlla la email.";
      };
    } else {
      const { data: adminRow } = await supabase.from("admins").select("user_id").eq("user_id", user.id).maybeSingle();
      const isAdmin = !!adminRow;

      els.prolocoBody.innerHTML = `
        <h2>${isAdmin ? "Pannello Admin" : "Inserisci una sagra"}</h2>
        <p>Accesso: ${escapeHtml(user.email)} ${isAdmin ? '<span style="color:var(--primary);font-weight:700;">(Admin)</span>' : ""}</p>
        <div style="display:flex;gap:6px;margin-bottom:8px;">
          <input type="url" id="plExtractUrl" placeholder="Incolla link evento per estrarre dati" style="flex:1;padding:10px 12px;border:1px solid var(--border);border-radius:var(--radius-xs);background:var(--surface-solid);color:var(--text);" />
          <button class="btn btn-ghost" id="plExtract" type="button">Estrai</button>
        </div>
        <div class="field" style="margin-bottom:8px;"><input type="text" id="plTitle" placeholder="Titolo evento" /></div>
        <div class="field" style="margin-bottom:8px;"><textarea id="plDesc" placeholder="Descrizione" rows="3" style="flex:1;border:none;background:transparent;color:var(--text);outline:none;font-family:inherit;"></textarea></div>
        <div class="field" style="margin-bottom:8px;"><input type="datetime-local" id="plDate" /></div>
        <div class="field" style="margin-bottom:8px;"><input type="text" id="plCity" placeholder="Citta" /></div>
        <div class="field" style="margin-bottom:8px;"><input type="text" id="plProvince" placeholder="Provincia" /></div>
        <div class="field" style="margin-bottom:8px;"><input type="text" id="plRegion" placeholder="Regione (Lazio/Umbria)" /></div>
        <div class="field" style="margin-bottom:8px;"><input type="text" id="plCategory" placeholder="Categoria (es. Sagre & Enogastronomia)" /></div>
        <div class="field" style="margin-bottom:8px;"><input type="url" id="plImage" placeholder="URL immagine (opzionale)" /></div>
        <div class="field" style="margin-bottom:8px;"><input type="text" id="plSource" placeholder="Fonte (es. Pro Loco, Teatro, Admin)" value="${isAdmin ? "Admin" : "Pro Loco"}" /></div>
        <label style="display:flex;align-items:center;gap:6px;margin-top:10px;font-size:0.85rem;color:var(--muted);">
          <input type="checkbox" id="plConsentInsert" /> Confermo di avere il diritto di pubblicare questo contenuto e accetto la <a href="privacy.html" target="_blank">Privacy Policy</a>
        </label>
        <div style="display:flex;gap:8px;margin-top:10px;">
          <button class="btn btn-primary" id="plSubmit">Pubblica evento</button>
          <button class="btn btn-ghost" id="plLogout">Esci</button>
        </div>
        <p id="plMsg" style="margin-top:10px;color:var(--muted);"></p>
        ${isAdmin ? '<div id="adminList" style="margin-top:16px;"></div>' : ''}
        ${isAdmin ? `
        <div id="sourcesAdmin" style="margin-top:24px;padding-top:16px;border-top:1px solid var(--border);">
          <h3>Gestione fonti scraping</h3>
          <div id="sourcesList"></div>
          <div style="margin-top:12px;">
            <input type="text" id="srcName" placeholder="Nome fonte" style="width:100%;padding:8px;margin-bottom:6px;" />
            <select id="srcKind" style="width:100%;padding:8px;margin-bottom:6px;">
              <option value="rss">RSS (WordPress)</option>
              <option value="jsonld">JSON-LD</option>
              <option value="eventbrite">Eventbrite</option>
            </select>
            <input type="number" id="srcMaxPages" placeholder="Max pagine" value="1" style="width:100%;padding:8px;margin-bottom:6px;" />
            <textarea id="srcUrls" placeholder="URL (uno per riga)" rows="3" style="width:100%;padding:8px;margin-bottom:6px;"></textarea>
            <button class="btn btn-primary" id="srcAdd">Aggiungi fonte</button>
            <p id="srcMsg" style="margin-top:8px;color:var(--muted);font-size:0.85rem;"></p>
          </div>
        </div>` : ''}
      `;
      document.getElementById("plLogout").onclick = async () => {
        await supabase.auth.signOut();
        renderProlocoModal();
      };
      document.getElementById("plSubmit").onclick = async () => {
        const consent = document.getElementById("plConsentInsert")?.checked;
        if (!consent) { document.getElementById("plMsg").textContent = "Devi accettare la Privacy Policy."; return; }
        const title = document.getElementById("plTitle").value.trim();
        if (!title) { document.getElementById("plMsg").textContent = "Inserisci il titolo."; return; }
        const { error } = await supabase.from("events").insert({
          title,
          description: document.getElementById("plDesc").value.trim(),
          start_date: document.getElementById("plDate").value || null,
          city: document.getElementById("plCity").value.trim(),
          province: document.getElementById("plProvince").value.trim(),
          region: document.getElementById("plRegion").value.trim(),
          category: document.getElementById("plCategory").value.trim() || "Altro",
          image_url: document.getElementById("plImage").value.trim(),
          source: document.getElementById("plSource").value.trim() || (isAdmin ? "Admin" : "Pro Loco"),
          created_by: user.id
        });
        if (error) document.getElementById("plMsg").textContent = "Errore: " + error.message;
        else {
          document.getElementById("plMsg").textContent = "Evento pubblicato!";
          load();
        }
      };

      const extractBtn = document.getElementById("plExtract");
      if (extractBtn) {
        extractBtn.onclick = async () => {
          const url = document.getElementById("plExtractUrl").value.trim();
          if (!url) return;
          const msg = document.getElementById("plMsg");
          msg.textContent = "Estrazione in corso...";
          try {
            const proxy = "https://api.allorigins.win/get?url=" + encodeURIComponent(url);
            const res = await fetch(proxy);
            if (!res.ok) throw new Error("HTTP " + res.status);
            const data = await res.json();
            const html = data.contents || "";
            const doc = new DOMParser().parseFromString(html, "text/html");
            const getMeta = (prop) => {
              const el = doc.querySelector(`meta[property="${prop}"], meta[name="${prop}"]`);
              return el ? (el.getAttribute("content") || "") : "";
            };
            const title = getMeta("og:title") || (doc.querySelector("title")?.textContent || "").trim();
            const desc = getMeta("og:description") || getMeta("description");
            const img = getMeta("og:image");
            if (title) document.getElementById("plTitle").value = title;
            if (desc) document.getElementById("plDesc").value = desc;
            if (img) document.getElementById("plImage").value = img;
            msg.textContent = "Dati estratti. Verifica e pubblica.";
          } catch (err) {
            msg.textContent = "Estrazione fallita: " + err.message;
          }
        };
      }
      if (isAdmin) {
        const { data: evs } = await supabase.from("events").select("id,title,city,created_at").order("created_at", { ascending: false }).limit(10);
        const listEl = document.getElementById("adminList");
        if (listEl && evs) {
          listEl.innerHTML = "<h3>Ultimi eventi inseriti</h3>" + evs.map(e =>
            `<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--border);">
              <span>${escapeHtml(e.title)} <small style="color:var(--muted);">(${escapeHtml(e.city || "")})</small></span>
              <button class="btn btn-ghost" style="padding:4px 8px;font-size:0.8rem;" data-del="${e.id}">Elimina</button>
            </div>`
          ).join("");
          listEl.querySelectorAll("[data-del]").forEach(btn => {
            btn.onclick = async () => {
              const id = btn.getAttribute("data-del");
              const { error } = await supabase.from("events").delete().eq("id", id);
              if (error) alert("Errore: " + error.message);
              else { renderProlocoModal(); load(); }
            };
          });
        }

        // Gestione fonti
        async function loadSourcesAdmin() {
          const { data: srcs } = await supabase.from("sources").select("*").order("created_at", { ascending: true });
          const el = document.getElementById("sourcesList");
          if (!el) return;
          if (!srcs || !srcs.length) { el.innerHTML = "<p>Nessuna fonte.</p>"; return; }
          el.innerHTML = srcs.map(s =>
            `<div style="padding:8px 0;border-bottom:1px solid var(--border);">
              <strong>${escapeHtml(s.name)}</strong> <small style="color:var(--muted);">(${s.kind}, ${s.max_pages} pag)</small>
              ${s.active ? "" : ' <span style="color:#ef4444;">(disattiva)</span>'}
              <div style="font-size:0.8rem;color:var(--muted);margin-top:2px;">${(s.urls||[]).map(u=>escapeHtml(u)).join("<br/>")}</div>
              <div style="margin-top:4px;display:flex;gap:6px;">
                <button class="btn btn-ghost" style="padding:3px 8px;font-size:0.75rem;" data-toggle="${s.id}" data-active="${s.active}">${s.active ? "Disattiva" : "Attiva"}</button>
                <button class="btn btn-ghost" style="padding:3px 8px;font-size:0.75rem;" data-del-src="${s.id}">Elimina</button>
              </div>
            </div>`
          ).join("");
          el.querySelectorAll("[data-toggle]").forEach(btn => {
            btn.onclick = async () => {
              const id = btn.getAttribute("data-toggle");
              const active = btn.getAttribute("data-active") === "true";
              await supabase.from("sources").update({ active: !active }).eq("id", id);
              loadSourcesAdmin();
            };
          });
          el.querySelectorAll("[data-del-src]").forEach(btn => {
            btn.onclick = async () => {
              if (!confirm("Eliminare questa fonte?")) return;
              const id = btn.getAttribute("data-del-src");
              await supabase.from("sources").delete().eq("id", id);
              loadSourcesAdmin();
            };
          });
        }
        loadSourcesAdmin();

        const addBtn = document.getElementById("srcAdd");
        if (addBtn) {
          addBtn.onclick = async () => {
            const name = document.getElementById("srcName").value.trim();
            const kind = document.getElementById("srcKind").value;
            const maxPages = parseInt(document.getElementById("srcMaxPages").value) || 1;
            const urls = document.getElementById("srcUrls").value.split("\n").map(u=>u.trim()).filter(Boolean);
            const msg = document.getElementById("srcMsg");
            if (!name || !urls.length) { msg.textContent = "Inserisci nome e almeno un URL."; return; }
            const { error } = await supabase.from("sources").insert({ name, kind, max_pages: maxPages, urls });
            if (error) msg.textContent = "Errore: " + error.message;
            else {
              msg.textContent = "Fonte aggiunta!";
              document.getElementById("srcName").value = "";
              document.getElementById("srcUrls").value = "";
              loadSourcesAdmin();
            }
          };
        }
      }
    }
  }

  function openProloco() {
    if (els.prolocoModal) {
      els.prolocoModal.hidden = false;
      document.body.style.overflow = "hidden";
      renderProlocoModal();
    }
  }
  if (els.prolocoBtn) els.prolocoBtn.addEventListener("click", openProloco);
  if (els.prolocoBtn2) els.prolocoBtn2.addEventListener("click", openProloco);
  if (els.prolocoModal) {
    els.prolocoModal.addEventListener("click", e => {
      if (e.target.hasAttribute("data-close-proloco")) {
        els.prolocoModal.hidden = true;
        document.body.style.overflow = "";
      }
    });
  }

  // Google Custom Search
  const G_API_KEY = "__GOOGLE_API_KEY__";
  const G_CX = "__GOOGLE_CX__";

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
    container.innerHTML = items.map(it => {
      const thumb = (it.pagemap?.cse_thumbnail?.[0]?.src) || (it.pagemap?.cse_image?.[0]?.src) || "";
      const imgHtml = thumb ? `<img class="g-thumb" src="${escapeHtml(thumb)}" alt="" loading="lazy" />` : "";
      return `
      <div class="g-result">
        ${imgHtml}
        <div class="g-result-body">
          <a href="${escapeHtml(it.link)}" target="_blank" rel="noopener">${escapeHtml(it.title)}</a>
          <div class="snippet">${escapeHtml(it.snippet || "")}</div>
        </div>
      </div>`;
    }).join("");
  }

  els.gQuery = document.getElementById("gQuery");
  els.gSearchBtn = document.getElementById("gSearchBtn");
  els.gResults = document.getElementById("gResults");
  els.gSearchBtn.addEventListener("click", googleSearch);
  els.gQuery.addEventListener("keydown", e => { if (e.key === "Enter") googleSearch(); });

  // load data
  function mapSupabaseEvent(row) {
    return {
      id: row.id,
      title: row.title,
      description: row.description || "",
      startDate: row.start_date,
      endDate: row.end_date,
      location: {
        name: "",
        address: row.city || "",
        city: row.city || "",
        region: row.region || "",
        province: row.province || row.city || ""
      },
      category: row.category || "Altro",
      image: row.image_url || "",
      url: "#",
      source: row.source || "Pro Loco"
    };
  }

  // Sfondo hero dinamico
  function setHeroBg() {
    const images = [
      "https://images.unsplash.com/photo-1529260830199-42c24126f269?auto=format&fit=crop&w=1600&q=80",
      "https://images.unsplash.com/photo-1523906834658-6e24ef2386f9?auto=format&fit=crop&w=1600&q=80",
      "https://images.unsplash.com/photo-1534308983496-4fabb1a015ee?auto=format&fit=crop&w=1600&q=80",
      "https://images.unsplash.com/photo-1515542622106-78bda8ba0e5b?auto=format&fit=crop&w=1600&q=80",
      "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?auto=format&fit=crop&w=1600&q=80"
    ];
    const now = new Date();
    const start = new Date(now.getFullYear(), 0, 0);
    const diff = now - start;
    const day = Math.floor(diff / (1000 * 60 * 60 * 24));
    const img = images[day % images.length];
    const el = document.getElementById("heroBg");
    if (el) el.style.backgroundImage = "url('" + img + "')";
  }
  setHeroBg();

  async function load() {
    try {
      const [res, resComuni] = await Promise.all([
        fetch("data/events.json", { cache: "no-store" }),
        fetch("data/comuni.json", { cache: "no-store" })
      ]);
      if (resComuni.ok) state.comuni = await resComuni.json();

      // Prova a caricare eventi da Supabase
      let loaded = false;
      if (supabase) {
        try {
          const { data: sbData, error } = await supabase.from("events").select("*").order("start_date", { ascending: true });
          if (!error && sbData && sbData.length) {
            state.events = sbData.map(mapSupabaseEvent);
            loaded = true;
          }
        } catch (e) { console.warn("Supabase load failed", e); }
      }
      if (!loaded) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        const data = await res.json();
        state.events = Array.isArray(data.events) ? data.events : [];
        els.updated.textContent = data.updated ? new Date(data.updated).toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" }) : "-";
      } else {
        els.updated.textContent = new Date().toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" });
      }
      populateFilters();
      cascadedOptions();
      applyFilters();
      renderWeekend();
  
    } catch (err) {
      els.loading.innerHTML = `<div class="empty"><div class="empty-illustration">⚠️</div><h3>Impossibile caricare gli eventi</h3><p>${escapeHtml(err.message)}</p></div>`;
      console.error(err);
    }
  }
  load();
})();
