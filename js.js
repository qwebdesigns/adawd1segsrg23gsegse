// ===== CONFIG =====
const API_BASE = "https://gammahub.tech/sdb/api/";
const SESSION_KEY = "kb:session:v2";
const PALETTE = ["#7c3aed", "#a21caf", "#9333ea", "#6d28d9", "#8b5cf6", "#c026d3", "#7e22ce", "#a855f7"];
const EMOJIS = ["😀", "😃", "😄", "😁", "😊", "🙂", "😉", "😍", "😎", "🤔", "😅", "😂", "🙃", "😇", "🥳", "😴", "👍", "👎", "👌", "👏", "🙏", "🤝", "💪", "✋", "👋", "❤️", "🔥", "⭐", "✅", "❌", "⚠️", "❗", "❓", "💡", "📌", "📝", "📅", "📞", "💬", "📦", "💳", "💰", "🎉", "✨", "🚀", "🔑", "⏰", "📍"];
const ROLES = {
    viewer: {
        label: "Просмотр"
    },
    editor: {
        label: "Редактирование"
    },
    admin: {
        label: "Администратор"
    }
};

// ===== STATE =====
let token = null,
    currentUser = null;
let sections = [],
    categoriesBySection = {},
    articlesByCategory = {};
let fullArticle = null,
    users = [];
let curSection = null,
    curCategory = null;
let editingPage = null; // null = new, object = existing
let dragIdx = null;
let newUserRole = "viewer";
let modalCallback = null;
let editorSavedRange = null;
let tableHover = {
    r: 0,
    c: 0
};

// ===== HELPERS =====
function parseTs(str) {
    if (!str) return Date.now();
    const t = Date.parse(String(str).replace(" ", "T"));
    return isNaN(t) ? Date.now() : t;
}

function timeAgo(ts) {
    const diff = Date.now() - ts;
    const m = Math.floor(diff / 60000),
        h = Math.floor(diff / 3600000),
        d = Math.floor(diff / 86400000);
    if (d > 0) return `${d} дн. назад`;
    if (h > 0) return `${h} ч. назад`;
    if (m > 0) return `${m} мин. назад`;
    return "только что";
}

function svgFolder(color = "currentColor", size = 16) {
    return `<svg width="${size}" height="${size}" fill="none" stroke="${color}" stroke-width="2" viewBox="0 0 24 24"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>`;
}

function svgFile(size = 16) {
    return `<svg width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`;
}

function svgChevRight() {
    return `<svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>`;
}

function svgHome() {
    return `<svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`;
}

function svgGrip() {
    return `<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><line x1="8" y1="6" x2="8" y2="6"/><line x1="8" y1="12" x2="8" y2="12"/><line x1="8" y1="18" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="6"/><line x1="16" y1="12" x2="16" y2="12"/><line x1="16" y1="18" x2="16" y2="18"/></svg>`;
}

function escape(s) {
    return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ===== API =====
async function request(path, opts = {}) {
    const headers = {};
    if (token) headers["Authorization"] = "Bearer " + token;
    if (opts.body) headers["Content-Type"] = "application/json";
    let res;
    try {
        res = await fetch(API_BASE + path, {
            method: opts.method || "GET",
            headers,
            body: opts.body ? JSON.stringify(opts.body) : undefined
        });
    } catch {
        const e = new Error("Не удалось связаться с сервером (проверьте CORS и адрес API)");
        e.network = true;
        throw e;
    }
    let data = null;
    try {
        data = await res.json();
    } catch {}
    if (res.status === 401 || res.status === 403) {
        doLogout();
        const e = new Error(data ?.error || "Сессия истекла");
        e.auth = true;
        throw e;
    }
    if (!res.ok) throw new Error(data ?.error || ("Ошибка " + res.status));
    return data;
}

// ===== SESSION =====
async function bootSession() {
    try {
        const rs = await window.storage.get(SESSION_KEY);
        if (rs) {
            const s = JSON.parse(rs.value);
            if (s.token && s.user) {
                token = s.token;
                currentUser = s.user;
            }
        }
    } catch {}
    if (currentUser) {
        showApp();
        await loadSections();
    } else showLogin();
}

function doLogout() {
    token = null;
    currentUser = null;
    sections = [];
    categoriesBySection = {};
    articlesByCategory = {};
    users = [];
    fullArticle = null;
    try {
        window.storage.delete(SESSION_KEY);
    } catch {}
    showLogin();
}

// ===== VIEWS =====
const VIEWS = ["home", "section", "category", "page", "editor", "search", "admin"];

function showView(name) {
    VIEWS.forEach(v => {
        const el = document.getElementById("view-" + v);
        if (el) el.classList.toggle("active", v === name);
    });
}

function showLogin() {
    document.getElementById("login-screen").classList.add("active");
    document.getElementById("app-shell").classList.add("hidden");
    document.getElementById("app-shell").classList.remove("flex");
}

function showApp() {
    document.getElementById("login-screen").classList.remove("active");
    document.getElementById("app-shell").classList.remove("hidden");
    document.getElementById("app-shell").classList.add("flex");
    updateHeaderUser();
    showView("home");
}

function updateHeaderUser() {
    if (!currentUser) return;
    const name = currentUser.name || currentUser.email || "U";
    document.getElementById("header-avatar").textContent = name[0].toUpperCase();
    document.getElementById("header-name").textContent = name;
    document.getElementById("header-role").textContent = ROLES[currentUser.role] ?.label || currentUser.role;
    const isAdmin = currentUser.role === "admin";
    const canEdit = currentUser.role === "editor" || isAdmin;
    document.getElementById("btn-admin").classList.toggle("hidden", !isAdmin);
    document.getElementById("btn-add-section").classList.toggle("hidden", !canEdit);
}

function canEdit() {
    return currentUser ?.role === "editor" || currentUser ?.role === "admin";
}

function isAdmin() {
    return currentUser ?.role === "admin";
}

// ===== ERROR =====
function showError(msg) {
    document.getElementById("error-text").textContent = msg;
    document.getElementById("error-banner").style.display = "flex";
}

function clearError() {
    document.getElementById("error-banner").style.display = "none";
}

// ===== MODAL =====
function openModal(title, text, cb) {
    document.getElementById("modal-title").textContent = title;
    document.getElementById("modal-text").textContent = text + " Действие нельзя отменить.";
    document.getElementById("modal").classList.remove("hidden");
    modalCallback = cb;
}

function closeModal() {
    document.getElementById("modal").classList.add("hidden");
    modalCallback = null;
}

// ===== HOME =====
function normSections(data) {
    return (data || []).map(s => ({
        id: s.id,
        name: s.name,
        iconKey: s.icon_key || "folder",
        color: s.color || "#7c3aed",
        desc: s.description || "",
        position: s.position || 0
    })).sort((a, b) => a.position - b.position);
}

async function loadSections() {
    const grid = document.getElementById("sections-grid");
    const spin = document.getElementById("home-spinner");
    grid.innerHTML = "";
    spin.classList.remove("hidden");
    try {
        const data = await request("sections.php");
        sections = normSections(data);
    } catch (e) {
        if (!e.auth) showError(e.message);
    }
    spin.classList.add("hidden");
    renderSectionsGrid();
}

function renderSectionsGrid() {
    const grid = document.getElementById("sections-grid");
    const edit = canEdit();
    grid.innerHTML = "";
    sections.forEach((sec, idx) => {
        const div = document.createElement("div");
        div.className = "section-card";
        div.draggable = edit;
        div.dataset.idx = idx;
        div.innerHTML = `
      ${edit ? `<div class="drag-handle" title="Перетащите">${svgGrip()}</div>` : ""}
      <div class="section-icon-wrap" style="background:${sec.color}26">${svgFolder(sec.color, 20)}</div>
      <h3>${escape(sec.name)}</h3>
      <p>${escape(sec.desc)}</p>
    `;
        div.addEventListener("click", () => goSection(sec.id));
        if (edit) {
            div.addEventListener("dragstart", () => {
                dragIdx = idx;
                div.classList.add("drag-over");
            });
            div.addEventListener("dragend", () => {
                div.classList.remove("drag-over");
                dragIdx = null;
            });
            div.addEventListener("dragover", e => {
                e.preventDefault();
                if (dragIdx !== null && dragIdx !== idx) {
                    moveSection(dragIdx, idx);
                }
            });
        }
        grid.appendChild(div);
    });
    if (edit) {
        const btn = document.createElement("button");
        btn.className = "btn-dashed";
        btn.innerHTML = `<svg width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>Добавить раздел`;
        btn.addEventListener("click", () => {
            document.getElementById("add-section-row").classList.remove("hidden");
            document.getElementById("new-section-name").focus();
        });
        grid.appendChild(btn);
    }
}

async function moveSection(from, to) {
    if (from === to || from == null || to == null) return;
    const next = [...sections];
    const [m] = next.splice(from, 1);
    next.splice(to, 0, m);
    sections = next;
    renderSectionsGrid();
    try {
        await request("sections_reorder.php", {
            method: "PUT",
            body: {
                order: next.map(s => s.id)
            }
        });
    } catch (e) {
        if (!e.auth) {
            showError(e.message);
            loadSections();
        }
    }
}

async function addSection(name) {
    document.getElementById("add-section-row").classList.add("hidden");
    document.getElementById("new-section-name").value = "";
    try {
        await request("sections.php", {
            method: "POST",
            body: {
                name,
                icon_key: "folder",
                color: PALETTE[sections.length % PALETTE.length],
                description: "Свой раздел",
                position: sections.length
            }
        });
        await loadSections();
    } catch (e) {
        if (!e.auth) showError(e.message);
    }
}

// ===== SECTION =====
async function goSection(id) {
    clearError();
    curSection = id;
    showView("section");
    const sec = sections.find(s => s.id === id);
    if (!sec) return;

    // breadcrumbs
    const bc = document.getElementById("bc-section");
    bc.innerHTML = `<button id="bc-sec-home" class="flex items-center gap-1">${svgHome()} Главная</button><span class="sep">›</span><span class="crumb-current">${escape(sec.name)}</span>`;
    document.getElementById("bc-sec-home").onclick = goHome;

    // header
    document.getElementById("sec-icon-wrap").style.background = sec.color + "1a";
    document.getElementById("sec-icon-wrap").innerHTML = svgFolder(sec.color, 22);
    document.getElementById("sec-title").textContent = sec.name;
    document.getElementById("sec-desc").textContent = sec.desc;
    document.getElementById("sec-actions").classList.toggle("hidden", !canEdit());
    document.getElementById("sec-spinner").classList.remove("hidden");
    document.getElementById("categories-list").innerHTML = "";
    document.getElementById("sec-empty").classList.add("hidden");

    try {
        const cats = await ensureCategories(id);
        await Promise.all(cats.map(c => ensureArticles(c.id)));
    } catch (e) {
        if (!e.auth) showError(e.message);
    }

    document.getElementById("sec-spinner").classList.add("hidden");
    renderCategoriesList();
}

function renderCategoriesList() {
    const sec = sections.find(s => s.id === curSection);
    const cats = categoriesBySection[curSection] || [];
    const list = document.getElementById("categories-list");
    list.innerHTML = "";

    if (cats.length === 0) {
        document.getElementById("sec-empty").classList.remove("hidden");
        document.getElementById("sec-empty-text").textContent = "В этом разделе пока нет категорий." + (canEdit() ? " Нажмите «Добавить категорию»." : "");
        return;
    }
    document.getElementById("sec-empty").classList.add("hidden");

    cats.forEach(cat => {
        const arts = articlesByCategory[cat.id] || [];
        const group = document.createElement("div");
        group.className = "cat-group";
        group.innerHTML = `
      <div class="cat-group-header">
        <button class="collapse-btn" data-catid="${cat.id}">
          <svg class="chevron-down" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>
        </button>
        ${svgFolder(sec?.color || "#7c3aed", 16)}
        <button class="cat-title-btn">${escape(cat.name)}</button>
        <span class="cat-count">${arts.length}</span>
        <button class="cat-open-btn">Открыть ${svgChevRight()}</button>
      </div>
      <div class="cat-group-body">
        <div class="articles-grid cat-articles-grid" data-catid="${cat.id}"></div>
        <p class="cat-empty-msg text-sm text-slate-500 hidden">В категории пока нет статей.</p>
      </div>
    `;

        // populate articles
        const artGrid = group.querySelector(".cat-articles-grid");
        const emptyMsg = group.querySelector(".cat-empty-msg");
        if (arts.length === 0) {
            artGrid.classList.add("hidden");
            emptyMsg.classList.remove("hidden");
        } else {
            arts.forEach(p => artGrid.appendChild(makeArticleCard(p)));
        }

        // toggle collapse
        const colBtn = group.querySelector(".collapse-btn");
        const body = group.querySelector(".cat-group-body");
        const chevron = group.querySelector(".chevron-down");
        let collapsed = false;
        colBtn.onclick = () => {
            collapsed = !collapsed;
            body.style.display = collapsed ? "none" : "";
            chevron.style.transform = collapsed ? "rotate(-90deg)" : "";
        };

        group.querySelector(".cat-title-btn").onclick = () => goCategory(cat.id);
        group.querySelector(".cat-open-btn").onclick = () => goCategory(cat.id);

        list.appendChild(group);
    });
}

// ===== CATEGORY =====
async function goCategory(id) {
    clearError();
    curCategory = id;
    showView("category");
    // find section for this category
    let cat = null;
    for (const k in categoriesBySection) {
        const f = categoriesBySection[k].find(c => c.id === id);
        if (f) {
            cat = f;
            curSection = Number(k) || k;
            break;
        }
    }
    const sec = sections.find(s => s.id === (cat ?.section_id || curSection));

    const arts = await ensureArticles(id).catch(e => {
        if (!e.auth) showError(e.message);
        return [];
    });

    // breadcrumbs
    const bc = document.getElementById("bc-cat");
    bc.innerHTML = `<button id="bc-cat-home" class="flex items-center gap-1">${svgHome()} Главная</button><span class="sep">›</span><button id="bc-cat-sec">${escape(sec?.name || "Раздел")}</button><span class="sep">›</span><span class="crumb-current">${escape(cat?.name || "Категория")}</span>`;
    document.getElementById("bc-cat-home").onclick = goHome;
    document.getElementById("bc-cat-sec").addEventListener("click", () => goSection(sec ?.id || curSection));

    // header
    document.getElementById("cat-icon-wrap").style.background = (sec ?.color || "#7c3aed") + "1a";
    document.getElementById("cat-icon-wrap").innerHTML = svgFolder(sec ?.color || "#7c3aed", 22);
    document.getElementById("cat-title").textContent = cat ?.name || "Категория";
    document.getElementById("cat-subtitle").textContent = (sec ?.name || "") + " · " + arts.length + " статей";
    document.getElementById("cat-actions").classList.toggle("hidden", !canEdit());

    const grid = document.getElementById("cat-articles-grid");
    const empty = document.getElementById("cat-empty");
    grid.innerHTML = "";
    if (arts.length === 0) {
        empty.classList.remove("hidden");
        document.getElementById("cat-empty-text").textContent = "В этой категории пока нет статей." + (canEdit() ? " Нажмите «Добавить статью»." : "");
        return;
    }
    empty.classList.add("hidden");
    arts.forEach(p => grid.appendChild(makeArticleCard(p)));
}

// ===== PAGE =====
async function openPage(id) {
    clearError();
    showView("page");
    document.getElementById("page-spinner").classList.remove("hidden");
    document.getElementById("page-content").classList.add("hidden");
    fullArticle = null;

    try {
        const a = await request(`article.php?id=${id}`);
        fullArticle = {
            id: a.id,
            title: a.title,
            content: a.content || "",
            author: a.author_name,
            categoryId: a.category_id,
            section: a.section_id,
            tags: a.tags || [],
            updatedAt: parseTs(a.updated_at)
        };
        if (fullArticle.section) await ensureCategories(fullArticle.section).catch(() => {});
    } catch (e) {
        if (!e.auth) showError(e.message);
        document.getElementById("page-spinner").classList.add("hidden");
        return;
    }

    document.getElementById("page-spinner").classList.add("hidden");
    document.getElementById("page-content").classList.remove("hidden");

    const sec = sections.find(s => s.id === fullArticle.section);
    const cats = categoriesBySection[fullArticle.section] || [];
    const cat = cats.find(c => c.id === fullArticle.categoryId);

    // breadcrumbs
    const bc = document.getElementById("bc-page");
    bc.innerHTML = `<button id="bc-pg-home" class="flex items-center gap-1">${svgHome()} Главная</button><span class="sep">›</span><button id="bc-pg-sec">${escape(sec?.name || "Раздел")}</button><span class="sep">›</span><button id="bc-pg-cat">${escape(cat?.name || "Категория")}</button><span class="sep">›</span><span class="crumb-current">${escape(fullArticle.title)}</span>`;
    document.getElementById("bc-pg-home").onclick = goHome;
    document.getElementById("bc-pg-sec").onclick = () => goSection(fullArticle.section);
    document.getElementById("bc-pg-cat").onclick = () => goCategory(fullArticle.categoryId);

    document.getElementById("page-title").textContent = fullArticle.title;
    document.getElementById("page-edit-actions").classList.toggle("hidden", !canEdit());

    // meta
    const meta = document.getElementById("page-meta");
    let metaHtml = `<div class="meta-item">${svgFolder()} ${escape(cat?.name || "—")}</div>`;
    if (fullArticle.author) metaHtml += `<div class="meta-item"><svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> ${escape(fullArticle.author)}</div>`;
    metaHtml += `<div class="meta-item"><svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> обновлено ${timeAgo(fullArticle.updatedAt)}</div>`;
    if (fullArticle.tags ?.length) metaHtml += `<div class="tags-row">${fullArticle.tags.map(t => `<span class="tag">#${escape(t)}</span>`).join("")}</div>`;
    meta.innerHTML = metaHtml;

    document.getElementById("page-body").innerHTML = fullArticle.content;
}

// ===== EDITOR =====
function openEditor(pageObj, sectionId, categoryId) {
    editingPage = pageObj || null;
    curSection = sectionId || (pageObj ?.section) || curSection;
    curCategory = categoryId || (pageObj ?.categoryId) || curCategory;

    document.getElementById("editor-title").value = pageObj ?.title || "";
    document.getElementById("editor-tags").value = (pageObj ?.tags || []).join(", ");
    document.getElementById("editor-area").innerHTML = pageObj ?.content || "<p></p>";

    // populate category select
    const catSelect = document.getElementById("editor-cat");
    catSelect.innerHTML = "";
    const secId = pageObj ?.section || curSection;
    const cats = categoriesBySection[secId] || [];
    if (cats.length === 0) {
        catSelect.innerHTML = `<option value="">Нет категорий</option>`;
    } else {
        cats.forEach(c => {
            const opt = document.createElement("option");
            opt.value = c.id;
            opt.textContent = c.name;
            catSelect.appendChild(opt);
        });
    }
    catSelect.value = pageObj ?.categoryId || curCategory || (cats[0] ?.id || "");

    buildToolbar();
    showView("editor");
    updateEditorSaveBtn();
}

function updateEditorSaveBtn() {
    const title = document.getElementById("editor-title").value.trim();
    const cat = document.getElementById("editor-cat").value;
    const ok = title.length > 0 && !!cat;
    document.getElementById("btn-save-article").disabled = !ok;
    document.getElementById("editor-hint").classList.toggle("hidden", ok);
}

async function saveArticle() {
    const title = document.getElementById("editor-title").value.trim();
    const catId = document.getElementById("editor-cat").value;
    const tags = document.getElementById("editor-tags").value.split(",").map(t => t.trim()).filter(Boolean);
    const content = document.getElementById("editor-area").innerHTML;

    if (!title || !catId) return;
    document.getElementById("btn-save-article").disabled = true;
    document.getElementById("btn-save-article").innerHTML = `<div class="spin" style="width:16px;height:16px"></div> Сохранение…`;

    try {
        if (editingPage) {
            await request("articles.php", {
                method: "PUT",
                body: {
                    id: editingPage.id,
                    category_id: catId,
                    title,
                    content,
                    tags
                }
            });
            await ensureArticles(catId, true);
            const oldCat = editingPage.categoryId;
            if (oldCat && oldCat !== catId) await ensureArticles(oldCat, true);
            openPage(editingPage.id);
        } else {
            const r = await request("articles.php", {
                method: "POST",
                body: {
                    category_id: catId,
                    section_id: curSection,
                    title,
                    content,
                    tags
                }
            });
            await ensureArticles(catId, true);
            if (r ?.id) openPage(r.id);
            else {
                await goCategory(catId);
            }
        }
    } catch (e) {
        if (!e.auth) showError(e.message);
        document.getElementById("btn-save-article").disabled = false;
        document.getElementById("btn-save-article").innerHTML = `<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M19 21H5a2 2 0 0 0-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg> Сохранить`;
    }
}

// ===== TOOLBAR =====
function buildToolbar() {
    const tb = document.getElementById("toolbar");
    tb.innerHTML = "";
    const area = document.getElementById("editor-area");

    function exec(cmd, val) {
        area.focus();
        document.execCommand(cmd, false, val);
    }

    function makeBtn(title, svgContent, action) {
        const b = document.createElement("button");
        b.className = "tb-btn";
        b.title = title;
        b.type = "button";
        b.innerHTML = svgContent;
        b.addEventListener("mousedown", e => {
            e.preventDefault();
            action();
        });
        return b;
    }

    function makeSep() {
        const s = document.createElement("div");
        s.className = "tb-sep";
        return s;
    }

    function saveRange() {
        const sel = window.getSelection();
        if (sel && sel.rangeCount) editorSavedRange = sel.getRangeAt(0).cloneRange();
    }

    function restoreRange() {
        if (editorSavedRange) {
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(editorSavedRange);
        }
    }

    // H1
    tb.appendChild(makeBtn("Заголовок 1", `<svg width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M4 12h8"/><path d="M4 6v12"/><path d="M12 6v12"/><path d="M17 12l3-2v8"/></svg>`, () => exec("formatBlock", "<h1>")));
    tb.appendChild(makeBtn("Заголовок 2", `<svg width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M4 12h8"/><path d="M4 6v12"/><path d="M12 6v12"/><path d="M21 18H17a2 2 0 0 1 0-4c1.5 0 4 1 4 4v0z"/></svg>`, () => exec("formatBlock", "<h2>")));
    tb.appendChild(makeBtn("Заголовок 3", `<svg width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M4 12h8"/><path d="M4 6v12"/><path d="M12 6v12"/><path d="M18 7v3a2 2 0 0 1-2 2h0a2 2 0 0 1 2 2v1a2 2 0 0 1-4 0"/></svg>`, () => exec("formatBlock", "<h3>")));
    tb.appendChild(makeBtn("Обычный текст", `<svg width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><line x1="17" y1="10" x2="3" y2="10"/><line x1="21" y1="6" x2="3" y2="6"/><line x1="21" y1="14" x2="3" y2="14"/><line x1="17" y1="18" x2="3" y2="18"/></svg>`, () => {
        exec("formatBlock", "<p>");
        exec("foreColor", "#334155");
    }));
    tb.appendChild(makeSep());

    // Bold / Italic / Underline
    tb.appendChild(makeBtn("Жирный", `<svg width="17" height="17" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path d="M6 4h8a4 4 0 0 1 0 8H6z"/><path d="M6 12h9a4.5 4.5 0 0 1 0 9H6z"/></svg>`, () => exec("bold")));
    tb.appendChild(makeBtn("Курсив", `<svg width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><line x1="19" y1="4" x2="10" y2="4"/><line x1="14" y1="20" x2="5" y2="20"/><line x1="15" y1="4" x2="9" y2="20"/></svg>`, () => exec("italic")));
    tb.appendChild(makeBtn("Подчёркнутый", `<svg width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M6 3v7a6 6 0 0 0 12 0V3"/><line x1="4" y1="21" x2="20" y2="21"/></svg>`, () => exec("underline")));
    tb.appendChild(makeSep());

    // Lists / Quote / Code
    tb.appendChild(makeBtn("Маркированный список", `<svg width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><line x1="9" y1="6" x2="20" y2="6"/><line x1="9" y1="12" x2="20" y2="12"/><line x1="9" y1="18" x2="20" y2="18"/><circle cx="4" cy="6" r="1" fill="currentColor"/><circle cx="4" cy="12" r="1" fill="currentColor"/><circle cx="4" cy="18" r="1" fill="currentColor"/></svg>`, () => exec("insertUnorderedList")));
    tb.appendChild(makeBtn("Нумерованный список", `<svg width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><line x1="10" y1="6" x2="21" y2="6"/><line x1="10" y1="12" x2="21" y2="12"/><line x1="10" y1="18" x2="21" y2="18"/><path d="M4 6h1v4"/><path d="M4 10h2"/><path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1"/></svg>`, () => exec("insertOrderedList")));
    tb.appendChild(makeBtn("Цитата", `<svg width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z"/><path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3c0 1 0 1 1 1z"/></svg>`, () => exec("formatBlock", "<blockquote>")));
    tb.appendChild(makeBtn("Блок кода", `<svg width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>`, () => exec("formatBlock", "<pre>")));
    tb.appendChild(makeSep());

    // Font size dropdown
    const sizeWrap = document.createElement("div");
    sizeWrap.style.position = "relative";
    const sizeBtn = document.createElement("button");
    sizeBtn.className = "tb-btn flex items-center";
    sizeBtn.title = "Размер шрифта";
    sizeBtn.type = "button";
    sizeBtn.innerHTML = `<svg width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/></svg><svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="margin-left:2px"><polyline points="6 9 12 15 18 9"/></svg>`;
    const sizeMenu = document.createElement("div");
    sizeMenu.className = "tb-dropdown hidden";
    sizeMenu.style.cssText = "top:36px;left:0;min-width:140px";
    [
        ["Маленький", 2, "font-size:11px"],
        ["Обычный", 3, "font-size:13px"],
        ["Средний", 4, "font-size:15px"],
        ["Крупный", 5, "font-size:18px"],
        ["Большой", 6, "font-size:20px"]
    ].forEach(([l, v, s]) => {
        const item = document.createElement("button");
        item.className = "tb-dropdown-item";
        item.type = "button";
        item.style.cssText = s;
        item.textContent = l;
        item.addEventListener("mousedown", e => {
            e.preventDefault();
            exec("fontSize", v);
            sizeMenu.classList.add("hidden");
        });
        sizeMenu.appendChild(item);
    });
    sizeBtn.addEventListener("mousedown", e => {
        e.preventDefault();
        sizeMenu.classList.toggle("hidden");
        closeTbDropdowns(sizeMenu);
    });
    sizeWrap.appendChild(sizeBtn);
    sizeWrap.appendChild(sizeMenu);
    tb.appendChild(sizeWrap);
    tb.appendChild(makeSep());

    // Table picker
    const tblWrap = document.createElement("div");
    tblWrap.style.position = "relative";
    const tblBtn = makeBtn("Вставить таблицу", `<svg width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="21"/><line x1="15" y1="3" x2="15" y2="21"/></svg>`, () => {});
    const tblMenu = document.createElement("div");
    tblMenu.className = "tb-dropdown hidden table-picker";
    tblMenu.style.cssText = "top:36px;right:0";
    const tblLabel = document.createElement("p");
    tblLabel.textContent = "Выберите размер";
    tblMenu.appendChild(tblLabel);
    const tblGrid = document.createElement("div");
    tblGrid.className = "table-grid";
    const MAXR = 6,
        MAXC = 8;
    for (let r = 0; r < MAXR; r++) {
        const row = document.createElement("div");
        row.className = "table-grid-row";
        for (let c = 0; c < MAXC; c++) {
            const cell = document.createElement("div");
            cell.className = "table-cell";
            cell.addEventListener("mouseenter", () => {
                tableHover = {
                    r: r + 1,
                    c: c + 1
                };
                tblLabel.textContent = `Таблица ${r+1} × ${c+1}`;
                tblGrid.querySelectorAll(".table-cell").forEach((ce, i) => {
                    const cr = Math.floor(i / MAXC),
                        cc = i % MAXC;
                    ce.classList.toggle("on", cr < tableHover.r && cc < tableHover.c);
                });
            });
            cell.addEventListener("mousedown", e => {
                e.preventDefault();
                saveRange();
                restoreRange();
                insertTable(r + 1, c + 1);
                tblMenu.classList.add("hidden");
            });
            row.appendChild(cell);
        }
        tblGrid.appendChild(row);
    }
    tblMenu.appendChild(tblGrid);
    tblBtn.addEventListener("mousedown", e => {
        e.preventDefault();
        saveRange();
        tblMenu.classList.toggle("hidden");
        closeTbDropdowns(tblMenu);
    });
    tblWrap.appendChild(tblBtn);
    tblWrap.appendChild(tblMenu);
    tb.appendChild(tblWrap);

    // Emoji picker
    const emojiWrap = document.createElement("div");
    emojiWrap.style.position = "relative";
    const emojiBtn = makeBtn("Эмодзи", `<svg width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>`, () => {});
    const emojiMenu = document.createElement("div");
    emojiMenu.className = "tb-dropdown emoji-picker hidden";
    emojiMenu.style.cssText = "top:36px;right:0";
    EMOJIS.forEach(em => {
        const b = document.createElement("button");
        b.className = "emoji-btn";
        b.type = "button";
        b.textContent = em;
        b.addEventListener("mousedown", e => {
            e.preventDefault();
            exec("insertText", em);
            emojiMenu.classList.add("hidden");
        });
        emojiMenu.appendChild(b);
    });
    emojiBtn.addEventListener("mousedown", e => {
        e.preventDefault();
        emojiMenu.classList.toggle("hidden");
        closeTbDropdowns(emojiMenu);
    });
    emojiWrap.appendChild(emojiBtn);
    emojiWrap.appendChild(emojiMenu);
    tb.appendChild(emojiWrap);

    // Link
    const linkWrap = document.createElement("div");
    linkWrap.style.position = "relative";
    const linkBtn = makeBtn("Ссылка", `<svg width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>`, () => {});
    const linkMenu = document.createElement("div");
    linkMenu.className = "tb-dropdown link-popup hidden";
    linkMenu.style.cssText = "top:36px;right:0";
    const linkInput = document.createElement("input");
    linkInput.placeholder = "https://…";
    linkInput.className = "input-field";
    const linkOk = document.createElement("button");
    linkOk.className = "btn-primary btn-sm";
    linkOk.textContent = "ОК";
    const linkCancel = document.createElement("button");
    linkCancel.className = "icon-btn";
    linkCancel.innerHTML = `<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
    linkMenu.appendChild(linkInput);
    linkMenu.appendChild(linkOk);
    linkMenu.appendChild(linkCancel);

    function applyLink() {
        if (linkInput.value.trim() && editorSavedRange) {
            restoreRange();
            exec("createLink", linkInput.value.trim());
        }
        linkMenu.classList.add("hidden");
        linkInput.value = "";
    }
    linkOk.addEventListener("mousedown", e => {
        e.preventDefault();
        applyLink();
    });
    linkCancel.addEventListener("mousedown", e => {
        e.preventDefault();
        linkMenu.classList.add("hidden");
    });
    linkInput.addEventListener("keydown", e => {
        if (e.key === "Enter") applyLink();
        if (e.key === "Escape") linkMenu.classList.add("hidden");
    });
    linkBtn.addEventListener("mousedown", e => {
        e.preventDefault();
        saveRange();
        linkMenu.classList.toggle("hidden");
        closeTbDropdowns(linkMenu);
        setTimeout(() => linkInput.focus(), 50);
    });
    linkWrap.appendChild(linkBtn);
    linkWrap.appendChild(linkMenu);
    tb.appendChild(linkWrap);

    function closeTbDropdowns(except) {
        [sizeMenu, tblMenu, emojiMenu, linkMenu].forEach(m => {
            if (m !== except) m.classList.add("hidden");
        });
    }
    document.addEventListener("mousedown", e => {
        if (!tb.contains(e.target)) {
            [sizeMenu, tblMenu, emojiMenu, linkMenu].forEach(m => m.classList.add("hidden"));
        }
    }, true);
}

function insertTable(rows, cols) {
    const area = document.getElementById("editor-area");
    let html = "<table>";
    for (let r = 0; r < rows; r++) {
        html += "<tr>";
        for (let c = 0; c < cols; c++) {
            const tag = r === 0 ? "th" : "td";
            html += `<${tag}>${r === 0 ? "Заголовок" : "&nbsp;"}</${tag}>`;
        }
        html += "</tr>";
    }
    html += "</table><p><br></p>";
    area.focus();
    document.execCommand("insertHTML", false, html);
}

// ===== ENSURE DATA =====
async function ensureCategories(sectionId, force = false) {
    if (!force && categoriesBySection[sectionId]) return categoriesBySection[sectionId];
    const data = await request(`categories.php?section_id=${sectionId}`);
    const norm = (data || []).slice().sort((a, b) => (a.position || 0) - (b.position || 0));
    categoriesBySection[sectionId] = norm;
    return norm;
}
async function ensureArticles(catId, force = false) {
    if (!force && articlesByCategory[catId]) return articlesByCategory[catId];
    const data = await request(`articles.php?category_id=${catId}`);
    const norm = (data || []).map(a => ({
        id: a.id,
        title: a.title,
        tags: a.tags || [],
        updatedAt: parseTs(a.updated_at),
        categoryId: catId
    }));
    articlesByCategory[catId] = norm;
    return norm;
}

// ===== ARTICLE CARD =====
function makeArticleCard(p) {
    const btn = document.createElement("button");
    btn.className = "article-card";
    btn.innerHTML = `<div class="article-card-inner">${svgFile()}<div class="min-w-0"><p>${escape(p.title)}</p><p class="art-time">обновлено ${timeAgo(p.updatedAt)}</p></div></div>`;
    btn.addEventListener("click", () => openPage(p.id));
    return btn;
}

// ===== NAVIGATION =====
function goHome() {
    clearError();
    document.getElementById("search-input").value = "";
    showView("home");
}

// ===== SEARCH =====
let searchTimer = null;
document.getElementById("search-input").addEventListener("input", e => {
    const q = e.target.value.trim();
    if (!q) {
        showView("home");
        return;
    }
    showView("search");
    clearTimeout(searchTimer);
    searchTimer = setTimeout(async () => {
        try {
            const r = await request(`search.php?q=${encodeURIComponent(q)}`);
            renderSearchResults(r || [], q);
        } catch (e2) {
            if (!e2.auth) renderSearchResults([], q);
        }
    }, 350);
});

function renderSearchResults(results, q) {
    document.getElementById("search-heading").innerHTML = `Результаты: «${escape(q)}» <span style="color:var(--slate-400);font-weight:400">(${results.length})</span>`;
    const container = document.getElementById("search-results");
    container.innerHTML = "";
    if (results.length === 0) {
        container.innerHTML = `<p class="text-slate-400 text-sm">Ничего не найдено.</p>`;
        return;
    }
    results.forEach(p => {
        const sec = sections.find(s => s.id === p.section_id);
        const btn = document.createElement("button");
        btn.className = "search-result-card";
        btn.innerHTML = `<div class="search-result-section">${svgFolder(sec?.color || "#94a3b8", 13)} ${escape(sec?.name || "Раздел")}</div><div class="search-result-title">${escape(p.title)}</div>`;
        btn.addEventListener("click", () => openPage(p.id));
        container.appendChild(btn);
    });
}

// ===== DELETE HANDLERS =====
async function deletePage(id) {
    const cat = fullArticle ?.categoryId;
    try {
        await request(`articles.php?id=${id}`, {
            method: "DELETE"
        });
        if (cat) {
            await ensureArticles(cat, true);
            curCategory = cat;
            showView("category");
            await goCategory(cat);
        } else goHome();
    } catch (e) {
        if (!e.auth) showError(e.message);
    }
}
async function deleteCategory(id) {
    try {
        await request(`categories.php?id=${id}`, {
            method: "DELETE"
        });
        delete articlesByCategory[id];
        await ensureCategories(curSection, true);
        goSection(curSection);
    } catch (e) {
        if (!e.auth) showError(e.message);
    }
}
async function deleteSectionFn(id) {
    try {
        await request(`sections.php?id=${id}`, {
            method: "DELETE"
        });
        delete categoriesBySection[id];
        await loadSections();
        goHome();
    } catch (e) {
        if (!e.auth) showError(e.message);
    }
}

// ===== ADMIN =====
async function openAdmin() {
    showView("admin");
    document.getElementById("admin-spinner").classList.remove("hidden");
    document.getElementById("users-list").innerHTML = "";
    try {
        const u = await request("users.php");
        users = u || [];
    } catch (e) {
        if (!e.auth) showError(e.message);
    }
    document.getElementById("admin-spinner").classList.add("hidden");
    renderUsersList();
}

function renderUsersList() {
    document.getElementById("user-count").textContent = `(${users.length})`;
    const list = document.getElementById("users-list");
    list.innerHTML = "";
    users.forEach(u => {
        const isSelf = u.id === currentUser.id;
        const wrap = document.createElement("div");

        const roleSelect = `<select class="input-field" style="font-size:12px;padding:6px 8px;width:auto" ${isSelf ? "disabled" : ""}>
      ${Object.entries(ROLES).map(([k,r]) => `<option value="${k}" ${u.role===k?"selected":""}>${r.label}</option>`).join("")}
    </select>`;

        wrap.innerHTML = `
      <div class="user-row">
        <div class="avatar">${(u.name || u.email)[0].toUpperCase()}</div>
        <div class="min-w-0 flex-1">
          <p class="text-sm font-medium text-slate-800 truncate">${escape(u.name)} ${isSelf ? '<span class="text-violet-500" style="font-size:11px">(вы)</span>' : ""}</p>
          <p class="text-xs text-slate-400 truncate flex items-center gap-1">
            <svg width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
            ${escape(u.email)}
          </p>
        </div>
        ${roleSelect}
        <button class="icon-btn" title="Сбросить пароль" data-uid="${u.id}">
          <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
        </button>
        <button class="icon-btn danger" title="${isSelf ? 'Нельзя удалить себя' : 'Удалить'}" data-deluid="${u.id}" ${isSelf ? "disabled style='opacity:.3'" : ""}>
          <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
        </button>
      </div>
      <div class="reset-info hidden"></div>
    `;

        const sel = wrap.querySelector("select");
        if (!isSelf) sel.addEventListener("change", () => changeUserRole(u.id, sel.value));

        wrap.querySelector("[data-uid]").addEventListener("click", async () => {
            const info = wrap.querySelector(".reset-info");
            try {
                const r = await request("users_reset.php", {
                    method: "POST",
                    body: {
                        id: u.id
                    }
                });
                info.innerHTML = `Новый пароль: <b style="font-family:monospace">${escape(r.password)}</b> — передайте сотруднику.`;
                info.classList.remove("hidden");
            } catch (e) {
                if (!e.auth) showError(e.message);
            }
        });

        const delBtn = wrap.querySelector("[data-deluid]");
        if (!isSelf) delBtn.addEventListener("click", () => openModal("Удалить пользователя?", "Пользователь потеряет доступ.", () => deleteUserFn(u.id)));

        list.appendChild(wrap);
    });
}

async function addUser() {
    const email = document.getElementById("new-user-email").value.trim();
    const name = document.getElementById("new-user-name").value.trim() || email.split("@")[0];
    const errEl = document.getElementById("add-user-error");
    const errText = document.getElementById("add-user-error-text");
    errEl.classList.add("hidden");
    document.getElementById("created-user-info").classList.add("hidden");
    if (!email) {
        errText.textContent = "Введите почту";
        errEl.classList.remove("hidden");
        return;
    }
    try {
        const res = await request("users.php", {
            method: "POST",
            body: {
                email,
                name,
                role: newUserRole
            }
        });
        document.getElementById("new-user-email").value = "";
        document.getElementById("new-user-name").value = "";
        const info = document.getElementById("created-user-info");
        info.innerHTML = `<p>Пользователь создан! Передайте данные для входа:</p><div class="creds">Почта: <b>${escape(res.email)}</b><br>Пароль: <b>${escape(res.password)}</b></div>`;
        info.classList.remove("hidden");
        const u = await request("users.php").catch(() => null);
        if (u) {
            users = u;
            renderUsersList();
        }
    } catch (e) {
        errText.textContent = e.message;
        errEl.classList.remove("hidden");
    }
}

async function changeUserRole(id, role) {
    try {
        await request("users.php", {
            method: "PUT",
            body: {
                id,
                role
            }
        });
        users = users.map(u => u.id === id ? {
            ...u,
            role
        } : u);
    } catch (e) {
        if (!e.auth) showError(e.message);
    }
}

async function deleteUserFn(id) {
    closeModal();
    try {
        await request(`users.php?id=${id}`, {
            method: "DELETE"
        });
        users = users.filter(u => u.id !== id);
        renderUsersList();
    } catch (e) {
        if (!e.auth) showError(e.message);
    }
}

// ===== EDITOR KEYBOARD =====
document.getElementById("editor-area").addEventListener("keydown", e => {
    const area = document.getElementById("editor-area");
    if (e.key === "Tab") {
        // table Tab navigation
        const sel = window.getSelection();
        if (sel.rangeCount) {
            let n = sel.anchorNode;
            while (n && n !== area) {
                if (n.nodeName === "TD" || n.nodeName === "TH") break;
                n = n.parentNode;
            }
            if (n && (n.nodeName === "TD" || n.nodeName === "TH")) {
                e.preventDefault();
                let next = n.nextElementSibling;
                if (!next) {
                    const row = n.parentNode;
                    let nextRow = row.nextElementSibling;
                    if (!nextRow) {
                        const cnt = row.children.length;
                        const tr = document.createElement("tr");
                        for (let i = 0; i < cnt; i++) {
                            const td = document.createElement("td");
                            td.innerHTML = "&nbsp;";
                            tr.appendChild(td);
                        }
                        row.parentNode.appendChild(tr);
                        nextRow = tr;
                    }
                    next = nextRow.firstElementChild;
                }
                const r = document.createRange();
                r.selectNodeContents(next);
                r.collapse(true);
                sel.removeAllRanges();
                sel.addRange(r);
            }
        }
    }
});

// ===== EVENT LISTENERS =====
// Login
document.getElementById("login-btn").addEventListener("click", doLogin);
document.getElementById("login-email").addEventListener("keydown", e => e.key === "Enter" && doLogin());
document.getElementById("login-password").addEventListener("keydown", e => e.key === "Enter" && doLogin());

async function doLogin() {
    const email = document.getElementById("login-email").value.trim();
    const password = document.getElementById("login-password").value;
    const btn = document.getElementById("login-btn");
    const errEl = document.getElementById("login-error");
    const errText = document.getElementById("login-error-text");
    errEl.classList.add("hidden");
    btn.disabled = true;
    btn.innerHTML = `<div class="spin" style="width:16px;height:16px;display:inline-block"></div> Вход…`;
    try {
        const data = await fetch(API_BASE + "login.php", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    email,
                    password
                })
            })
            .then(async r => {
                const d = await r.json().catch(() => null);
                if (!r.ok) throw new Error(d ?.error || "Ошибка входа");
                return d;
            });
        token = data.token;
        currentUser = data.user;
        try {
            await window.storage.set(SESSION_KEY, JSON.stringify({
                token,
                user: data.user
            }));
        } catch {}
        showApp();
        await loadSections();
    } catch (e) {
        errText.textContent = e.message === "Failed to fetch" ? "Сервер недоступен." : e.message;
        errEl.classList.remove("hidden");
    }
    btn.disabled = false;
    btn.innerHTML = "Войти";
}

// Header
document.getElementById("btn-home").addEventListener("click", goHome);
document.getElementById("btn-logout").addEventListener("click", doLogout);
document.getElementById("btn-admin").addEventListener("click", openAdmin);
document.getElementById("bc-admin-home").addEventListener("click", goHome);
document.getElementById("btn-back-from-search").addEventListener("click", goHome);

// Error banner
document.getElementById("btn-close-error").addEventListener("click", clearError);

// Home
document.getElementById("btn-add-section").addEventListener("click", () => {
    document.getElementById("add-section-row").classList.remove("hidden");
    document.getElementById("new-section-name").focus();
});
document.getElementById("btn-create-section").addEventListener("click", () => {
    const v = document.getElementById("new-section-name").value.trim();
    if (v) addSection(v);
});
document.getElementById("new-section-name").addEventListener("keydown", e => {
    if (e.key === "Enter") {
        const v = e.target.value.trim();
        if (v) addSection(v);
    }
    if (e.key === "Escape") {
        document.getElementById("add-section-row").classList.add("hidden");
        e.target.value = "";
    }
});
document.getElementById("btn-cancel-section").addEventListener("click", () => {
    document.getElementById("add-section-row").classList.add("hidden");
    document.getElementById("new-section-name").value = "";
});

// Section view
document.getElementById("btn-add-category").addEventListener("click", () => {
    document.getElementById("add-cat-row").classList.remove("hidden");
    document.getElementById("new-cat-name").focus();
});
document.getElementById("btn-create-cat").addEventListener("click", async () => {
    const v = document.getElementById("new-cat-name").value.trim();
    if (!v) return;
    document.getElementById("add-cat-row").classList.add("hidden");
    document.getElementById("new-cat-name").value = "";
    try {
        const cats = categoriesBySection[curSection] || [];
        await request("categories.php", {
            method: "POST",
            body: {
                section_id: curSection,
                name: v,
                position: cats.length
            }
        });
        await ensureCategories(curSection, true);
        for (const c of categoriesBySection[curSection] || []) await ensureArticles(c.id);
        renderCategoriesList();
    } catch (e) {
        if (!e.auth) showError(e.message);
    }
});
document.getElementById("new-cat-name").addEventListener("keydown", e => {
    if (e.key === "Enter") document.getElementById("btn-create-cat").click();
    if (e.key === "Escape") {
        document.getElementById("add-cat-row").classList.add("hidden");
        e.target.value = "";
    }
});
document.getElementById("btn-cancel-cat").addEventListener("click", () => {
    document.getElementById("add-cat-row").classList.add("hidden");
    document.getElementById("new-cat-name").value = "";
});
document.getElementById("btn-delete-section").addEventListener("click", () => {
    openModal("Удалить раздел?", "Раздел со всеми категориями и статьями будет удалён.", () => {
        closeModal();
        deleteSectionFn(curSection);
    });
});

// Category view
document.getElementById("btn-add-article").addEventListener("click", () => openEditor(null, curSection, curCategory));
document.getElementById("btn-delete-category").addEventListener("click", () => {
    openModal("Удалить категорию?", "Категория и все статьи внутри неё будут удалены.", () => {
        closeModal();
        deleteCategory(curCategory);
    });
});

// Page view
document.getElementById("btn-edit-page").addEventListener("click", () => {
    if (fullArticle) openEditor(fullArticle, fullArticle.section, fullArticle.categoryId);
});
document.getElementById("btn-delete-page").addEventListener("click", () => {
    openModal("Удалить статью?", "", () => {
        closeModal();
        deletePage(fullArticle.id);
    });
});

// Editor
document.getElementById("editor-title").addEventListener("input", updateEditorSaveBtn);
document.getElementById("editor-cat").addEventListener("change", updateEditorSaveBtn);
document.getElementById("btn-save-article").addEventListener("click", saveArticle);
document.getElementById("btn-cancel-editor").addEventListener("click", () => {
    if (editingPage) openPage(editingPage.id);
    else if (curCategory) goCategory(curCategory);
    else goHome();
});

// Admin
document.getElementById("btn-create-user").addEventListener("click", addUser);
document.getElementById("role-options").addEventListener("click", e => {
    const opt = e.target.closest(".role-option");
    if (!opt) return;
    document.querySelectorAll(".role-option").forEach(o => o.classList.remove("selected"));
    opt.classList.add("selected");
    newUserRole = opt.dataset.role;
});

// Modal
document.getElementById("modal-cancel").addEventListener("click", closeModal);
document.getElementById("modal-confirm").addEventListener("click", () => {
    if (modalCallback) modalCallback();
});
document.getElementById("modal").addEventListener("click", e => {
    if (e.target === document.getElementById("modal")) closeModal();
});

// ===== BOOT =====
bootSession();