// etb.ai — виртуальный офис: рисует состояние из window.office и обновляет его без перезагрузки.
// Столы создаются один раз и дальше только обновляются — иначе анимации статусов дёргались бы.

(() => {
  const office = window.office;
  const { projects, agents, departments, tasks, events, approvals } = office;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const time = (d) => d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });

  const STATUS = { idle: "свободен", working: "работает", waiting_approval: "ждёт одобрения", error: "ошибка" };
  const TASK_STATUS = { new: "Новые", in_progress: "В работе", review: "На проверке", done: "Готово", rejected: "Отклонено" };

  const hour = new Date().getHours();
  $("greeting").textContent = hour < 5 ? "Доброй ночи" : hour < 12 ? "Доброе утро" : hour < 18 ? "Добрый день" : "Добрый вечер";

  // ---------- столы ----------
  // отделы: рамка, название и столы участников
  const deptEls = new Map();
  for (const d of departments) {
    const el = document.createElement("section");
    el.className = "dept";
    el.innerHTML = `<h2>${esc(d.name)}<em>работают вместе</em></h2><div class="desks"></div>`;
    $("departments").appendChild(el);
    deptEls.set(d.slug, { el, grid: el.querySelector(".desks"), joint: undefined });
  }

  const desks = new Map();
  for (const a of agents) {
    const el = document.createElement("button");
    el.dataset.agent = a.slug;
    el.innerHTML = `<span class="desk__head"><span class="avatar">${esc(a.name[0])}</span><span class="desk__who"><span class="desk__name">${esc(a.name)}</span><span class="desk__role">${esc(a.role)}</span></span></span><span class="desk__task"></span>`;
    (a.kind === "director" ? $("directors") : deptEls.get(a.dept).grid).appendChild(el);
    desks.set(a.slug, { el, task: el.querySelector(".desk__task"), status: null, current: undefined });
  }

  const chips = new Map();
  for (const p of projects) {
    const el = document.createElement("button");
    el.className = "chip";
    el.dataset.project = p.slug;
    el.innerHTML = `${esc(p.name)}<small>0</small>`;
    $("projects").appendChild(el);
    chips.set(p.slug, el.querySelector("small"));
  }

  function setNumber(id, value) {
    const el = $(id);
    if (el.textContent === String(value)) return;
    el.textContent = value;
    el.classList.remove("bump");
    void el.offsetWidth; // перезапуск анимации
    el.classList.add("bump");
  }

  function flash(slug) {
    const desk = desks.get(slug);
    if (!desk) return;
    desk.el.classList.remove("handoff");
    void desk.el.offsetWidth;
    desk.el.classList.add("handoff");
  }

  let lastEventId = 0;
  let approvalsKey = "";

  function render() {
    for (const a of agents) {
      const desk = desks.get(a.slug);
      if (desk.status !== a.status) {
        desk.el.className = `desk ${a.status}`;
        desk.el.title = STATUS[a.status];
        desk.status = a.status;
      }
      if (desk.current !== a.current) {
        desk.task.textContent = a.current ?? "свободен";
        desk.task.classList.toggle("empty", !a.current);
        desk.current = a.current;
      }
    }

    for (const d of departments) {
      const view = deptEls.get(d.slug);
      if (view.joint !== d.joint) {
        view.el.classList.toggle("joint", Boolean(d.joint));
        view.el.title = d.joint ?? "";
        view.joint = d.joint;
      }
    }

    for (const p of projects) {
      const open = tasks.filter((t) => t.project === p.slug && !["done", "rejected"].includes(t.status)).length;
      const el = chips.get(p.slug);
      el.textContent = open;
      el.classList.toggle("has", open > 0);
    }

    const s = office.stats();
    setNumber("statWorking", s.working);
    setNumber("statWaiting", s.waiting);
    setNumber("statDone", s.done);
    setNumber("statAgents", s.agents);

    // лента: дорисовываем только новое сверху
    const fresh = events.filter((e) => e.id > lastEventId).reverse();
    for (const e of fresh) {
      const li = document.createElement("li");
      li.className = "new";
      li.innerHTML = `<time>${time(e.at)}</time><span><b>${esc(e.from)}</b>${e.to ? ` <span class="arrow">→</span> <b>${esc(e.to)}</b>` : ""}: ${esc(e.text)} <span class="proj">(${esc(e.project)})</span></span>`;
      $("feed").prepend(li);
      if (e.to) {
        flash(e.fromSlug);
        flash(e.toSlug);
      }
    }
    if (fresh.length) lastEventId = events[0].id;
    while ($("feed").children.length > 40) $("feed").lastElementChild.remove();

    // одобрения: перерисовываем только когда список изменился
    const key = approvals.map((a) => a.id).join(",");
    if (key !== approvalsKey) {
      approvalsKey = key;
      $("approvalsPanel").classList.toggle("has", approvals.length > 0);
      $("approvals").innerHTML = approvals
        .map(
          (a) => `<li><div class="what">${esc(a.action)}</div><div class="ctx">${esc(a.agent)} · ${esc(a.title)} · ${esc(a.project)}</div>
            <div class="actions"><button class="btn btn--ok" data-approve="${a.id}">Одобрить</button><button class="btn" data-reject="${a.id}">Отклонить</button></div></li>`,
        )
        .join("");
    }

    if (opened) fillSheet();
  }

  // ---------- карточка агента или проекта ----------
  let opened = null;
  function agentSheet(slug) {
    const a = agents.find((x) => x.slug === slug);
    const queue = tasks.filter((t) => t.assignee === slug && !["done", "rejected"].includes(t.status));
    const recent = events.filter((e) => e.fromSlug === slug || e.toSlug === slug).slice(0, 8);
    return `<h3>${esc(a.name)}</h3>
      <p class="sub"><i class="dot ${a.status}"></i>${STATUS[a.status]} · ${esc(a.role)}</p>
      <h4>Очередь</h4>
      ${queue.length ? `<ul>${queue.map((t) => `<li><span>${esc(t.title)}</span><span class="status">${TASK_STATUS[t.status]}</span></li>`).join("")}</ul>` : '<p class="none">Пусто</p>'}
      <h4>Последние события</h4>
      ${recent.length ? `<ul>${recent.map((e) => `<li><span>${esc(e.text)}</span><span>${time(e.at)}</span></li>`).join("")}</ul>` : '<p class="none">Пока ничего</p>'}`;
  }
  function projectSheet(slug) {
    const p = projects.find((x) => x.slug === slug);
    const mine = tasks.filter((t) => t.project === slug);
    const cols = Object.keys(TASK_STATUS)
      .map((s) => {
        const list = mine.filter((t) => t.status === s);
        return list.length ? `<div><b>${TASK_STATUS[s]} · ${list.length}</b>${list.slice(0, 6).map((t) => `<p>${esc(t.title)}</p>`).join("")}</div>` : "";
      })
      .join("");
    return `<h3>${esc(p.name)}</h3><p class="sub">${esc(p.goal)}</p><h4>Задачи</h4>${cols ? `<div class="cols">${cols}</div>` : '<p class="none">Задач пока нет</p>'}`;
  }
  function fillSheet() {
    $("sheetBody").innerHTML = opened.agent ? agentSheet(opened.agent) : projectSheet(opened.project);
  }
  function openSheet(target) {
    opened = target;
    fillSheet();
    $("sheet").hidden = false;
    $("sheetClose").focus();
  }
  function closeSheet() {
    opened = null;
    $("sheet").hidden = true;
  }

  document.addEventListener("click", (e) => {
    const approve = e.target.closest("[data-approve]");
    const reject = e.target.closest("[data-reject]");
    const agent = e.target.closest("[data-agent]");
    const project = e.target.closest("[data-project]");
    if (approve) office.approve(Number(approve.dataset.approve));
    else if (reject) office.reject(Number(reject.dataset.reject));
    else if (agent) openSheet({ agent: agent.dataset.agent });
    else if (project) openSheet({ project: project.dataset.project });
    else if (e.target.id === "sheet" || e.target.id === "sheetClose") closeSheet();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeSheet();
  });

  office.subscribe(render);
  render();
})();
