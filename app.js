const STORAGE_KEY = "cotizafacil.v1";
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const icons = { "Plomería": "⌁", "Electricidad": "ϟ", "Refrigeración": "❄", "Reparaciones del hogar": "⌂", "Pintura": "◩", "Otro oficio": "✳" };
let state = loadState();
let selectedFilter = "Todos";
let activeJobId = null;
let activeQuoteId = null;
let toastTimer;

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && Array.isArray(saved.jobs)) return { jobs: saved.jobs, profile: saved.profile || null, accounts: Array.isArray(saved.accounts) ? saved.accounts : [], featureAccess: saved.featureAccess || {} };
    return { jobs: [], profile: null, accounts: [], featureAccess: {} };
  } catch { return { jobs: [], profile: null, accounts: [], featureAccess: {} }; }
}
function saveState() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
function money(amount) { return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(Number(amount) || 0); }
function esc(value = "") { return String(value).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]); }
function dateLabel(value) { if (!value) return "Por definir"; return new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short" }).format(new Date(`${value}T12:00:00`)); }
function showToast(message) { const toast = $("#toast"); toast.textContent = message; toast.classList.add("show"); clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.remove("show"), 2500); }
function dialog(id, open = true) { const el = document.getElementById(id); if (!el) return; open ? el.showModal() : el.close(); }
function makeId() { return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`; }
function activeQuotes(job) { return job.quotes.filter(q => q.status !== "retirada"); }
function quoteLabel(job) { const count = activeQuotes(job).length; return `${count} ${count === 1 ? "alternativa" : "alternativas"}`; }
function greeting(name = "maestro") {
  const hour = new Date().getHours();
  const salutation = hour < 12 ? "Buenos días" : hour < 19 ? "Buenas tardes" : "Buenas noches";
  return `${salutation}, <span>${esc(name)}.</span>`;
}
function renderProfile() {
  const profile = state.profile;
  $("#welcome-title").innerHTML = greeting(profile?.name || "maestro");
  $("#profile-name").textContent = profile?.business || profile?.name || "Tu taller";
  $("#profile-avatar").textContent = (profile?.name || "T").trim().charAt(0).toLocaleUpperCase("es-CO");
  $("#top-avatar").textContent = (profile?.name || "T").trim().charAt(0).toLocaleUpperCase("es-CO");
}

function render() {
  const jobs = state.jobs;
  const active = jobs.filter(j => j.status === "En proceso").length;
  const pending = jobs.filter(j => j.status === "Por cotizar").length;
  const sent = jobs.reduce((n, j) => n + j.quotes.filter(q => q.status === "enviada").length, 0);
  const follow = jobs.reduce((n, j) => n + j.quotes.filter(q => q.status === "enviada").length, 0);
  $("#active-value").textContent = active;
  $("#quotes-value").textContent = sent;
  $("#follow-value").textContent = follow;
  $("#nav-count").textContent = jobs.length;
  $("#job-count").textContent = `${jobs.length} ${jobs.length === 1 ? "en total" : "en total"}`;
  $("#filter-all").textContent = jobs.length;
  $("#filter-active").textContent = active;
  $("#filter-pending").textContent = pending;
  $("#filter-done").textContent = jobs.filter(j => j.status === "Finalizado").length;
  renderProfile();
  const query = $("#search").value.trim().toLowerCase();
  const visible = jobs.filter(j => (selectedFilter === "Todos" || j.status === selectedFilter) && (!query || `${j.title} ${j.client} ${j.trade}`.toLowerCase().includes(query)));
  $("#empty-state").hidden = jobs.length !== 0;
  $("#job-list").innerHTML = visible.map(job => {
    const statusClass = job.status === "Por cotizar" ? "pending" : job.status === "Finalizado" ? "done" : "";
    const quote = activeQuotes(job)[0];
    return `<article class="job-row" data-id="${esc(job.id)}"><div class="job-main"><div class="job-symbol">${icons[job.trade] || "✳"}</div><div class="job-main-text"><strong>${esc(job.title)}</strong><span>${esc(job.client)} · ${esc(job.trade)}</span></div></div><div class="job-detail"><strong>${quote ? esc(money(quote.price)) : "Sin cotizar"}</strong><span>${esc(quoteLabel(job))}</span></div><div class="job-detail"><strong>${esc(dateLabel(job.startDate))}</strong><span>${esc(job.duration)} ${esc(job.durationUnit)} estimados</span></div><span class="job-status ${statusClass}">${job.status === "En proceso" ? "● " : job.status === "Finalizado" ? "✓ " : "○ "}${esc(job.status)}</span><div class="row-actions"><button class="small-action" data-action="quotes" data-id="${esc(job.id)}">Cotizar →</button><button class="small-action more" data-action="share" data-id="${esc(job.id)}" aria-label="Compartir cotización">↗</button></div></article>`;
  }).join("");
  $$(".filter-chip").forEach(button => button.classList.toggle("selected", button.dataset.filter === selectedFilter));
}

function openJobDialog() { $("#job-form").reset(); $("#job-form [name=duration]").value = 1; dialog("job-dialog"); }
function beginQuote(job) {
  activeJobId = job.id;
  $("#quote-heading").textContent = "Tu propuesta.";
  $("#quote-subheading").textContent = "Arma una o varias opciones para que tu cliente elija.";
  $("#quote-context").innerHTML = `<strong>${esc(job.title)}</strong> · ${esc(job.client)} · ${esc(job.duration)} ${esc(job.durationUnit)} estimados`;
  const options = activeQuotes(job);
  $("#quote-options").innerHTML = "";
  (options.length ? options : [{ id: makeId(), name: "Opción estándar", description: "", price: "", days: Number(job.duration) || 1, status: "borrador" }]).forEach(addQuoteOption);
  dialog("quote-dialog");
}
function addQuoteOption(quote = {}) {
  const index = $$(".quote-option", $("#quote-options")).length + 1;
  const el = document.createElement("div");
  el.className = "quote-option";
  el.dataset.quoteId = quote.id || makeId();
  el.innerHTML = `<button type="button" class="option-remove" aria-label="Quitar alternativa">×</button><label class="option-name-field"><span>Nombre de la alternativa</span><input name="optionName" maxlength="45" value="${esc(quote.name || `Opción ${index}`)}" required placeholder="Ej. Reparación básica" /></label><label><span>Valor total (COP)</span><div class="money-input"><input name="price" type="number" min="0" step="1000" value="${esc(quote.price ?? "")}" required placeholder="0" /></div></label><label><span>Días de trabajo</span><input name="days" type="number" min="1" value="${esc(quote.days || 1)}" required /></label><label class="option-description"><span>¿Qué incluye esta opción?</span><textarea name="description" maxlength="180" placeholder="Materiales, alcance o condiciones">${esc(quote.description || "")}</textarea></label>`;
  el.querySelector(".option-remove").addEventListener("click", () => { if ($$(".quote-option", $("#quote-options")).length === 1) { showToast("Deja al menos una alternativa."); return; } el.remove(); });
  $("#quote-options").append(el);
}
function saveQuotes(event) {
  event.preventDefault();
  const job = state.jobs.find(j => j.id === activeJobId); if (!job) return;
  const retainedSent = job.quotes.filter(q => q.status === "enviada");
  const drafts = $$(".quote-option", $("#quote-options")).map(el => ({ id: el.dataset.quoteId, name: el.querySelector('[name="optionName"]').value.trim(), price: Number(el.querySelector('[name="price"]').value), days: Number(el.querySelector('[name="days"]').value), description: el.querySelector('[name="description"]').value.trim(), status: "borrador" }));
  job.quotes = [...retainedSent, ...drafts];
  job.status = job.quotes.some(q => q.status === "enviada") ? job.status === "Por cotizar" ? "En proceso" : job.status : "Por cotizar";
  saveState(); render(); dialog("quote-dialog", false); showToast("Cotizaciones guardadas.");
}
function openShare(job) {
  const available = activeQuotes(job);
  if (!available.length) { beginQuote(job); return; }
  const sent = available.filter(q => q.status === "enviada");
  const choice = sent.length ? sent[0] : available[0];
  activeJobId = job.id; activeQuoteId = choice.id;
  $("#share-preview").innerHTML = `<strong>${esc(job.title)} · ${esc(choice.name)}</strong><p>Hola ${esc(job.client)}, te comparto la cotización para ${esc(job.title.toLowerCase())}. ${esc(choice.description || "Quedo atento(a) si tienes preguntas.")}</p><p class="preview-price">${esc(money(choice.price))} · ${esc(choice.days)} ${choice.days === 1 ? "día" : "días"} de trabajo</p>`;
  dialog("share-dialog");
}
function buildShareText(job, quote) { return `Hola ${job.client}, te comparto la cotización para ${job.title}.\n\n${quote.name}\n${quote.description ? `${quote.description}\n` : ""}Valor total: ${money(quote.price)}\nDuración estimada: ${quote.days} ${quote.days === 1 ? "día" : "días"}\n\nQuedo atento(a) a tus comentarios.\n\n${job.owner || "CotizaFácil"}`; }
function markSent(job, quote) { quote.status = "enviada"; if (job.status === "Por cotizar") job.status = "En proceso"; saveState(); render(); }
function handleShare(channel) {
  const job = state.jobs.find(j => j.id === activeJobId); const quote = job?.quotes.find(q => q.id === activeQuoteId); if (!job || !quote) return;
  const message = buildShareText(job, quote); markSent(job, quote); dialog("share-dialog", false);
  if (channel === "whatsapp") { window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer"); showToast("Abriendo WhatsApp con tu cotización."); }
  else if (channel === "email") { window.location.href = `mailto:?subject=${encodeURIComponent(`Cotización: ${job.title}`)}&body=${encodeURIComponent(message)}`; showToast("Abriendo tu correo electrónico."); }
  else if (channel === "copy") { navigator.clipboard?.writeText(message).then(() => showToast("Texto de cotización copiado.")).catch(() => { window.prompt("Copia tu cotización:", message); }); }
  else if (channel === "print") { showPrintable(job, quote); }
}
function showPrintable(job, quote) {
  const win = window.open("", "_blank", "noopener,noreferrer");
  if (!win) { showToast("Permite ventanas emergentes para preparar el PDF."); return; }
  win.document.write(`<!doctype html><html lang="es"><meta charset="utf-8"><title>Cotización · CotizaFácil</title><style>body{font:15px Arial,sans-serif;color:#20342a;max-width:720px;margin:60px auto;padding:0 30px}header{display:flex;justify-content:space-between;border-bottom:2px solid #286247;padding-bottom:18px}h1{font-size:26px;margin:36px 0 8px}.muted{color:#6b7b70}.box{background:#f3f6f2;border-radius:10px;padding:22px;margin-top:28px}.price{font-size:25px;color:#286247;font-weight:bold}footer{margin-top:55px;color:#819087;font-size:12px}@media print{button{display:none}}</style><header><strong>✳ CotizaFácil</strong><span class="muted">Cotización</span></header><h1>${esc(job.title)}</h1><p class="muted">Preparada para ${esc(job.client)} · ${new Date().toLocaleDateString("es-CO")}</p><div class="box"><h2>${esc(quote.name)}</h2><p>${esc(quote.description || "Servicio según lo acordado con el cliente.")}</p><p class="price">${esc(money(quote.price))}</p><p>${esc(quote.days)} ${quote.days === 1 ? "día" : "días"} estimados de trabajo</p></div><footer>Gracias por la oportunidad. Esta cotización puede ajustarse según las condiciones del trabajo.</footer><script>window.onload=()=>window.print()<\/script></html>`);
  win.document.close(); showToast("Cotización lista para imprimir o guardar como PDF.");
}

function openAdminPanel() {
  const accounts = state.accounts;
  $("#admin-users").textContent = accounts.length;
  $("#admin-jobs").textContent = accounts.reduce((sum, account) => sum + account.jobs, state.jobs.length);
  $("#admin-quotes").textContent = accounts.reduce((sum, account) => sum + account.quotes, state.jobs.reduce((sum, job) => sum + job.quotes.filter(q => q.status === "enviada").length, 0));
  const featureNames = ["WhatsApp", "Correo", "Texto copiable", "PDF", "Varias opciones", "Asistencia IA"];
  $("#admin-features").textContent = featureNames.length;
  const demoAccount = { id: "current", name: state.profile?.business || state.profile?.name || "Esta cuenta", plan: "Cuenta personal", jobs: state.jobs.length, quotes: state.jobs.reduce((sum, job) => sum + job.quotes.filter(q => q.status === "enviada").length, 0), features: state.featureAccess.current || {} };
  const rows = [demoAccount, ...accounts];
  $("#admin-users-list").innerHTML = rows.length ? rows.map(account => `<article class="admin-user-row"><div class="admin-user-heading"><div><strong>${esc(account.name)}</strong><span>${esc(account.plan || "Prueba")}${account.paymentStatus ? ` · ${esc(account.paymentStatus)}` : " · Pago no conectado"}</span></div><span class="admin-user-stats">${account.jobs || 0} trabajos · ${account.quotes || 0} cotizaciones</span></div><div class="feature-access">${featureNames.map(feature => { const key = feature.toLowerCase().replaceAll(" ", "-"); const checked = account.features?.[key] !== false; return `<label><input type="checkbox" data-account="${esc(account.id)}" data-feature="${esc(key)}" ${checked ? "checked" : ""}><span>${esc(feature)}</span></label>`; }).join("")}</div></article>`).join("") : `<div class="admin-empty">Todavía no hay cuentas registradas. En la versión conectada aparecerán aquí los técnicos que se registren.</div>`;
  dialog("admin-dialog");
}

$("#today").textContent = new Intl.DateTimeFormat("es-CO", { weekday: "long", day: "numeric", month: "short" }).format(new Date());
$("#nav-admin").addEventListener("click", openAdminPanel);
$("#profile-menu").addEventListener("click", () => {
  const form = $("#account-form");
  form.elements.name.value = state.profile?.name || "";
  form.elements.business.value = state.profile?.business || "";
  dialog("account-dialog");
});
$("#account-form").addEventListener("submit", event => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  state.profile = { name: String(form.get("name")).trim(), business: String(form.get("business")).trim() };
  saveState(); render(); dialog("account-dialog", false); showToast(`¡${state.profile.name}, tu perfil quedó listo!`);
});
$("#admin-users-list").addEventListener("change", event => {
  const input = event.target.closest("input[data-feature]"); if (!input || input.dataset.account !== "current") return;
  state.featureAccess.current ||= {};
  state.featureAccess.current[input.dataset.feature] = input.checked;
  saveState(); showToast("Preferencias de acceso guardadas en esta demo.");
});
$("#new-job").addEventListener("click", openJobDialog);
$("#empty-new").addEventListener("click", openJobDialog);
$("#nav-new").addEventListener("click", openJobDialog);
$("#job-form").addEventListener("submit", event => {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  const job = { id: makeId(), title: String(data.get("title")).trim(), client: String(data.get("client")).trim(), trade: String(data.get("trade")), startDate: String(data.get("startDate")), duration: Number(data.get("duration")) || 1, durationUnit: String(data.get("durationUnit")), status: "Por cotizar", quotes: [], createdAt: new Date().toISOString() };
  state.jobs.unshift(job); saveState(); render(); dialog("job-dialog", false); beginQuote(job);
});
$("#add-option").addEventListener("click", () => addQuoteOption());
$("#quote-form").addEventListener("submit", saveQuotes);
$("#job-list").addEventListener("click", event => {
  const button = event.target.closest("[data-action]"); if (!button) return;
  const job = state.jobs.find(j => j.id === button.dataset.id); if (!job) return;
  if (button.dataset.action === "quotes") beginQuote(job); else openShare(job);
});
$("#job-list").addEventListener("dblclick", event => { const row = event.target.closest(".job-row"); if (!row) return; const job = state.jobs.find(j => j.id === row.dataset.id); if (job) { job.status = job.status === "Finalizado" ? "En proceso" : "Finalizado"; saveState(); render(); showToast(`Trabajo marcado como ${job.status.toLowerCase()}.`); } });
$("#search").addEventListener("input", render);
$(".filters").addEventListener("click", event => { const button = event.target.closest("[data-filter]"); if (!button) return; selectedFilter = button.dataset.filter; render(); });
$("#view-all").addEventListener("click", () => { selectedFilter = "Todos"; render(); $("#trabajos").scrollIntoView({ behavior: "smooth" }); });
$(".share-channels").addEventListener("click", event => { const button = event.target.closest("[data-channel]"); if (button) handleShare(button.dataset.channel); });
$$("[data-close]").forEach(button => button.addEventListener("click", () => dialog(button.dataset.close, false)));
$$("dialog").forEach(el => el.addEventListener("click", event => { if (event.target === el) el.close(); }));
render();
