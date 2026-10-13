// Источник данных для предпросмотра офиса: состав из ТЗ (этап 1) и проигрываемый сценарий работы.
// На этапе 4 вместо этого файла подключается Supabase Realtime: тот же интерфейс window.office.

(() => {
  const projects = [
    { slug: "ulut-batyr", name: "Улут Батыр", goal: "футбольный клуб" },
    { slug: "korumdu", name: "Корумду курорт", goal: "курорт на Иссык-Куле" },
    { slug: "yntymak", name: "Интемак Тур", goal: "туры по Кыргызстану" },
    { slug: "belek-invest", name: "Белек Нур Инвест", goal: "инвестиционные проекты" },
    { slug: "belek-auto", name: "Белек Авто", goal: "автомобили" },
    { slug: "supara", name: "Супара", goal: "центр отдыха" },
    { slug: "pc-club", name: "Компьютерный клуб", goal: "игровой клуб" },
  ];

  const agents = [
    ...projects.map((p) => ({ slug: `dir-${p.slug}`, name: p.name, role: "директор проекта", kind: "director", project: p.slug })),
    { slug: "marketer", name: "Маркетолог", role: "продвижение", kind: "functional", dept: "marketing" },
    { slug: "designer", name: "Дизайнер", role: "макеты и визуал", kind: "functional", dept: "marketing" },
    { slug: "smm", name: "SMM", role: "соцсети", kind: "functional", dept: "marketing" },
    { slug: "lawyer", name: "Юрист", role: "право", kind: "functional", dept: "legal" },
    { slug: "docs", name: "Документовед", role: "договоры и письма", kind: "functional", dept: "legal" },
    { slug: "accountant", name: "Бухгалтер", role: "учёт и платежи", kind: "functional", dept: "finance" },
    { slug: "buyer", name: "Снабженец", role: "закупки", kind: "functional", dept: "finance" },
    { slug: "ai-rop", name: "AI-РОП", role: "продажи", kind: "product", dept: "products" },
    { slug: "ai-parser", name: "AI-парсер", role: "сбор данных", kind: "product", dept: "products" },
  ].map((a) => ({ ...a, status: "idle", current: null }));

  // Отделы: тот же состав и руководители, что в etb_ai/office/org.py
  const departments = [
    { slug: "marketing", name: "Маркетинг и контент", lead: "marketer", joint: null },
    { slug: "legal", name: "Документы и право", lead: "lawyer", joint: null },
    { slug: "finance", name: "Финансы и снабжение", lead: "accountant", joint: null },
    { slug: "products", name: "Продукты", lead: "ai-rop", joint: null },
  ];

  // Цепочки: директор ставит задачу исполнителю. Где есть approval — действие ждёт кнопки владельца.
  // dept + team — общая задача отдела: руководитель делит её между участниками и собирает итог.
  const scripts = [
    { project: "supara", dept: "marketing", team: ["designer", "smm"], title: "Афиша сезона и пост в Instagram", approval: { by: "smm", action: "Публикация в Instagram" } },
    { project: "korumdu", dept: "legal", team: ["docs", "lawyer"], title: "Договор аренды участка с проверкой рисков" },
    { project: "pc-club", dept: "finance", team: ["buyer", "accountant"], title: "Закупка 10 игровых кресел", approval: { by: "accountant", action: "Оплата счёта на 185 000 сом" } },
    { project: "ulut-batyr", to: "marketer", title: "План набора в академию", then: { to: "designer", title: "Листовка набора" } },
    { project: "korumdu", to: "lawyer", title: "Проверка договора на участок" },
    { project: "belek-invest", to: "docs", title: "Письмо инвестору", approval: "Отправка письма партнёру" },
    { project: "belek-auto", to: "ai-parser", title: "Цены на рынке за неделю", then: { to: "ai-rop", title: "Обзвон заявок по новым ценам" } },
    { project: "supara", to: "docs", title: "Договор аренды зала" },
    { project: "yntymak", to: "marketer", title: "Подборка туров на выходные" },
    { project: "korumdu", to: "accountant", title: "Сверка платежей за месяц" },
    { project: "ulut-batyr", to: "lawyer", title: "Регламент академии" },
  ];

  const tasks = [];
  const events = [];
  const approvals = []; // ожидают решения владельца
  const listeners = new Set();
  const byAgent = (slug) => agents.find((a) => a.slug === slug);
  const byProject = (slug) => projects.find((p) => p.slug === slug);
  const emit = () => listeners.forEach((fn) => fn());
  // Темп показа: во сколько раз медленнее идут события. 1 — быстро, 2.4 — спокойно, удобно объяснять вслух.
  const PACE = 2.4;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms * PACE));
  let nextId = 1;
  let doneToday = 0;

  function log(from, to, text, project) {
    events.unshift({ id: nextId++, at: new Date(), fromSlug: from, toSlug: to, from: byAgent(from).name, to: to ? byAgent(to).name : null, text, project: byProject(project).name });
    if (events.length > 60) events.pop();
  }
  function set(slug, status, current = null) {
    Object.assign(byAgent(slug), { status, current });
  }

  async function run(script, director, depth = 1) {
    const task = { id: nextId++, project: script.project, createdBy: director, assignee: script.to, title: script.title, status: "new", depth, at: new Date() };
    tasks.unshift(task);
    log(director, script.to, script.title, script.project);
    set(director, "idle");
    set(script.to, "working", script.title);
    task.status = "in_progress";
    emit();
    await wait(3200 + Math.random() * 2600);

    if (script.approval) {
      // Действие вовне: сотрудник останавливается и ждёт кнопки. Без неё дальше не идёт.
      set(script.to, "waiting_approval", script.approval);
      const decision = await new Promise((resolve) => {
        approvals.push({ id: nextId++, action: script.approval, title: script.title, agent: byAgent(script.to).name, project: byProject(script.project).name, resolve });
        log(script.to, null, `ждёт вашего решения: ${script.approval.toLowerCase()}`, script.project);
        emit();
      });
      if (decision === "rejected") {
        task.status = "rejected";
        set(script.to, "idle");
        log(script.to, director, `отклонено владельцем — ${script.title}`, script.project);
        emit();
        return;
      }
      log(script.to, null, `одобрено владельцем: ${script.approval.toLowerCase()}`, script.project);
      set(script.to, "working", script.title);
      emit();
      await wait(1600);
    }

    task.status = "review";
    set(script.to, "idle");
    log(script.to, director, `готово — ${script.title}`, script.project);
    // директор занят другой проверкой — дожидаемся
    while (byAgent(director).status !== "idle") await wait(500);
    set(director, "working", `Проверяет: ${script.title}`);
    emit();
    await wait(2000);

    task.status = "done";
    doneToday += 1;
    set(director, "idle");
    log(director, null, `принято — ${script.title}`, script.project);
    emit();
    if (script.then) {
      await wait(900);
      while (byAgent(script.then.to).status !== "idle") await wait(500);
      await run({ ...script.then, project: script.project }, director, depth + 1);
    }
  }

  // Сотрудник делает свою часть; если это действие вовне — стоит и ждёт кнопки владельца.
  async function workPart(slug, title, project, approval) {
    set(slug, "working", title);
    emit();
    await wait(3000 + Math.random() * 2600);
    if (!approval) return true;
    set(slug, "waiting_approval", approval);
    const decision = await new Promise((resolve) => {
      approvals.push({ id: nextId++, action: approval, title, agent: byAgent(slug).name, project: byProject(project).name, resolve });
      log(slug, null, `ждёт вашего решения: ${approval.toLowerCase()}`, project);
      emit();
    });
    log(slug, null, `${decision === "approved" ? "одобрено" : "отклонено"} владельцем: ${approval.toLowerCase()}`, project);
    if (decision !== "approved") return false;
    set(slug, "working", title);
    emit();
    await wait(1500);
    return true;
  }

  // Общая задача отдела: директор → руководитель отдела → участники работают одновременно → итог обратно.
  async function runJoint(script, director) {
    const dept = departments.find((d) => d.slug === script.dept);
    const lead = dept.lead;
    const task = { id: nextId++, project: script.project, createdBy: director, assignee: lead, title: script.title, status: "in_progress", depth: 1, at: new Date() };
    tasks.unshift(task);
    dept.joint = script.title;
    log(director, lead, `${script.title} — отделу «${dept.name}»`, script.project);
    set(director, "idle");
    set(lead, "working", `Делит задачу: ${script.title}`);
    emit();
    await wait(1700);

    const parts = script.team.map((slug) => {
      const part = { id: nextId++, project: script.project, createdBy: lead, assignee: slug, title: `${script.title} — ${byAgent(slug).role}`, status: "in_progress", depth: 2, at: new Date() };
      tasks.unshift(part);
      if (slug !== lead) log(lead, slug, part.title, script.project);
      return part;
    });
    if (!script.team.includes(lead)) set(lead, "idle");
    emit();

    const results = await Promise.all(
      script.team.map(async (slug, i) => {
        const ok = await workPart(slug, parts[i].title, script.project, script.approval && script.approval.by === slug ? script.approval.action : null);
        parts[i].status = ok ? "done" : "rejected";
        set(slug, "idle");
        if (slug !== lead) log(slug, lead, ok ? `готово — ${byAgent(slug).role}` : `не выполнено — ${byAgent(slug).role}`, script.project);
        emit();
        return ok;
      }),
    );

    while (byAgent(lead).status !== "idle") await wait(400);
    set(lead, "working", `Собирает итог: ${script.title}`);
    emit();
    await wait(1800);
    set(lead, "idle");
    task.status = "review";
    log(lead, director, `итог отдела — ${script.title}`, script.project);
    while (byAgent(director).status !== "idle") await wait(400);
    set(director, "working", `Проверяет: ${script.title}`);
    emit();
    await wait(1900);
    task.status = results.every(Boolean) ? "done" : "rejected";
    if (task.status === "done") doneToday += 1;
    dept.joint = null;
    set(director, "idle");
    log(director, null, `${task.status === "done" ? "принято" : "закрыто без результата"} — ${script.title}`, script.project);
    emit();
  }

  // Диспетчер: каждые пару секунд запускает следующую цепочку, если директор и исполнитель свободны.
  async function dispatcher() {
    let i = 0;
    await wait(700);
    for (;;) {
      const script = scripts[i % scripts.length];
      const director = `dir-${script.project}`;
      const busy = agents.filter((a) => a.status !== "idle").length;
      const needed = script.team ? [...script.team, departments.find((d) => d.slug === script.dept).lead] : [script.to];
      const free = needed.every((slug) => byAgent(slug).status === "idle") && (!script.dept || !departments.find((d) => d.slug === script.dept).joint);
      if (busy < 7 && byAgent(director).status === "idle" && free) {
        set(director, "working", `Ставит задачу: ${script.title}`);
        emit();
        await wait(1200);
        // не ждём: цепочки идут параллельно
        if (script.team) runJoint(script, director);
        else run(script, director);
      }
      i += 1;
      await wait(1700 + Math.random() * 1400);
    }
  }

  function decide(id, decision) {
    const index = approvals.findIndex((a) => a.id === id);
    if (index < 0) return;
    const [approval] = approvals.splice(index, 1);
    approval.resolve(decision);
    emit();
  }

  window.office = {
    projects,
    agents,
    departments,
    tasks,
    events,
    approvals,
    stats: () => ({
      working: agents.filter((a) => a.status === "working").length,
      waiting: approvals.length,
      done: doneToday,
      agents: agents.length,
    }),
    approve: (id) => decide(id, "approved"),
    reject: (id) => decide(id, "rejected"),
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };

  dispatcher();
})();
