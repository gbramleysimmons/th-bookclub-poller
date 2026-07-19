"use strict";

const app = document.getElementById("app");

// --- API helpers ------------------------------------------------------------
async function api(path, opts) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  let body = null;
  try { body = await res.json(); } catch (e) { /* no body */ }
  if (!res.ok) {
    const msg = (body && body.detail) ? body.detail : `Error ${res.status}`;
    throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
  }
  return body;
}

function el(html) {
  const t = document.createElement("template");
  t.innerHTML = html.trim();
  return t.content.firstChild;
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function savedName() { return localStorage.getItem("voterName") || ""; }
function saveName(n) { localStorage.setItem("voterName", n); }

// --- Router -----------------------------------------------------------------
function route() {
  const path = window.location.pathname;
  const m = path.match(/^\/p\/([^/]+)$/);
  if (m) {
    renderPoll(decodeURIComponent(m[1]));
  } else {
    renderHome();
  }
}

function navigate(path) {
  window.history.pushState({}, "", path);
  route();
}
window.addEventListener("popstate", route);

// --- Home view --------------------------------------------------------------
function renderHome() {
  app.innerHTML = "";
  const view = el(`
    <div>
      <div class="tabs">
        <button id="tab-create" class="active">Create</button>
        <button id="tab-join">Join</button>
      </div>
      <div id="pane"></div>
    </div>
  `);
  app.appendChild(view);
  const pane = view.querySelector("#pane");
  const tabCreate = view.querySelector("#tab-create");
  const tabJoin = view.querySelector("#tab-join");

  function showCreate() {
    tabCreate.classList.add("active"); tabJoin.classList.remove("active");
    renderCreate(pane);
  }
  function showJoin() {
    tabJoin.classList.add("active"); tabCreate.classList.remove("active");
    renderJoin(pane);
  }
  tabCreate.onclick = showCreate;
  tabJoin.onclick = showJoin;
  showCreate();
}

function renderCreate(pane) {
  pane.innerHTML = "";
  const card = el(`
    <div class="card">
      <h1>Create a poll</h1>
      <p class="muted">Ranked-choice voting using the Borda count.</p>
      <label>Question / title</label>
      <input id="title" type="text" placeholder="Which book should we read next?" />
      <label>Options</label>
      <div id="options"></div>
      <button id="add-opt" class="btn-ghost btn-small">+ Add option</button>
      <label>Custom shortcode</label>
      <input id="shortcode" type="text" placeholder="bookclub-july" />
      <div class="spacer"></div>
      <button id="submit" class="btn-primary">Create poll</button>
      <div id="msg"></div>
    </div>
  `);
  pane.appendChild(card);

  const optionsBox = card.querySelector("#options");
  function addOption(value) {
    const rowCount = optionsBox.children.length;
    const row = el(`
      <div class="option-row">
        <input type="text" placeholder="Option ${rowCount + 1}" />
        <button class="btn-danger" title="Remove">✕</button>
      </div>
    `);
    if (value) row.querySelector("input").value = value;
    row.querySelector("button").onclick = () => {
      if (optionsBox.children.length > 2) row.remove();
    };
    optionsBox.appendChild(row);
  }
  addOption(); addOption();
  card.querySelector("#add-opt").onclick = () => addOption();

  const msg = card.querySelector("#msg");
  card.querySelector("#submit").onclick = async () => {
    msg.innerHTML = "";
    const title = card.querySelector("#title").value.trim();
    const shortcode = card.querySelector("#shortcode").value.trim();
    const options = [...optionsBox.querySelectorAll("input")]
      .map((i) => i.value.trim()).filter(Boolean);
    if (!title) return showMsg(msg, "error", "Please enter a title.");
    if (options.length < 2) return showMsg(msg, "error", "Add at least 2 options.");
    if (!shortcode) return showMsg(msg, "error", "Please choose a shortcode.");
    try {
      await api("/api/polls", {
        method: "POST",
        body: JSON.stringify({ title, options, shortcode }),
      });
      navigate(`/p/${encodeURIComponent(shortcode.toLowerCase())}`);
    } catch (e) {
      showMsg(msg, "error", e.message);
    }
  };
}

function renderJoin(pane) {
  pane.innerHTML = "";
  const card = el(`
    <div class="card">
      <h1>Join a poll</h1>
      <p class="muted">Enter the shortcode someone shared with you.</p>
      <label>Shortcode</label>
      <input id="code" type="text" placeholder="bookclub-july" />
      <div class="spacer"></div>
      <button id="go" class="btn-primary">Go to poll</button>
      <div id="msg"></div>
    </div>
  `);
  pane.appendChild(card);
  const msg = card.querySelector("#msg");
  card.querySelector("#go").onclick = () => {
    const code = card.querySelector("#code").value.trim().toLowerCase();
    if (!code) return showMsg(msg, "error", "Enter a shortcode.");
    navigate(`/p/${encodeURIComponent(code)}`);
  };
}

// --- Poll view --------------------------------------------------------------
async function renderPoll(shortcode) {
  app.innerHTML = `<div class="card"><p class="muted">Loading…</p></div>`;
  let poll;
  try {
    poll = await api(`/api/polls/${encodeURIComponent(shortcode)}`);
  } catch (e) {
    app.innerHTML = `<div class="card"><h1>Poll not found</h1>
      <p class="muted">No poll exists for “${esc(shortcode)}”.</p>
      <div class="spacer"></div>
      <button class="btn-primary" onclick="navigate('/')">Back home</button></div>`;
    return;
  }

  app.innerHTML = "";
  const shareUrl = `${window.location.origin}/p/${encodeURIComponent(poll.shortcode)}`;
  const view = el(`
    <div>
      <div class="card">
        <h1>${esc(poll.title)}</h1>
        <p class="muted">${poll.voteCount} vote(s) so far • code <strong>${esc(poll.shortcode)}</strong></p>
        <div class="share">
          <input id="shareurl" type="text" readonly value="${esc(shareUrl)}" />
          <button id="copy" class="btn-ghost btn-small">Copy</button>
        </div>
      </div>
      <div class="tabs">
        <button id="tab-vote" class="active">Vote</button>
        <button id="tab-results">Results</button>
      </div>
      <div id="pane"></div>
    </div>
  `);
  app.appendChild(view);

  view.querySelector("#copy").onclick = () => {
    const inp = view.querySelector("#shareurl");
    inp.select();
    navigator.clipboard && navigator.clipboard.writeText(inp.value);
    view.querySelector("#copy").textContent = "Copied!";
    setTimeout(() => (view.querySelector("#copy").textContent = "Copy"), 1500);
  };

  const pane = view.querySelector("#pane");
  const tabVote = view.querySelector("#tab-vote");
  const tabResults = view.querySelector("#tab-results");
  tabVote.onclick = () => {
    tabVote.classList.add("active"); tabResults.classList.remove("active");
    renderVote(pane, poll);
  };
  tabResults.onclick = () => {
    tabResults.classList.add("active"); tabVote.classList.remove("active");
    renderResults(pane, poll.shortcode);
  };
  renderVote(pane, poll);
}

function renderVote(pane, poll) {
  pane.innerHTML = "";
  // ranking: array of option indices, most-preferred first.
  let ranking = poll.options.map((_, i) => i);

  const card = el(`
    <div class="card">
      <h2>Rank the options</h2>
      <p class="muted">Drag ⠿ to reorder — most (top) to least preferred. You can also use ▲▼.</p>
      <label>Your name</label>
      <input id="voter" type="text" placeholder="e.g. Alex" value="${esc(savedName())}" />
      <div class="spacer"></div>
      <div id="ranklist"></div>
      <button id="submit" class="btn-primary">Submit vote</button>
      <div id="msg"></div>
    </div>
  `);
  pane.appendChild(card);
  const list = card.querySelector("#ranklist");

  function itemByOpt(optIdx) {
    return list.querySelector(`.rank-item[data-opt="${optIdx}"]`);
  }

  // FLIP animation: record positions, run a mutation + redraw, then animate
  // each item sliding from its old position to its new one. Gives reordering
  // a sense of weight and continuity instead of snapping instantly.
  function animateReorder(mutate, { skipOpt = null } = {}) {
    const before = new Map();
    list.querySelectorAll(".rank-item").forEach((it) => {
      before.set(it.dataset.opt, it.getBoundingClientRect().top);
    });
    mutate();
    draw();
    list.querySelectorAll(".rank-item").forEach((it) => {
      if (it.dataset.opt === String(skipOpt)) return;
      const prevTop = before.get(it.dataset.opt);
      if (prevTop === undefined) return;
      const dy = prevTop - it.getBoundingClientRect().top;
      if (!dy) return;
      it.style.transition = "none";
      it.style.transform = `translateY(${dy}px)`;
      requestAnimationFrame(() => {
        it.style.transition = "transform 240ms cubic-bezier(.2,.9,.3,1)";
        it.style.transform = "";
      });
    });
  }

  function draw() {
    list.innerHTML = "";
    ranking.forEach((optIdx, pos) => {
      const item = el(`
        <div class="rank-item" data-pos="${pos}" data-opt="${optIdx}">
          <div class="drag-handle" title="Drag to reorder" aria-label="Drag to reorder">⠿</div>
          <div class="rank-num">${pos + 1}</div>
          <div class="rank-label">${esc(poll.options[optIdx])}</div>
          <div class="rank-btns">
            <button data-dir="up" ${pos === 0 ? "disabled" : ""}>▲</button>
            <button data-dir="down" ${pos === ranking.length - 1 ? "disabled" : ""}>▼</button>
          </div>
        </div>
      `);
      item.querySelectorAll("button").forEach((b) => {
        b.onclick = () => {
          const dir = b.dataset.dir;
          const swap = dir === "up" ? pos - 1 : pos + 1;
          animateReorder(() => {
            [ranking[pos], ranking[swap]] = [ranking[swap], ranking[pos]];
          });
        };
      });
      item.querySelector(".drag-handle")
        .addEventListener("pointerdown", (e) => startDrag(e, pos));
      list.appendChild(item);
    });
    // Keep the actively dragged item lifted after a redraw.
    if (drag) {
      const it = itemByOpt(drag.opt);
      if (it) it.classList.add("dragging");
    }
  }

  // Pointer-based drag reordering (works with mouse and touch).
  let drag = null;
  function startDrag(e, pos) {
    e.preventDefault();
    const it = list.querySelectorAll(".rank-item")[pos];
    const rect = it.getBoundingClientRect();
    drag = { pos, opt: ranking[pos], grabOffset: e.clientY - rect.top, height: rect.height };
    it.classList.add("dragging");
    // Follow the pointer immediately for a responsive, weighty feel.
    liftFollow(e.clientY);
    window.addEventListener("pointermove", onDrag);
    window.addEventListener("pointerup", endDrag);
  }

  // Move the dragged item so it tracks the pointer, with a slight lift.
  function liftFollow(clientY) {
    const it = itemByOpt(drag.opt);
    if (!it) return;
    const rect = it.getBoundingClientRect();
    const naturalTop = rect.top;
    const desiredTop = clientY - drag.grabOffset;
    const dy = desiredTop - naturalTop;
    it.style.transition = "none";
    it.style.transform = `translateY(${dy}px) scale(1.03)`;
  }

  function onDrag(e) {
    if (!drag) return;
    const items = [...list.querySelectorAll(".rank-item")];
    let target = drag.pos;
    for (let i = 0; i < items.length; i++) {
      const r = items[i].getBoundingClientRect();
      const mid = r.top + r.height / 2;
      if (e.clientY >= mid && i > target) target = i;
      if (e.clientY <= mid && i < target) { target = i; break; }
    }
    if (target !== drag.pos) {
      const from = drag.pos;
      // Slide the displaced items (FLIP), but keep the dragged item glued
      // to the pointer instead of animating it into its new slot.
      animateReorder(() => {
        const moved = ranking.splice(from, 1)[0];
        ranking.splice(target, 0, moved);
      }, { skipOpt: drag.opt });
      drag.pos = target;
    }
    liftFollow(e.clientY);
  }

  function endDrag() {
    if (!drag) return;
    window.removeEventListener("pointermove", onDrag);
    window.removeEventListener("pointerup", endDrag);
    const it = itemByOpt(drag.opt);
    drag = null;
    if (it) {
      // Settle the item back into place with a springy transition.
      it.style.transition = "transform 260ms cubic-bezier(.2,.9,.3,1)";
      it.style.transform = "";
      const cleanup = () => {
        it.classList.remove("dragging");
        it.style.transition = "";
        it.removeEventListener("transitionend", cleanup);
      };
      it.addEventListener("transitionend", cleanup);
    }
  }
  draw();

  const msg = card.querySelector("#msg");
  card.querySelector("#submit").onclick = async () => {
    msg.innerHTML = "";
    const voter = card.querySelector("#voter").value.trim();
    if (!voter) return showMsg(msg, "error", "Please enter your name.");
    saveName(voter);
    try {
      await api(`/api/polls/${encodeURIComponent(poll.shortcode)}/vote`, {
        method: "POST",
        body: JSON.stringify({ voter, ranking }),
      });
      showMsg(msg, "success", "Vote recorded! Check the Results tab.");
    } catch (e) {
      showMsg(msg, "error", e.message);
    }
  };
}

async function renderResults(pane, shortcode) {
  pane.innerHTML = `<div class="card"><p class="muted">Loading results…</p></div>`;
  let data;
  try {
    data = await api(`/api/polls/${encodeURIComponent(shortcode)}/results`);
  } catch (e) {
    pane.innerHTML = `<div class="card"><p class="notice error">${esc(e.message)}</p></div>`;
    return;
  }
  const max = Math.max(1, ...data.results.map((r) => r.points));
  const rows = data.results.map((r, i) => `
    <div class="result-row">
      <div class="result-head">
        <span class="${i === 0 && data.voteCount > 0 ? "winner" : ""}">
          ${i === 0 && data.voteCount > 0 ? "🏆 " : ""}${esc(r.option)}
        </span>
        <span class="muted">${r.points} pts</span>
      </div>
      <div class="bar"><span style="width:${(r.points / max) * 100}%"></span></div>
    </div>
  `).join("");

  pane.innerHTML = "";
  const ballots = data.ballots || [];
  const ballotRows = ballots.map((b) => `
    <div class="ballot">
      <div class="ballot-voter">${esc(b.voter)}</div>
      <ol class="ballot-list">
        ${b.ranking.map((opt) => `<li>${esc(opt)}</li>`).join("")}
      </ol>
    </div>
  `).join("");

  pane.appendChild(el(`
    <div>
      <div class="card">
        <h2>Results</h2>
        <p class="muted">${data.voteCount} vote(s) • Borda count</p>
        ${data.voteCount === 0 ? '<p class="notice">No votes yet.</p>' : rows}
      </div>
      ${ballots.length ? `
      <div class="card">
        <h2>How everyone voted</h2>
        <p class="muted">Each ballot, top (most preferred) to bottom.</p>
        ${ballotRows}
      </div>` : ""}
    </div>
  `));
}

// --- utils ------------------------------------------------------------------
function showMsg(container, kind, text) {
  container.innerHTML = `<div class="notice ${kind}">${esc(text)}</div>`;
}
window.navigate = navigate;

route();
