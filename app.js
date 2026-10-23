const STORAGE_KEY = "cotizafacil.v2";
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const icons = { "Plomería": "⌁", "Electricidad": "ϟ", "Refrigeración y aire acondicionado": "❄", "Reparaciones del hogar": "⌂", "Pintura": "◩", "Albañilería": "▦", "Carpintería": "▤", "Cerrajería": "⚿", "Aseo y limpieza": "✧", "Jardinería y paisajismo": "❀", "Mantenimiento de electrodomésticos": "⌁", "Mecánica de vehículos": "⚙", "Computadores y redes": "⌘", "Vidriería y ventanas": "▱", "Soldadura y metalistería": "⚒", "Mudanzas e instalaciones": "⇄", "Control de plagas": "⌖", "Otro oficio": "✳" };
let currentUser = null;
let workspaceSync = Promise.resolve();
let state = loadState();
let selectedFilter = "Todos";
let selectedMetricFilter = null;
let activeJobId = null;
let activeQuoteId = null;
let receiptTargetId = null;
let toastTimer;
let activeJobContext = null;
let notificationItems = [];
let renewalCancelUserId = null;
let contactSettings = {};
let auditEvents = [];
let auditUsers = [];

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(`${STORAGE_KEY}.${currentUser?.id || "guest"}`));
    if (saved && Array.isArray(saved.jobs)) return { jobs: saved.jobs, profile: saved.profile || null, accounts: Array.isArray(saved.accounts) ? saved.accounts : [], featureAccess: saved.featureAccess || {} };
    return { jobs: [], profile: null, accounts: [], featureAccess: {} };
  } catch { return { jobs: [], profile: null, accounts: [], featureAccess: {} }; }
}
function saveState(syncWorkspace = true) {
  localStorage.setItem(`${STORAGE_KEY}.${currentUser?.id || "guest"}`, JSON.stringify(state));
  if (!syncWorkspace || !currentUser || currentUser.role === "admin") return;
  const sentJobs = JSON.stringify(state.jobs);
  workspaceSync = workspaceSync.then(async () => {
    const response = await fetch("/api/workspace", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jobs: JSON.parse(sentJobs) }) });
    if (response.status === 402) {
      const result = await response.json();
      if (JSON.stringify(state.jobs) === sentJobs) {
        const previous = await fetch("/api/workspace");
        const workspace = previous.ok ? await previous.json() : { jobs: [] };
        state.jobs = workspace.jobs;
        localStorage.setItem(`${STORAGE_KEY}.${currentUser.id}`, JSON.stringify(state));
        render();
      }
      openSubscriptionDialog(result.detail || "Llegaste al límite de dos cotizaciones del plan gratuito. Para crear otra necesitas suscribirte.");
    } else if (response.ok) {
      const usage = await response.json();
      currentUser.quote_count = usage.quote_count;
      currentUser.quote_limit = usage.quote_limit;
      renderProfile();
    } else {
      const result = await response.json().catch(() => ({}));
      showToast(result.detail || "No se pudieron guardar los cambios en el servidor.");
    }
  }).catch(() => showToast("No hay conexión con el servidor. Tus cambios siguen en este navegador."));
}
function savedQuoteCount() { return state.jobs.reduce((count, job) => count + (Array.isArray(job.quotes) ? job.quotes.length : 0), 0); }
function needsSubscriptionForQuotes() { return currentUser?.role !== "admin" && currentUser?.plan_status !== "subscribed" && savedQuoteCount() >= (currentUser?.quote_limit || 2); }
function explainQuoteLimit() { openSubscriptionDialog("Ya tienes guardadas las dos cotizaciones incluidas en el plan gratis. Para crear y guardar una tercera debes activar la suscripción."); }
function money(amount) { return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(Number(amount) || 0); }
function esc(value = "") { return String(value).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]); }
function dateLabel(value) { if (!value) return "Por definir"; return new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short" }).format(new Date(`${value}T12:00:00`)); }
function showToast(message) { const toast = $("#toast"); toast.textContent = message; toast.classList.add("show"); clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.remove("show"), 2500); }
const dialogParents = { "payment-settings-dialog": "admin-dialog", "contact-settings-dialog": "admin-dialog", "ai-settings-dialog": "admin-dialog", "receipt-dialog": "admin-dialog", "proof-viewer-dialog": "admin-dialog", "renewal-cancel-dialog": "admin-dialog", "payment-portal-dialog": "account-dialog", "opportunity-dialog": "account-dialog", "quote-library-dialog": "account-dialog", "payment-confirm-dialog": "payment-portal-dialog" };
function dialog(id, open = true) {
  const el = document.getElementById(id); if (!el) return;
  if (!open) { if (el.open) el.close(); return; }
  const head = el.querySelector(".dialog-head");
  if (head && id !== "auth-dialog" && !head.querySelector(".dialog-back-button")) {
    const back = document.createElement("button"); back.type = "button"; back.className = "dialog-back-button"; back.setAttribute("aria-label", "Volver a la pantalla anterior"); back.title = "Volver"; back.textContent = "←";
    back.addEventListener("click", () => { dialog(id, false); const parent = dialogParents[id]; if (parent && document.getElementById(parent)) dialog(parent); });
    head.insertBefore(back, head.firstChild);
  }
  if (!el.open) el.showModal();
}
function closeSidebar() { $("#sidebar").classList.remove("open"); $("#sidebar-backdrop").hidden = true; $("#mobile-nav-toggle").setAttribute("aria-expanded", "false"); $("#mobile-nav-toggle").setAttribute("aria-label", "Abrir menú"); }
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
  const plan = currentUser?.role === "admin" ? "Administrador" : currentUser?.plan_status === "subscribed" ? `@${currentUser?.username || ""} · Plan activo · ${currentUser.subscription_days_left ?? 0} días` : currentUser?.subscription_request === "pending" ? `@${currentUser?.username || ""} · Pago por revisar` : `@${currentUser?.username || ""} · Gratis · ${currentUser?.quote_count ?? 0}/2`;
  $("#profile-plan").textContent = plan;
  $("#nav-admin").hidden = currentUser?.role !== "admin";
  $("#nav-admin").classList.toggle("active", currentUser?.role === "admin");
  $("#nav-plan").hidden = currentUser?.role === "admin";
  const isAdmin = currentUser?.role === "admin";
  $("#admin-dashboard").hidden = !isAdmin;
  $("#technician-overview").hidden = isAdmin;
  $("#trabajos").hidden = isAdmin;
  $("#welcome-section").hidden = isAdmin;
  $("#nav-new").hidden = isAdmin;
  $("#nav-jobs").hidden = isAdmin;
  $("#nav-home").hidden = isAdmin;
  $("#profile-menu").hidden = isAdmin;
  if (isAdmin) { $("#breadcrumb-title").textContent = "Administración"; $(".breadcrumb").firstChild.textContent = "CotizaFácil "; }
  else { $("#breadcrumb-title").textContent = "Inicio"; $(".breadcrumb").firstChild.textContent = "Tu espacio "; }
  $("#notification-bell").hidden = !currentUser;
  $("#nav-auth").hidden = Boolean(currentUser);
  $("#profile-avatar").textContent = (profile?.name || "T").trim().charAt(0).toLocaleUpperCase("es-CO");
  const opportunityButton = $("#profile-opportunities-button");
  if (opportunityButton) opportunityButton.hidden = !(currentUser?.role === "technician" && currentUser?.plan_status === "subscribed" && currentUser?.features?.job_opportunities);
  $("#top-avatar").textContent = (profile?.name || "T").trim().charAt(0).toLocaleUpperCase("es-CO");
}

function renderContactLinks() {
  const support = $("#help-contact-links"); const footer = $("#footer-contact-links");
  if (!support || !footer) return;
  const links = [];
  if (contactSettings.support_email) {
    const email = encodeURIComponent(contactSettings.support_email);
    links.push(`<a class="contact-link" href="mailto:${email}?subject=${encodeURIComponent("Ayuda o sugerencia de CotizaFácil")}">Correo de soporte</a>`);
  }
  const phone = String(contactSettings.whatsapp_phone || "").replace(/\D/g, "");
  if (phone) links.push(`<a class="contact-link" href="https://wa.me/${phone}?text=${encodeURIComponent("Hola, necesito ayuda con CotizaFácil.")}" target="_blank" rel="noopener noreferrer">WhatsApp</a>`);
  for (const [label, url] of [["Instagram", contactSettings.instagram_url], ["Facebook", contactSettings.facebook_url]]) {
    if (typeof url === "string" && url.startsWith("https://")) links.push(`<a class="contact-link" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${label}</a>`);
  }
  support.innerHTML = links.length ? links.join("") : "";
  footer.innerHTML = links.map((link) => link.replace('class="contact-link"', 'class="footer-contact-link"')).join("");
  $("#help-contact-empty").hidden = links.length > 0;
  $("#help-support-message").textContent = contactSettings.support_message || "Encuentra una respuesta o ponte en contacto con CotizaFácil.";
}
async function refreshContactSettings() {
  try { const response = await fetch("/api/contact"); if (response.ok) { contactSettings = await response.json(); renderContactLinks(); } }
  catch { /* los canales se actualizarán cuando vuelva la conexión */ }
}

function render() {
  const jobs = state.jobs;
  const active = jobs.filter(j => j.status === "En proceso").length;
  const pending = jobs.filter(j => j.status === "Por cotizar").length;
  const sent = jobs.reduce((n, j) => n + j.quotes.filter(q => q.status === "enviada").length, 0);
  const follow = jobs.reduce((n, j) => n + (j.status !== "Finalizado" && j.quotes.some(q => q.status === "enviada") ? 1 : 0), 0);
  $("#active-value").textContent = active;
  $("#quotes-value").textContent = sent;
  $("#follow-value").textContent = follow;
  $("#nav-count").textContent = jobs.length;
  $("#job-count").textContent = `${jobs.length} ${jobs.length === 1 ? "en total" : "en total"}`;
  $("#section-description").textContent = selectedMetricFilter === "active" ? "Mostrando trabajos activos." : selectedMetricFilter === "sent" ? "Mostrando trabajos con cotizaciones enviadas." : selectedMetricFilter === "follow" ? "Mostrando trabajos que requieren seguimiento." : "Todo lo que estás construyendo, en un solo lugar.";
  $("#filter-all").textContent = jobs.length;
  $("#filter-active").textContent = active;
  $("#filter-pending").textContent = pending;
  $("#filter-done").textContent = jobs.filter(j => j.status === "Finalizado").length;
  renderProfile();
  const query = $("#search").value.trim().toLowerCase();
  const visible = jobs.filter(j => (selectedFilter === "Todos" || j.status === selectedFilter) && (!selectedMetricFilter || (selectedMetricFilter === "active" ? j.status === "En proceso" : selectedMetricFilter === "sent" ? j.quotes.some(q => q.status === "enviada") : j.status !== "Finalizado" && j.quotes.some(q => q.status === "enviada"))) && (!query || `${j.title} ${j.client} ${j.trade}`.toLowerCase().includes(query)));
  $("#empty-state").hidden = jobs.length !== 0;
  $("#filtered-empty-state").hidden = jobs.length === 0 || visible.length !== 0;
  $("#job-list").innerHTML = visible.map(job => {
    const statusClass = job.status === "Por cotizar" ? "pending" : job.status === "Finalizado" ? "done" : "";
    const quote = activeQuotes(job)[0];
    return `<article class="job-row" data-id="${esc(job.id)}"><div class="job-main"><div class="job-symbol">${icons[job.trade] || "✳"}</div><div class="job-main-text"><strong>${esc(job.title)}</strong><span>${esc(job.client)} · ${esc(job.trade)}</span></div></div><div class="job-detail"><strong>${quote ? esc(money(quote.price)) : "Sin cotizar"}</strong><span>${esc(quoteLabel(job))}</span></div><div class="job-detail"><strong>${esc(dateLabel(job.startDate))}</strong><span>${esc(job.duration)} ${esc(job.durationUnit)} estimados</span></div><span class="job-status ${statusClass}">${job.status === "En proceso" ? "● " : job.status === "Finalizado" ? "✓ " : "○ "}${esc(job.status)}</span><div class="row-actions"><button class="small-action" data-action="quotes" data-id="${esc(job.id)}">Cotizar →</button><button class="small-action more" data-action="share" data-id="${esc(job.id)}">Compartir cotización <span aria-hidden="true">↗</span></button></div></article>`;
  }).join("");
  $$(".filter-chip").forEach(button => button.classList.toggle("selected", button.dataset.filter === selectedFilter));
}

function openJobDialog() { $("#job-form").reset(); $("#job-form [name=duration]").value = 1; const trade = $("#job-form [name=trade]"); trade.value = [...trade.options].some(option => option.value === currentUser?.trade) ? currentUser.trade : "Otro oficio"; dialog("job-dialog"); }
function beginQuote(job) {
  if (!activeQuotes(job).length && needsSubscriptionForQuotes()) { explainQuoteLimit(); return; }
  activeJobId = job.id;
  activeJobContext = job;
  $("#quote-heading").textContent = "Tu propuesta.";
  $("#quote-subheading").textContent = "Arma una o varias opciones para que tu cliente elija.";
  $("#quote-context").innerHTML = `<strong>${esc(job.title)}</strong> · ${esc(job.client)} · ${esc(job.duration)} ${esc(job.durationUnit)} estimados`;
  $("#ai-scope").value = job.scope || "";
  $("#ai-requirement-confirm").checked = false;
  $("#ai-confirm-field").hidden = !(job.scope || "").trim();
  $("#ai-requirements-note").textContent = (job.scope || "").trim() ? "Confirma que esta descripción refleja el trabajo acordado con tu cliente." : "Escribe los procedimientos o tareas que realizarás; luego confirma para que la IA los ordene y redacte.";
  const options = activeQuotes(job);
  $("#quote-options").innerHTML = "";
  (options.length ? options : [{ id: makeId(), name: "Opción 1", description: "", price: "", days: Number(job.duration) || 1, status: "borrador" }]).forEach(addQuoteOption);
  setAiStatus("La IA redacta solo con los datos que indiques. Revisa el resultado antes de enviarlo.");
  dialog("quote-dialog");
}
function addQuoteOption(quote = {}) {
  const index = $$(".quote-option", $("#quote-options")).length + 1;
  const el = document.createElement("div");
  el.className = "quote-option";
  el.dataset.quoteId = quote.id || makeId();
  el.innerHTML = `<button type="button" class="option-remove" aria-label="Quitar alternativa">×</button><label class="option-name-field"><span>Nombre de la alternativa</span><input name="optionName" maxlength="45" value="${esc(quote.name || `Opción ${index}`)}" required placeholder="Ej. Reparación básica" /></label><label><span>Valor total (COP)</span><div class="money-input"><input name="price" type="number" min="0" step="1000" value="${esc(quote.price ?? "")}" required placeholder="0" /></div></label><label><span>Días de trabajo</span><input name="days" type="number" min="1" value="${esc(quote.days || 1)}" required /></label><label class="option-description"><span>¿Qué incluye esta opción?</span><textarea name="description" maxlength="1200" placeholder="Alcance, tareas y condiciones indicadas por ti">${esc(quote.description || "")}</textarea></label><div class="option-actions"><button type="button" class="option-share-button" data-option-share>Compartir cotización <span>↗</span></button></div>`;
  el.querySelector(".option-remove").addEventListener("click", () => { if ($$(".quote-option", $("#quote-options")).length === 1) { showToast("Deja al menos una alternativa."); return; } el.remove(); });
  $("#quote-options").append(el);
}
async function suggestOptionsWithAI() {
  const job = activeJobContext;
  const scope = $("#ai-scope").value.trim();
  if (!job || scope.length < 5) { setAiStatus("Describe el trabajo y las opciones que indicaste para poder redactarlas."); showToast("Completa primero el alcance del trabajo."); $("#ai-scope").focus(); return; }
  const button = $("#ai-suggest");
  button.disabled = true; button.classList.add("loading"); button.innerHTML = "<span>✳</span> Redactando cotización…";
  setAiStatus("Gemini está organizando tus notas. No asigna precios ni inventa materiales.");
  try {
    const response = await fetch("/api/quotes/suggest", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ job_title: job.title, trade: job.trade, scope, duration: Number(job.duration) || 1, duration_unit: job.durationUnit }) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.detail || "No se pudo conectar con la IA.");
    const option = result.options[0];
    const existing = $$(".quote-option", $("#quote-options"));
    const target = existing.find(el => !el.querySelector('[name="price"]').value) || existing[0];
    target.querySelector('[name="optionName"]').value = option.name;
    target.querySelector('[name="description"]').value = option.description;
    job.scope = scope;
    setAiStatus("Texto listo. Verifica que describa exactamente el trabajo acordado y completa el precio.");
    showToast("Redacción lista para revisar.");
  } catch (error) { setAiStatus(error.message || "No se pudo conectar con Gemini. Revisa la configuración y vuelve a intentar."); showToast(error.message || "No se pudo conectar con Gemini."); }
  finally { button.disabled = false; button.classList.remove("loading"); button.innerHTML = "<span>✳</span> Redactar cotización con IA"; }
}
function setAiStatus(message) { const status = $("#ai-status"); if (status) status.textContent = message; }
function persistQuotes(shareOptionId = null) {
  const job = state.jobs.find(j => j.id === activeJobId); if (!job) return;
  const scope = $("#ai-scope").value.trim();
  const optionElements = $$(".quote-option", $("#quote-options")).filter(el => {
    if (!shareOptionId || el.dataset.quoteId === shareOptionId) return true;
    return [...el.querySelectorAll("input[required]")].every(field => field.checkValidity());
  });
  const drafts = optionElements.map(el => ({ id: el.dataset.quoteId, name: el.querySelector('[name="optionName"]').value.trim(), price: Number(el.querySelector('[name="price"]').value), days: Number(el.querySelector('[name="days"]').value), description: el.querySelector('[name="description"]').value.trim() || scope, status: "borrador" }));
  const nextCount = savedQuoteCount() - job.quotes.length + drafts.length;
  if (currentUser?.role !== "admin" && currentUser?.plan_status !== "subscribed" && nextCount > (currentUser?.quote_limit || 2)) { explainQuoteLimit(); return null; }
  const editedIds = new Set(drafts.map(q => q.id));
  const retainedSent = job.quotes.filter(q => q.status === "enviada" && !editedIds.has(q.id));
  job.quotes = [...retainedSent, ...drafts];
  job.scope = scope;
  job.status = job.quotes.some(q => q.status === "enviada") ? job.status === "Por cotizar" ? "En proceso" : job.status : "Por cotizar";
  saveState(); render(); return job;
}
function saveQuotes(event) {
  event.preventDefault();
  if (persistQuotes()) { dialog("quote-dialog", false); showToast("Cotizaciones guardadas."); }
}
function saveAndShareQuote(targetId) {
  const target = $$(".quote-option", $("#quote-options")).find(el => el.dataset.quoteId === targetId);
  if (!target) return;
  const invalidField = [...target.querySelectorAll("input[required]")].find(field => !field.checkValidity());
  if (invalidField) { invalidField.reportValidity(); return; }
  const job = persistQuotes(targetId);
  if (!job) return;
  dialog("quote-dialog", false);
  openShare(job, targetId);
}
function openShare(job, preferredQuoteId = null) {
  const available = activeQuotes(job);
  if (!available.length) { beginQuote(job); return; }
  const sent = available.filter(q => q.status === "enviada");
  const choice = available.find(q => q.id === preferredQuoteId) || (sent.length ? sent[0] : available[0]);
  if (!(choice.description || job.scope || "").trim()) {
    showToast("Agrega el alcance de la cotización antes de compartirla.");
    beginQuote(job);
    return;
  }
  activeJobId = job.id; activeQuoteId = choice.id;
  $("#export-format").value = job.outputFormat || "pdf";
  $("#share-preview").innerHTML = `<strong>${esc(job.title)} · ${esc(choice.name)}</strong><p>Hola ${esc(job.client)}. Te comparto la cotización para ${esc(job.title.toLowerCase())}.</p><p>${esc(choice.description || job.scope || "")}</p><p class="preview-price">${esc(money(choice.price))} · ${esc(choice.days)} ${choice.days === 1 ? "día" : "días"} de trabajo</p>`;
  dialog("share-dialog");
}
function renderQuoteLibrary() {
  const entries = state.jobs.flatMap(job => (job.quotes || []).map(quote => ({ job, quote }))).reverse();
  $("#quote-library-list").innerHTML = entries.length ? entries.map(({ job, quote }) => `<article class="quote-library-row"><div><strong>${esc(job.title)} · ${esc(quote.name || "Cotización")}</strong><span>${esc(job.client)} · ${esc(money(quote.price))} · ${esc(quote.days || 1)} días · ${quote.status === "enviada" ? "Compartida" : "Borrador"}</span></div><div class="quote-library-actions"><button type="button" class="small-action" data-library-action="edit" data-job="${esc(job.id)}" data-quote="${esc(quote.id)}">Editar</button><button type="button" class="small-action" data-library-action="share" data-job="${esc(job.id)}" data-quote="${esc(quote.id)}">Compartir cotización</button><button type="button" class="small-action danger-action" data-library-action="delete" data-job="${esc(job.id)}" data-quote="${esc(quote.id)}">Eliminar</button></div></article>`).join("") : `<div class="admin-empty">Todavía no has guardado cotizaciones. Crea un trabajo para empezar.</div>`;
}
function openQuoteLibrary() { renderQuoteLibrary(); dialog("quote-library-dialog"); }
function buildShareText(job, quote) { return `Hola ${job.client}, te comparto la cotización para ${job.title}.\n\n${quote.name}\n${quote.description || job.scope || ""}\n\nValor total: ${money(quote.price)}\nDuración estimada: ${quote.days} ${quote.days === 1 ? "día" : "días"}\n\nQuedo atento(a) a tus comentarios.\n\n${job.owner || "CotizaFácil"}`; }
function markSent(job, quote) { quote.status = "enviada"; if (job.status === "Por cotizar") job.status = "En proceso"; saveState(); render(); }
function handleShare(channel) {
  const job = state.jobs.find(j => j.id === activeJobId); const quote = job?.quotes.find(q => q.id === activeQuoteId); if (!job || !quote) return;
  const message = buildShareText(job, quote); markSent(job, quote); dialog("share-dialog", false);
  if (channel === "whatsapp") { window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer"); showToast("Abriendo WhatsApp con tu cotización."); }
  else if (channel === "email") { window.location.href = `mailto:?subject=${encodeURIComponent(`Cotización: ${job.title}`)}&body=${encodeURIComponent(message)}`; showToast("Abriendo tu correo electrónico."); }
  else if (channel === "copy") { navigator.clipboard?.writeText(message).then(() => showToast("Texto de cotización copiado.")).catch(() => { window.prompt("Copia tu cotización:", message); }); }
  else if (channel === "print") { showPrintable(job, quote); }
}
async function downloadQuoteFile() {
  const job = state.jobs.find(j => j.id === activeJobId);
  const quote = job?.quotes.find(q => q.id === activeQuoteId);
  if (!job || !quote) return;
  const button = $("#download-quote");
  button.disabled = true; button.textContent = "Preparando archivo…";
  try {
    const description = quote.description || job.scope || "";
    if (!description.trim()) { showToast("Agrega el alcance antes de descargar la cotización."); return; }
    const response = await fetch("/api/quotes/export", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ job_title: job.title, client_name: job.client, trade: job.trade, option_name: quote.name, description, price_cop: Number(quote.price) || 0, duration: Number(quote.days) || 1, duration_unit: job.durationUnit, file_format: $("#export-format").value }) });
    if (!response.ok) { const err = await response.json(); throw new Error(err.detail || "No se pudo crear el archivo."); }
    const blob = await response.blob();
    const disposition = response.headers.get("Content-Disposition") || "";
    const filename = disposition.match(/filename="?([^";]+)"?/i)?.[1] || `cotizacion-${Date.now()}.${$("#export-format").value}`;
    const href = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = href; link.download = filename; document.body.append(link); link.click(); link.remove(); URL.revokeObjectURL(href);
    job.outputFormat = $("#export-format").value; saveState(); showToast("Archivo de cotización descargado.");
  } catch (error) { showToast(error.message || "Inicia la API local para descargar el archivo."); }
  finally { button.disabled = false; button.innerHTML = "Descargar cotización <span>↓</span>"; }
}
function showPrintable(job, quote) {
  const win = window.open("", "_blank", "noopener,noreferrer");
  if (!win) { showToast("Permite ventanas emergentes para preparar el PDF."); return; }
  const logo = currentUser?.logo_file ? `<img class="brand-logo" src="/api/profile/logo" alt="Logotipo del técnico">` : `<span class="mark">✓</span>`;
  const business = esc(currentUser?.business || currentUser?.first_name || "Técnico");
  win.document.write(`<!doctype html><html lang="es"><meta charset="utf-8"><title>Cotización · ${business}</title><style>body{font:15px Arial,sans-serif;color:#30251f;max-width:720px;margin:60px auto;padding:0 30px}header{display:flex;align-items:center;gap:12px;border-bottom:2px solid #556d48;padding-bottom:18px}.mark,.brand-logo{width:48px;height:48px;object-fit:contain;border-radius:11px}.mark{background:#ad6244;color:#fff;display:grid;place-items:center;font-size:24px}h1{font-size:26px;margin:36px 0 8px}.muted{color:#6b7b70}.box{background:#f3f2e9;border-radius:10px;padding:22px;margin-top:28px}.price{font-size:25px;color:#3d5338;font-weight:bold}footer{margin-top:55px;color:#819087;font-size:12px}@media print{button{display:none}}</style><header>${logo}<div><strong>${business}</strong><div class="muted">Cotización de servicio · Hecho con CotizaFácil</div></div></header><h1>${esc(job.title)}</h1><p class="muted">Preparada para ${esc(job.client)} · ${new Date().toLocaleDateString("es-CO")}</p><div class="box"><h2>${esc(quote.name)}</h2><p>${esc(quote.description || job.scope || "")}</p><p class="price">${esc(money(quote.price))}</p><p>${esc(quote.days)} ${quote.days === 1 ? "día" : "días"} estimados de trabajo</p></div><footer>Esta propuesta fue preparada con la información suministrada por el técnico. Confirma el alcance y las condiciones antes de aceptarla.</footer><script>window.onload=()=>window.print()<\/script></html>`);
  win.document.close(); showToast("Cotización lista para imprimir o guardar como PDF.");
}

function openAdminPanel() {
  fetch("/api/admin/overview").then(async response => {
    const result = await response.json();
    if (!response.ok) throw new Error(result.detail || "No se pudo abrir el panel administrador.");
    $("#dashboard-admin-users").textContent = result.technicians;
    $("#dashboard-admin-subscribed").textContent = result.subscribed;
    $("#dashboard-admin-pending").textContent = result.pending;
    $("#dashboard-admin-activity").textContent = `${result.jobs} / ${result.quotes}`;
    const featureNames = { ai_quotes: "Cotizaciones con IA", ai_logo: "Logotipo con IA", job_opportunities: "Buscar oportunidades (Medellín y Valle de Aburrá)", sms_reminders: "SMS (pendiente de integración)" };
    auditUsers = result.users || [];
    $("#admin-users-list").innerHTML = result.users.length ? result.users.map(user => {
      const status = !user.active ? "Cuenta desactivada: sin acceso" : user.plan_status === "subscribed" ? "Plan activo" : user.subscription_request === "pending" ? "Pago por revisar" : "Plan gratuito";
      const proofAction = user.has_payment_proof ? `<button class="small-action" data-proof-user="${esc(user.id)}">Ver comprobante</button>` : "";
      const action = `${proofAction} ${user.subscription_request === "pending" ? `<button class="small-action" data-admin-action="approve_subscription" data-user="${esc(user.id)}">Confirmar pago y activar</button>` : user.plan_status === "subscribed" ? `<button class="small-action" data-receipt-user="${esc(user.id)}">${user.receipt_sent_at ? "Reenviar comprobante" : "Preparar factura"}</button><button class="small-action" data-admin-action="cancel_subscription" data-user="${esc(user.id)}">Cancelar suscripción</button>` : ""}<button class="small-action" data-reset-password="${esc(user.id)}">Restablecer contraseña</button>`;
      const renewalAction = user.plan_status === "subscribed" && user.renewal_scheduled ? `<button class="small-action" data-cancel-renewal="${esc(user.id)}">Cancelar continuidad</button>` : user.plan_status === "subscribed" && user.subscription_days_left > 0 && user.subscription_days_left <= 2 ? `<button class="small-action" data-admin-action="schedule_renewal" data-user="${esc(user.id)}">Continuar suscripción</button>` : "";
      const accountAction = user.active ? `<button class="small-action danger-action" data-admin-action="cancel_access" data-user="${esc(user.id)}">Cancelar acceso al portal</button>` : `<button class="small-action" data-admin-action="restore_access" data-user="${esc(user.id)}">Restaurar acceso</button>`;
      return `<article class="admin-user-row"><div class="admin-user-heading"><div><strong>${esc(user.first_name)} · @${esc(user.username || "sin-usuario")}</strong><span>${esc(user.email || "Correo pendiente de suscripción")} · ${esc(user.trade)} · ${esc(status)}${user.plan_status === "subscribed" ? ` · ${user.subscription_days_left} días restantes` : ""}</span><span>${user.quote_count} cotizaciones guardadas${user.payment_reference ? ` · Referencia: ${esc(user.payment_reference)}` : ""}</span></div><span class="admin-user-stats">${action} ${renewalAction} ${accountAction}</span></div><div class="feature-access">${Object.entries(featureNames).map(([key, label]) => `<label><input type="checkbox" data-feature="${key}" data-user="${esc(user.id)}" ${user.features?.[key] ? "checked" : ""} ${key === "sms_reminders" || (user.plan_status !== "subscribed" && key !== "ai_quotes") ? "disabled" : ""}><span>${label}</span></label>`).join("")}</div></article>`;
    }).join("") : `<div class="admin-empty">Aún no hay técnicos registrados.</div>`;
    applyAdminUserFilters();
    dialog("admin-dialog");
  }).catch(error => showToast(error.message));
}

function renderAdminAudit() {
  const from = $("#audit-date-from").value; const to = $("#audit-date-to").value; const query = $("#audit-search").value.trim().toLocaleLowerCase("es-CO");
  const visible = auditEvents.filter(item => {
    const date = new Date(Number(item.timestamp) * 1000); const localDate = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    if (from && localDate < from || to && localDate > to) return false;
    if (!query) return true;
    const user = auditUsers.find(candidate => candidate.id === item.target_id || candidate.id === item.actor_id);
    return [item.actor, item.actor_id, item.target_id, item.action, item.details, user?.username, user?.first_name, user?.email, user?.trade].filter(Boolean).join(" ").toLocaleLowerCase("es-CO").includes(query);
  });
  $("#audit-result-count").textContent = `${visible.length} de ${auditEvents.length} eventos`;
  $("#admin-audit-list").innerHTML = visible.length ? visible.map(item => {
    const user = auditUsers.find(candidate => candidate.id === item.target_id || candidate.id === item.actor_id);
    const who = [user?.first_name, user?.username && `@${user.username}`, user?.email].filter(Boolean).join(" · ");
    return `<article class="audit-row"><strong>${esc(item.action)}</strong><span>${new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.timestamp * 1000))} · ${esc(item.actor)}${who ? ` · ${esc(who)}` : ""}</span><small>${esc(item.details || "")}</small></article>`;
  }).join("") : `<div class="admin-empty">No hay eventos que coincidan con estos filtros.</div>`;
}
async function openAdminAudit() {
  try {
    const [auditResponse, overviewResponse] = await Promise.all([fetch("/api/admin/audit?limit=5000"), fetch("/api/admin/overview")]);
    const [result, overview] = await Promise.all([auditResponse.json(), overviewResponse.json()]);
    if (!auditResponse.ok) throw new Error(result.detail || "No se pudo abrir el registro de actividad.");
    if (!overviewResponse.ok) throw new Error(overview.detail || "No se pudieron cargar los datos para filtrar la actividad.");
    auditEvents = result.events || []; auditUsers = overview.users || []; renderAdminAudit(); dialog("admin-audit-dialog");
  } catch (error) { showToast(error.message); }
}

function applyAdminUserFilters() {
  const query = $("#admin-user-search").value.trim().toLocaleLowerCase("es-CO");
  const status = $("#admin-user-status-filter").value;
  let shown = 0;
  $$("#admin-users-list .admin-user-row").forEach((row, index) => {
    const user = auditUsers[index];
    const matchesStatus = status === "all" || (status === "subscribed" ? user?.plan_status === "subscribed" : user?.subscription_request === "pending");
    const matchesQuery = !query || row.textContent.toLocaleLowerCase("es-CO").includes(query);
    row.hidden = !(matchesStatus && matchesQuery);
    if (!row.hidden) shown++;
  });
  const empty = $("#admin-users-list .admin-empty");
  if (empty) empty.hidden = Boolean(query || status !== "all");
  let count = $("#admin-user-filter-count");
  if (!count) { count = document.createElement("p"); count.id = "admin-user-filter-count"; count.className = "admin-filter-count"; $("#admin-users-list").before(count); }
  count.textContent = `${shown} ${shown === 1 ? "técnico visible" : "técnicos visibles"}`;
}

async function openSubscriptionDialog(reason = "") {
  try {
    const response = await fetch("/api/plan");
    if (!response.ok) throw new Error("No se pudo cargar el plan.");
    const plan = await response.json();
    $("#payment-plan-summary").textContent = `${reason ? `${reason} ` : ""}${money(plan.price_cop)} por ${plan.period}. La activación la confirma el administrador después de revisar tu comprobante.`;
    const payment = plan.payment || {};
    const details = [["Titular", payment.account_holder], ["Entidad", payment.bank_name], ["Tipo de cuenta", payment.account_type], ["Número de cuenta", payment.account_number], ["Llave para transferencias", payment.payment_key], ["Instrucciones", payment.transfer_instructions]].filter(([, value]) => value);
    $("#payment-portal-details").innerHTML = details.length ? details.map(([label, value]) => `<div><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`).join("") : `<p class="admin-empty">El administrador todavía no ha configurado la cuenta receptora. Podrás enviar tu solicitud cuando aparezcan aquí los datos de pago.</p>`;
    const qr = $("#payment-qr-preview"); qr.hidden = !plan.has_qr; if (plan.has_qr) qr.src = `${plan.qr_url}?v=${Date.now()}`;
    const form = $("#payment-portal-form"); form.reset(); form.elements.email.value = currentUser?.email || "";
    $("#request-activation-button").disabled = !(payment.account_holder && payment.account_number) || currentUser?.subscription_request === "pending";
    $("#payment-portal-form").elements.email.disabled = currentUser?.subscription_request === "pending";
    $("#payment-portal-form").elements.payment_reference.disabled = currentUser?.subscription_request === "pending";
    $("#payment-portal-form").elements.proof.disabled = currentUser?.subscription_request === "pending";
    $("#payment-portal-message").textContent = currentUser?.subscription_request === "pending" ? "Tu solicitud ya está pendiente de revisión." : "";
    dialog("payment-portal-dialog");
  } catch (error) { showToast(error.message); }
}

async function openPaymentSettings() {
  try {
    const response = await fetch("/api/admin/payment-settings"); const result = await response.json();
    if (!response.ok) throw new Error(result.detail || "No se pudieron cargar los datos de pago.");
    const form = $("#payment-settings-form");
    for (const key of ["account_holder", "bank_name", "account_type", "account_number", "payment_key", "transfer_instructions"]) form.elements[key].value = result[key] || "";
    form.elements.remove_qr.checked = false;
    $("#payment-settings-message").textContent = result.has_qr ? "Ya hay un QR guardado. Selecciona ‘Quitar el QR actual’ si quieres retirarlo." : "No hay un QR cargado. Es opcional.";
    dialog("payment-settings-dialog");
  } catch (error) { showToast(error.message); }
}

async function openContactSettings() {
  try {
    const response = await fetch("/api/admin/contact-settings"); const result = await response.json();
    if (!response.ok) throw new Error(result.detail || "No se pudieron cargar los canales de contacto.");
    const form = $("#contact-settings-form");
    for (const key of ["support_email", "whatsapp_phone", "instagram_url", "facebook_url", "support_message"]) form.elements[key].value = result[key] || "";
    $("#contact-settings-message").textContent = "Deja vacío cualquier canal que no quieras mostrar.";
    dialog("contact-settings-dialog");
  } catch (error) { showToast(error.message); }
}

function fileAsDataUrl(file) { return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error("No se pudo leer la imagen.")); reader.readAsDataURL(file); }); }

function renderNotifications() {
  const unread = notificationItems.filter(item => !item.read).length;
  $("#notification-count").textContent = unread > 99 ? "99+" : String(unread);
  $("#notification-count").hidden = unread === 0;
  $("#notification-list").innerHTML = notificationItems.length ? notificationItems.map(item => `<button type="button" class="notification-item ${item.read ? "read" : "unread"}" data-notification-id="${esc(item.id)}"><strong>${esc(item.title)}</strong><span>${esc(item.message)}</span><small>${new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.created_at * 1000))}</small></button>`).join("") : `<div class="admin-empty">No tienes notificaciones nuevas.</div>`;
}
async function refreshNotifications() {
  if (!currentUser) return;
  try { const response = await fetch("/api/notifications"); const result = await response.json(); if (response.ok) { notificationItems = result.notifications || []; renderNotifications(); } }
  catch { /* conserva avisos cargados previamente si se pierde conexión */ }
}
$("#notification-bell").addEventListener("click", async () => { await refreshNotifications(); dialog("notifications-dialog"); });
$("#notification-list").addEventListener("click", async event => {
  const item = event.target.closest("[data-notification-id]"); if (!item) return;
  const id = item.dataset.notificationId;
  try { await fetch("/api/notifications/read", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ notification_id: id }) }); await refreshNotifications(); }
  catch { showToast("No se pudo actualizar la notificación."); }
});

async function activateUser(user, importLegacy = false) {
  currentUser = user;
  state = loadState();
  const workspaceResponse = user.role === "admin" ? null : await fetch("/api/workspace");
  if (workspaceResponse && !workspaceResponse.ok) throw new Error("No se pudieron cargar tus trabajos.");
  const workspace = workspaceResponse ? await workspaceResponse.json() : { jobs: [], quote_count: 0, quote_limit: null };
  if (importLegacy && workspace.jobs.length === 0) {
    try {
      const legacy = JSON.parse(localStorage.getItem("cotizafacil.v1"));
      if (Array.isArray(legacy?.jobs)) workspace.jobs = legacy.jobs;
    } catch { /* ignora datos locales antiguos dañados */ }
  }
  state.jobs = workspace.jobs;
  user.quote_count = workspace.quote_count;
  user.quote_limit = workspace.quote_limit;
  state.profile = { name: user.first_name, business: user.business || "", trade: user.trade || "" };
  saveState(false);
  if (importLegacy && workspace.jobs.length) {
    saveState(true);
    await workspaceSync;
  }
  render();
  if (user.role === "admin") fetch("/api/admin/overview").then(response => response.json()).then(result => {
    if (!result || result.detail) return;
    $("#dashboard-admin-users").textContent = result.technicians; $("#dashboard-admin-subscribed").textContent = result.subscribed; $("#dashboard-admin-pending").textContent = result.pending; $("#dashboard-admin-activity").textContent = `${result.jobs} / ${result.quotes}`;
  }).catch(() => {});
  refreshNotifications();
  dialog("auth-dialog", false);
}

async function submitAuth(endpoint, form, messageSelector) {
  const message = $(messageSelector);
  message.textContent = "Conectando…";
  const values = Object.fromEntries(new FormData(form).entries());
  try {
    const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(values) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.detail || "No se pudo completar la solicitud.");
    await activateUser(result, endpoint.endsWith("/register"));
  } catch (error) { message.textContent = error.message; }
}

async function initializeSession() {
  try {
    const response = await fetch("/api/auth/me");
    if (!response.ok) throw new Error("Sesión requerida");
    await activateUser(await response.json());
  } catch { dialog("auth-dialog"); }
}

$("#today").textContent = new Intl.DateTimeFormat("es-CO", { weekday: "long", day: "numeric", month: "short" }).format(new Date());
$("#mobile-nav-toggle").addEventListener("click", () => {
  const isOpen = $("#sidebar").classList.toggle("open");
  $("#sidebar-backdrop").hidden = !isOpen;
  $("#mobile-nav-toggle").setAttribute("aria-expanded", String(isOpen));
  $("#mobile-nav-toggle").setAttribute("aria-label", isOpen ? "Cerrar menú" : "Abrir menú");
});
$("#sidebar-backdrop").addEventListener("click", closeSidebar);
$("#sidebar").addEventListener("click", event => { if (event.target.closest(".nav-link")) closeSidebar(); });
$("#nav-admin").addEventListener("click", () => { $("#admin-dashboard").scrollIntoView({ behavior: "smooth", block: "start" }); });
$("#dashboard-manage-users").addEventListener("click", openAdminPanel);
$("#dashboard-open-audit").addEventListener("click", openAdminAudit);
$(".admin-dashboard-metrics").addEventListener("click", event => {
  const card = event.target.closest("[data-metric]"); if (!card) return;
  const metric = card.dataset.metric;
  if (metric === "activity") { openAdminAudit(); return; }
  $("#admin-user-search").value = "";
  $("#admin-user-status-filter").value = metric === "subscribed" ? "subscribed" : metric === "pending" ? "pending" : "all";
  openAdminPanel();
});
$("#admin-user-search").addEventListener("input", applyAdminUserFilters);
$("#admin-user-status-filter").addEventListener("change", applyAdminUserFilters);
$("#admin-logout-button").addEventListener("click", async () => { await fetch("/api/auth/logout", { method: "POST" }); currentUser = null; state = loadState(); render(); dialog("auth-dialog"); });
$("#dashboard-payment-settings").addEventListener("click", openPaymentSettings);
$("#dashboard-contact-settings").addEventListener("click", openContactSettings);
$("#dashboard-ai-settings").addEventListener("click", async () => {
  const form = $("#ai-settings-form"); const status = $("#ai-settings-status"); status.textContent = "Cargando configuración…";
  try { const response = await fetch("/api/admin/ai-settings"); const result = await response.json(); if (!response.ok) throw new Error(result.detail || "No se pudo cargar la configuración.");
    form.elements.provider.value = result.provider; form.elements.base_url.value = result.base_url; form.elements.model.value = result.model; form.elements.api_key.value = ""; form.elements.clear_api_key.checked = false;
    status.textContent = result.has_api_key ? "Hay una clave guardada. Por seguridad no se muestra." : result.provider === "ollama" ? "No hay una clave guardada. Ollama local no necesita clave." : "Falta una clave API para probar este proveedor."; dialog("ai-settings-dialog");
  } catch (error) { status.textContent = error.message; }
});
$("#ai-settings-form").addEventListener("submit", async event => {
  event.preventDefault(); const form = event.currentTarget; const status = $("#ai-settings-status"); const values = Object.fromEntries(new FormData(form).entries()); values.clear_api_key = form.elements.clear_api_key.checked;
  status.textContent = "Guardando en el servidor…";
  try { const response = await fetch("/api/admin/ai-settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(values) }); const result = await response.json(); if (!response.ok) throw new Error(result.detail || "No se pudo guardar la configuración.");
    form.elements.api_key.value = ""; $("#dashboard-ai-status").textContent = `IA configurada con ${result.model}. Puedes probarla desde este panel.`; dialog("ai-settings-dialog", false); showToast("Configuración de IA guardada en el servidor.");
  } catch (error) { status.textContent = error.message; }
});
$("#ai-settings-form").elements.provider.addEventListener("change", event => {
  const form = $("#ai-settings-form"); const provider = event.currentTarget.value;
  if (provider === "gemini" && form.elements.base_url.value.includes("localhost:11434")) { form.elements.base_url.value = "https://generativelanguage.googleapis.com/v1beta/openai"; form.elements.model.value = "gemini-3.8-flash"; }
  if (provider === "ollama" && form.elements.base_url.value.includes("generativelanguage.googleapis.com")) { form.elements.base_url.value = "http://localhost:11434"; form.elements.model.value = "qwen3:4b"; }
});
$("#ai-test-button").addEventListener("click", async event => {
  const button = event.currentTarget; const form = $("#ai-settings-form"); const status = $("#ai-settings-status");
  const values = Object.fromEntries(new FormData(form).entries()); values.clear_api_key = form.elements.clear_api_key.checked;
  button.disabled = true; status.textContent = "Probando proveedor y modelo…";
  try {
    const response = await fetch("/api/admin/ai-test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(values) }); const result = await response.json();
    if (!response.ok) throw new Error(result.detail || "No se pudo probar la conexión.");
    status.textContent = `Conexión correcta con ${result.model}. Respuesta: “${result.message}”. Ahora puedes guardar la configuración.`;
  } catch (error) { status.textContent = error.message; }
  finally { button.disabled = false; }
});
$("#nav-plan").addEventListener("click", openSubscriptionDialog);
$("#nav-auth").addEventListener("click", () => dialog("auth-dialog"));
$("#profile-menu").addEventListener("click", () => {
  const form = $("#account-form");
  form.elements.first_name.value = currentUser?.first_name || "";
  form.elements.business.value = state.profile?.business || "";
  form.elements.trade.value = currentUser?.trade || "";
  form.elements.logo_prompt.value = currentUser?.logo_prompt || "";
  $("#logo-profile").hidden = !currentUser?.features?.ai_logo;
    $("#profile-password-button").hidden = currentUser?.role === "admin";
  const logoPreview = $("#profile-logo-preview");
  logoPreview.hidden = !currentUser?.logo_file;
  if (currentUser?.logo_file) logoPreview.src = `/api/profile/logo?v=${Date.now()}`;
  dialog("account-dialog");
});
$("#profile-quotes-button").addEventListener("click", () => { dialog("account-dialog", false); openQuoteLibrary(); });
$("#profile-plan-button").addEventListener("click", () => { dialog("account-dialog", false); openSubscriptionDialog(); });
$("#profile-opportunities-button").addEventListener("click", () => { dialog("account-dialog", false); $("#opportunity-results").innerHTML = ""; $("#opportunity-message").textContent = ""; $("#opportunity-quota").textContent = "Hasta 3 búsquedas al día."; dialog("opportunity-dialog"); });
$("#search-opportunities").addEventListener("click", async event => {
  const button = event.currentTarget; const message = $("#opportunity-message"); const results = $("#opportunity-results");
  button.disabled = true; message.textContent = "Buscando páginas recientes para tu oficio en Medellín y el Valle de Aburrá…"; results.innerHTML = "";
  try {
    const response = await fetch("/api/opportunities/search", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ extra_terms: $("#opportunity-terms").value.trim() }) });
    const data = await response.json(); if (!response.ok) throw new Error(data.detail || "No se pudo buscar.");
    message.textContent = data.summary || "No hay resultados recientes verificables.";
    $("#opportunity-quota").textContent = `Te quedan ${data.remaining_today} búsquedas hoy.`;
    results.innerHTML = (data.sources || []).map(source => `<a class="opportunity-result" href="${esc(source.url)}" target="_blank" rel="noopener noreferrer"><span class="opportunity-result-title">${esc(source.title)}</span><span class="muted">Abrir fuente en una pestaña nueva ↗</span></a>`).join("") || `<p class="muted">No se encontraron enlaces directos verificables en esta búsqueda. Intenta con un término más específico.</p>`;
  } catch (error) { message.textContent = error.message; }
  finally { button.disabled = false; }
});
$("#profile-password-button").addEventListener("click", async () => {
  const password = window.prompt("Escribe tu nueva contraseña (mínimo 8 caracteres):");
  if (password === null) return;
  if (password.length < 8) { showToast("La contraseña debe tener al menos 8 caracteres."); return; }
  try { const response = await fetch("/api/auth/password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) }); const result = await response.json(); if (!response.ok) throw new Error(result.detail || "No se pudo cambiar la contraseña."); showToast("Contraseña actualizada."); }
  catch (error) { showToast(error.message); }
});
$("#account-form").addEventListener("submit", event => {
  event.preventDefault();
  const values = Object.fromEntries(new FormData(event.currentTarget).entries());
  fetch("/api/profile", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(values) }).then(async response => {
    const result = await response.json();
    if (!response.ok) throw new Error(result.detail || "No se pudo guardar el perfil.");
    currentUser = result;
    state.profile = { name: result.first_name, business: result.business || "", trade: result.trade };
    saveState(false); render(); dialog("account-dialog", false); showToast(`¡${result.first_name}, tu perfil quedó listo!`);
  }).catch(error => showToast(error.message));
});
$("#auth-login-form").addEventListener("submit", event => { event.preventDefault(); submitAuth("/api/auth/login", event.currentTarget, "#login-message"); });
$("#auth-register-form").addEventListener("submit", event => { event.preventDefault(); submitAuth("/api/auth/register", event.currentTarget, "#register-message"); });
$("#show-register").addEventListener("click", () => { $("#auth-login-panel").hidden = true; $("#auth-register-panel").hidden = false; });
$("#back-login").addEventListener("click", () => { $("#auth-register-panel").hidden = true; $("#auth-login-panel").hidden = false; });
$("#cancel-register").addEventListener("click", () => { $("#auth-register-panel").hidden = true; $("#auth-login-panel").hidden = false; });
async function openReceiptPreview(userId) {
  try {
    const response = await fetch(`/api/admin/accounts/${encodeURIComponent(userId)}/receipt`);
    const receipt = await response.json();
    if (!response.ok) throw new Error(receipt.detail || "No se pudo preparar el comprobante.");
    receiptTargetId = userId;
    $("#receipt-preview").textContent = [
      "COMPROBANTE INFORMATIVO DE SUSCRIPCIÓN · COTIZAFÁCIL",
      `Técnico: ${receipt.first_name} (@${receipt.username})`,
      `Correo: ${receipt.email}`,
      `Oficio: ${receipt.trade}`,
      `Concepto: Suscripción por ${receipt.period}`,
      `Valor: ${money(receipt.price_cop)}`,
      `Vigencia: ${receipt.start_date} al ${receipt.expiry_date}`,
      `Referencia de pago: ${receipt.reference || "No indicada"}`,
    ].join("\n");
    dialog("receipt-dialog");
  } catch (error) { showToast(error.message); }
}
$("#send-receipt").addEventListener("click", async event => {
  if (!receiptTargetId) return;
  const button = event.currentTarget;
  button.disabled = true;
  try {
    const response = await fetch(`/api/admin/accounts/${encodeURIComponent(receiptTargetId)}/receipt`, { method: "POST" });
    const result = await response.json();
    if (!response.ok) throw new Error(result.detail || "No se pudo enviar el comprobante.");
    dialog("receipt-dialog", false); showToast(result.message); openAdminPanel();
  } catch (error) { showToast(error.message); }
  finally { button.disabled = false; }
});
$("#payment-portal-form").addEventListener("submit", event => {
  event.preventDefault();
  const file = event.currentTarget.elements.proof.files[0];
  if (!file) { $("#payment-portal-message").textContent = "Adjunta la captura del pago antes de continuar."; return; }
  if (file.size > 5_000_000 || !["image/png", "image/jpeg"].includes(file.type)) { $("#payment-portal-message").textContent = "La captura debe ser PNG o JPG y pesar máximo 5 MB."; return; }
  dialog("payment-confirm-dialog");
});
$("#confirm-payment-yes").addEventListener("click", async event => {
  const button = event.currentTarget; button.disabled = true;
  const form = $("#payment-portal-form"); const file = form.elements.proof.files[0];
  try {
    const proof_data_url = await fileAsDataUrl(file);
    const values = new FormData(form);
    $("#payment-portal-message").textContent = "Enviando comprobante…";
    const response = await fetch("/api/subscription/request", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: values.get("email"), payment_reference: values.get("payment_reference"), proof_data_url }) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.detail || "No se pudo enviar la solicitud.");
    currentUser.subscription_request = result.status === "pending" ? "pending" : "none";
    currentUser.email = values.get("email");
    $("#payment-portal-message").textContent = result.status === "pending" && !result.email_sent ? `${result.message} El aviso quedó en el panel; configura el correo saliente para recibirlo por email.` : result.message || "Tu plan ya está activo.";
    $("#request-activation-button").disabled = true;
    form.elements.email.disabled = true; form.elements.payment_reference.disabled = true; form.elements.proof.disabled = true;
    dialog("payment-confirm-dialog", false);
    renderProfile();
  } catch (error) { $("#payment-portal-message").textContent = error.message; }
  finally { button.disabled = false; }
});
$("#logout-button").addEventListener("click", async () => {
  await fetch("/api/auth/logout", { method: "POST" });
  currentUser = null; state = loadState(); dialog("account-dialog", false); dialog("auth-dialog");
});
$("#generate-logo").addEventListener("click", async () => {
  const form = $("#account-form");
  const prompt = [`Nombre de marca: ${form.elements.business.value.trim() || form.elements.first_name.value.trim()}`, `Oficio: ${form.elements.trade.value.trim()}`, form.elements.logo_prompt.value.trim()].filter(Boolean).join(". ");
  const message = $("#logo-message");
  if (form.elements.logo_prompt.value.trim().length < 5) { message.textContent = "Escribe una instrucción para orientar el diseño."; return; }
  message.textContent = "Creando tu logotipo. Puede tardar un momento…";
  const button = $("#generate-logo"); button.disabled = true;
  try {
    const response = await fetch("/api/profile/logo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt }) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.detail || "No se pudo crear el logotipo.");
    const image = $("#profile-logo-preview"); image.src = `${result.logo_url}?v=${Date.now()}`; image.hidden = false;
    currentUser.logo_file = true;
    message.textContent = "Listo. El logotipo aparecerá en las cotizaciones que descargues.";
  } catch (error) { message.textContent = error.message; }
  finally { button.disabled = false; }
});
$("#admin-users-list").addEventListener("change", async event => {
  const input = event.target.closest("input[data-feature]"); if (!input) return;
  try {
    const response = await fetch(`/api/admin/accounts/${encodeURIComponent(input.dataset.user)}/feature`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ feature: input.dataset.feature, enabled: input.checked }) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.detail || "No se pudo actualizar la función.");
    showToast("Función actualizada para el técnico.");
  } catch (error) { input.checked = !input.checked; showToast(error.message); }
});
$("#admin-users-list").addEventListener("click", async event => {
  const resetButton = event.target.closest("[data-reset-password]");
  if (resetButton) {
    const password = window.prompt("Escribe una contraseña temporal (mínimo 8 caracteres):");
    if (password === null) return;
    if (password.length < 8) { showToast("La contraseña debe tener al menos 8 caracteres."); return; }
    try { const response = await fetch(`/api/admin/accounts/${encodeURIComponent(resetButton.dataset.resetPassword)}/password`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) }); const result = await response.json(); if (!response.ok) throw new Error(result.detail || "No se pudo restablecer la contraseña."); showToast("Contraseña restablecida."); }
    catch (error) { showToast(error.message); }
    return;
  }
  const proofButton = event.target.closest("[data-proof-user]");
  if (proofButton) { $("#payment-proof-image").src = `/api/admin/accounts/${encodeURIComponent(proofButton.dataset.proofUser)}/payment-proof?v=${Date.now()}`; dialog("proof-viewer-dialog"); return; }
  const receiptButton = event.target.closest("[data-receipt-user]");
  if (receiptButton) { await openReceiptPreview(receiptButton.dataset.receiptUser); return; }
  const cancelRenewalButton = event.target.closest("[data-cancel-renewal]");
  if (cancelRenewalButton) { renewalCancelUserId = cancelRenewalButton.dataset.cancelRenewal; $("#renewal-cancel-form").reset(); $("#renewal-cancel-message").textContent = ""; dialog("renewal-cancel-dialog"); return; }
  const button = event.target.closest("[data-admin-action]"); if (!button) return;
  if (["cancel_subscription", "cancel_access"].includes(button.dataset.adminAction) && !window.confirm(button.dataset.adminAction === "cancel_access" ? "¿Cancelar todo el acceso de este técnico al portal?" : "¿Cancelar su suscripción ahora y dejar la cuenta en el plan gratis?")) return;
  button.disabled = true;
  try {
    const response = await fetch(`/api/admin/accounts/${encodeURIComponent(button.dataset.user)}/action`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: button.dataset.adminAction }) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.detail || "No se pudo actualizar la cuenta.");
    showToast("Cuenta actualizada."); openAdminPanel();
    refreshNotifications();
  } catch (error) { button.disabled = false; showToast(error.message); }
});
$("#renewal-cancel-form").addEventListener("submit", async event => {
  event.preventDefault(); if (!renewalCancelUserId) return;
  const form = event.currentTarget; const values = Object.fromEntries(new FormData(form).entries()); const message = $("#renewal-cancel-message"); message.textContent = "Guardando cancelación…";
  try {
    const response = await fetch(`/api/admin/accounts/${encodeURIComponent(renewalCancelUserId)}/renewal/cancel`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(values) });
    const result = await response.json(); if (!response.ok) throw new Error(result.detail || "No se pudo cancelar la continuidad.");
    dialog("renewal-cancel-dialog", false); showToast(result.email_sent ? "Continuidad cancelada y aviso enviado por correo." : "Continuidad cancelada; aviso web enviado. Revisa la configuración del correo."); renewalCancelUserId = null; openAdminPanel(); refreshNotifications();
  } catch (error) { message.textContent = error.message; }
});
$("#audit-date-from").addEventListener("input", renderAdminAudit);
$("#audit-date-to").addEventListener("input", renderAdminAudit);
$("#audit-search").addEventListener("input", renderAdminAudit);
$("#audit-clear-filters").addEventListener("click", () => { $("#audit-date-from").value = ""; $("#audit-date-to").value = ""; $("#audit-search").value = ""; renderAdminAudit(); });
$("#help-open").addEventListener("click", () => { renderContactLinks(); dialog("help-dialog"); });
$("#contact-settings-form").addEventListener("submit", async event => {
  event.preventDefault(); const form = event.currentTarget; const message = $("#contact-settings-message"); const payload = Object.fromEntries(new FormData(form).entries()); message.textContent = "Guardando cambios…";
  try { const response = await fetch("/api/admin/contact-settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }); const result = await response.json(); if (!response.ok) throw new Error(result.detail || "No se pudieron guardar los datos."); contactSettings = result; renderContactLinks(); dialog("contact-settings-dialog", false); showToast("Contacto actualizado en la app."); }
  catch (error) { message.textContent = error.message; }
});
$("#payment-settings-form").addEventListener("submit", async event => {
  event.preventDefault(); const form = event.currentTarget; const values = new FormData(form); const message = $("#payment-settings-message"); message.textContent = "Guardando…";
  try {
    const qrFile = form.elements.qr_file.files[0];
    const payload = Object.fromEntries(["account_holder", "bank_name", "account_type", "account_number", "payment_key", "transfer_instructions"].map(key => [key, values.get(key)]));
    payload.remove_qr = form.elements.remove_qr.checked;
    if (qrFile) { if (qrFile.size > 5_000_000 || !["image/png", "image/jpeg"].includes(qrFile.type)) throw new Error("El QR debe ser PNG o JPG y pesar máximo 5 MB."); payload.qr_data_url = await fileAsDataUrl(qrFile); }
    const response = await fetch("/api/admin/payment-settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }); const result = await response.json();
    if (!response.ok) throw new Error(result.detail || "No se pudieron guardar los datos.");
    form.elements.qr_file.value = ""; form.elements.remove_qr.checked = false; dialog("payment-settings-dialog", false); showToast(result.has_qr ? "Datos de pago y QR opcional actualizados." : "Datos de pago actualizados; no se mostrará QR.");
  } catch (error) { message.textContent = error.message; }
});
$("#quote-library-list").addEventListener("click", event => {
  const button = event.target.closest("[data-library-action]"); if (!button) return;
  const job = state.jobs.find(item => item.id === button.dataset.job); const quote = job?.quotes.find(item => item.id === button.dataset.quote); if (!job || !quote) return;
  if (button.dataset.libraryAction === "edit") { dialog("quote-library-dialog", false); beginQuote(job); }
  else if (button.dataset.libraryAction === "share") { dialog("quote-library-dialog", false); openShare(job, quote.id); }
  else if (button.dataset.libraryAction === "delete" && window.confirm(`¿Eliminar “${quote.name || job.title}”? Esta acción no se puede deshacer.`)) { job.quotes = job.quotes.filter(item => item.id !== quote.id); saveState(); render(); renderQuoteLibrary(); showToast("Cotización eliminada."); }
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
$("#add-option").addEventListener("click", () => {
  const job = state.jobs.find(item => item.id === activeJobId);
  const projectedCount = job ? savedQuoteCount() - job.quotes.length + $$(".quote-option", $("#quote-options")).length : savedQuoteCount();
  if (currentUser?.role !== "admin" && currentUser?.plan_status !== "subscribed" && projectedCount >= (currentUser?.quote_limit || 2)) { explainQuoteLimit(); return; }
  addQuoteOption();
});
$("#ai-scope").addEventListener("input", event => { const hasText = event.currentTarget.value.trim().length >= 5; $("#ai-confirm-field").hidden = !hasText; $("#ai-requirement-confirm").checked = false; });
$("#ai-requirement-confirm").addEventListener("change", event => { if (event.currentTarget.checked) suggestOptionsWithAI(); });
$("#quote-options").addEventListener("click", event => {
  const button = event.target.closest("[data-option-share]");
  if (button) saveAndShareQuote(button.closest(".quote-option").dataset.quoteId);
});
$("#quote-form").addEventListener("submit", saveQuotes);
$("#job-list").addEventListener("click", event => {
  const button = event.target.closest("[data-action]"); if (!button) return;
  const job = state.jobs.find(j => j.id === button.dataset.id); if (!job) return;
  if (button.dataset.action === "quotes") beginQuote(job); else openShare(job);
});
$("#job-list").addEventListener("dblclick", event => { const row = event.target.closest(".job-row"); if (!row) return; const job = state.jobs.find(j => j.id === row.dataset.id); if (job) { job.status = job.status === "Finalizado" ? "En proceso" : "Finalizado"; saveState(); render(); showToast(`Trabajo marcado como ${job.status.toLowerCase()}.`); } });
$("#search").addEventListener("input", render);
$(".filters").addEventListener("click", event => { const button = event.target.closest("[data-filter]"); if (!button) return; selectedFilter = button.dataset.filter; selectedMetricFilter = null; render(); });
$("#view-all, #filtered-view-all").addEventListener("click", () => { selectedFilter = "Todos"; selectedMetricFilter = null; render(); $("#trabajos").scrollIntoView({ behavior: "smooth" }); });
$("#technician-overview").addEventListener("click", event => { const card = event.target.closest("[data-tech-metric]"); if (!card) return; selectedFilter = "Todos"; selectedMetricFilter = card.dataset.techMetric; render(); $("#trabajos").scrollIntoView({ behavior: "smooth", block: "start" }); });
$(".share-channels").addEventListener("click", event => { const button = event.target.closest("[data-channel]"); if (button) handleShare(button.dataset.channel); });
$("#download-quote").addEventListener("click", downloadQuoteFile);
$$("[data-close]").forEach(button => button.addEventListener("click", () => dialog(button.dataset.close, false)));
$$("dialog").forEach(el => el.addEventListener("click", event => { if (event.target === el && el.id !== "auth-dialog") el.close(); }));
refreshContactSettings();
initializeSession();
setInterval(async () => {
  if (!currentUser || currentUser.role === "admin") return;
  try {
    const response = await fetch("/api/auth/me");
    if (!response.ok) return;
    const updated = await response.json();
    if (currentUser.plan_status !== "subscribed" && updated.plan_status === "subscribed") showToast(`¡${updated.first_name}! Ya está activo tu plan por 30 días.`);
    currentUser = updated;
    renderProfile();
  } catch { /* la sesión se actualizará cuando vuelva la conexión */ }
}, 60000);
setInterval(refreshNotifications, 15000);

setInterval(refreshContactSettings, 60000);
