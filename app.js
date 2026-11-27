/* =========================================================
   履修ナビ プロトタイプ
   依存なし（PDF解析のみ pdf.js を CDN から任意で利用）
   ========================================================= */
(function () {
  "use strict";

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  const state = {
    transcript: [],
    selected: new Set(),
    enrolled: new Set(),
    filter: "all",
    term: "all",
    source: "sample",
    pdfNote: null,
    pdfEarned: null
  };

  const CAT = {};
  DATA.categories.forEach((c) => (CAT[c.id] = c));

  const GRP = {};
  DATA.groups.forEach((g) => (GRP[g.id] = g));

  const byCode = (code) => DATA.courses.find((c) => c.code === code);

  /* ---------------- screen ---------------- */
  function show(name) {
    $$(".screen").forEach((el) => el.classList.toggle("is-active", el.id === "screen-" + name));
    window.scrollTo(0, 0);
  }

  /* ---------------- data ---------------- */
  function loadSample() {
    state.transcript = DATA.transcript.map(byCode).filter(Boolean);
    state.source = "sample";
    state.selected.clear();
    state.enrolled.clear();
  }

  function computeStats() {
    const earned = {};
    DATA.categories.forEach((c) => (earned[c.id] = 0));
    if (state.pdfEarned) {
      Object.keys(state.pdfEarned.cats).forEach((k) => {
        if (earned[k] !== undefined) earned[k] = state.pdfEarned.cats[k];
      });
      return { earned, total: state.pdfEarned.total };
    }
    state.transcript.forEach((c) => {
      if (earned[c.category] !== undefined) earned[c.category] += c.credits;
    });
    const total = state.transcript.reduce((s, c) => s + c.credits, 0);
    return { earned, total };
  }

  function remainingOf(catId, earned) {
    return Math.max(0, CAT[catId].required - (earned[catId] || 0));
  }

  /* 選択必修の科目群（◆▲■□◎★☆）ごとの修得単位 */
  function computeGroupStats() {
    const earned = {};
    DATA.groups.forEach((g) => (earned[g.id] = 0));
    if (state.pdfEarned) {
      Object.keys(state.pdfEarned.groups).forEach((k) => {
        if (earned[k] !== undefined) earned[k] = state.pdfEarned.groups[k];
      });
      return earned;
    }
    state.transcript.forEach((c) => {
      if (c.group && earned[c.group] !== undefined) earned[c.group] += c.credits;
    });
    return earned;
  }

  function groupShortfalls() {
    const e = computeGroupStats();
    return DATA.groups.filter((g) => (e[g.id] || 0) < g.required);
  }

  function enrolledGroupUnits() {
    const m = {};
    state.enrolled.forEach((code) => {
      const c = byCode(code);
      if (c && c.group) m[c.group] = (m[c.group] || 0) + c.credits;
    });
    return m;
  }

  /* ---------------- render ---------------- */
  function renderDashboard() {
    const { earned, total } = computeStats();
    const required = DATA.categories.reduce((s, c) => s + c.required, 0);
    const pct = Math.min(100, (total / required) * 100);

    $("#student-meta").textContent = DATA.studentLabel;
    $("#total-earned").textContent = total;
    $("#total-required").textContent = required;
    $("#total-pct").textContent = pct.toFixed(1) + "%";
    $("#total-note").textContent =
      total >= required ? "卒業要件を満たしています" : "卒業まであと" + (required - total) + "単位";
    $("#source-badge").textContent =
      state.source === "pdf"
        ? "PDFから" + state.transcript.length + "科目" + (state.pdfEarned ? "・" + state.pdfEarned.total + "単位" : "")
        : "サンプルデータ";
    const note = $("#pdf-note");
    note.hidden = !state.pdfNote;
    note.textContent = state.pdfNote || "";


    const bar = $("#total-bar");
    bar.style.width = "0%";
    requestAnimationFrame(() => requestAnimationFrame(() => (bar.style.width = pct + "%")));

    renderAlert();
    renderCategories(earned);
    renderGroups();
    renderFilters(earned);
    renderCourses(earned);
    updatePlanBar();
  }

  function renderAlert() {
    const box = $("#alert-box");
    const taken = new Set(state.transcript.map((c) => c.code));
    const gs = groupShortfalls();
    const missing = state.pdfEarned
      ? []
      : DATA.courses.filter((c) => c.required && !taken.has(c.code));
    if (!missing.length && !gs.length) {
      box.hidden = true;
      return;
    }
    const units = missing.reduce((s, c) => s + c.credits, 0);
    const names =
      missing.slice(0, 3).map((c) => c.name).join("、") +
      (missing.length > 3 ? " ほか" + (missing.length - 3) + "科目" : "");
    let head;
    if (state.pdfEarned) {
      head = "<strong>選択必修の科目群があと" + gs.length + "群 未充足です</strong>";
    } else if (missing.length) {
      head =
        "<strong>必修科目があと" + missing.length + "科目・" + units + "単位 未修得です</strong>" +
        "<p>" + names + "</p>";
    } else {
      head = "<strong>必修科目はすべて修得済みです</strong>";
    }
    const groupLine =
      !state.pdfEarned && gs.length
        ? "<p>選択必修の科目群があと" + gs.length + "群 未充足（" + gs.map((g) => g.id).join(" ") + "）</p>"
        : "";
    box.hidden = false;
    box.innerHTML = '<div class="alert-ico">!</div><div>' + head + groupLine + "</div>";
  }

  function renderCategories(earned) {
    const wrap = $("#category-list");
    wrap.innerHTML = DATA.categories
      .map((cat) => {
        const e = earned[cat.id] || 0;
        const pct = Math.min(100, (e / cat.required) * 100);
        const rem = Math.max(0, cat.required - e);
        const done = rem === 0;
        return (
          '<div class="cat">' +
          '<div class="cat-head">' +
          '<span class="cat-name"><i style="background:' + cat.color + '"></i>' + cat.name + "</span>" +
          '<span class="cat-num"><b>' + e + "</b> / " + cat.required + "</span>" +
          "</div>" +
          '<div class="bar"><div class="bar-fill" data-w="' + pct + '" style="width:0%;background:' + cat.color + '"></div></div>' +
          '<div class="cat-foot ' + (done ? "is-done" : "") + '">' + (done ? "充足済み" : "あと" + rem + "単位") + "</div>" +
          "</div>"
        );
      })
      .join("");
    requestAnimationFrame(() => {
      $$("#category-list .bar-fill").forEach((el) => (el.style.width = el.dataset.w + "%"));
    });
  }

  function renderGroups() {
    const earned = computeGroupStats();
    const en = enrolledGroupUnits();
    const wrap = $("#group-list");
    wrap.innerHTML = DATA.groups
      .map((g) => {
        const e = earned[g.id] || 0;
        const eg = en[g.id] || 0;
        const pct = Math.min(100, (e / g.required) * 100);
        const rem = Math.max(0, g.required - e);
        const color = (CAT[g.category] || {}).color || "#1d4ed8";
        const status =
          rem === 0
            ? '<span class="g-state g-ok">充足</span>'
            : e === 0
            ? '<span class="g-state g-none">未着手</span>'
            : '<span class="g-state g-rem">あと' + rem + "単位</span>";
        const enLine = eg
          ? '<span class="g-enrolled">履修中' + eg + "単位を含めると " +
            Math.min(g.required, e + eg) + " / " + g.required + "単位" +
            (e + eg >= g.required ? "（充足見込み）" : "（あと" + (g.required - e - eg) + "単位）") +
            "</span>"
          : "";
        return (
          '<div class="group ' + (rem === 0 ? "is-done" : "") + '">' +
          '<div class="group-head">' +
          '<span class="group-sym">' + g.id + "</span>" +
          '<span class="group-name">' + g.name + "</span>" +
          status +
          "</div>" +
          '<div class="bar bar-sm"><div class="bar-fill" data-w="' + pct + '" style="width:0%;background:' + color + '"></div></div>' +
          '<div class="group-meta">' + e + " / " + g.required + "単位 ・ " + g.rule + enLine + "</div>" +
          "</div>"
        );
      })
      .join("");
    requestAnimationFrame(() => {
      $$("#group-list .bar-fill").forEach((el) => (el.style.width = el.dataset.w + "%"));
    });
  }

  function renderFilters(earned) {
    const taken = new Set(state.transcript.map((c) => c.code));
    const hasSelectable = (catId) =>
      DATA.courses.some((c) => !c.required && !taken.has(c.code) && c.category === catId);
    const chips = [{ id: "all", name: "すべて" }].concat(
      DATA.categories
        .filter((c) => remainingOf(c.id, earned) > 0 && hasSelectable(c.id))
        .map((c) => ({ id: c.id, name: c.name }))
    );
    $("#filter-chips").innerHTML = chips
      .map(
        (c) =>
          '<button class="chip ' + (state.filter === c.id ? "is-on" : "") + '" data-filter="' + c.id + '">' + c.name + "</button>"
      )
      .join("");
    $$("#filter-chips .chip").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.filter = btn.dataset.filter;
        renderFilters(earned);
        renderCourses(earned);
      });
    });

    // 学年・学期の絞り込み
    const termOrder = { "前期": 0, "後期": 1, "通年": 2, "集中": 3 };
    const seen = {};
    const terms = [];
    DATA.courses.forEach((c) => {
      if (c.required || taken.has(c.code)) return;
      const key = c.year + "|" + c.term;
      if (seen[key]) return;
      seen[key] = true;
      terms.push({ id: key, year: c.year, term: c.term });
    });
    terms.sort((a, b) => a.year - b.year || (termOrder[a.term] || 9) - (termOrder[b.term] || 9));
    if (state.term !== "all" && !terms.some((t) => t.id === state.term)) state.term = "all";
    const termChips = [{ id: "all", label: "すべての学年" }].concat(
      terms.map((t) => ({ id: t.id, label: t.year + "年" + t.term }))
    );
    $("#term-chips").innerHTML = termChips
      .map(
        (t) =>
          '<button class="chip chip-term ' + (state.term === t.id ? "is-on" : "") + '" data-term="' + t.id + '">' + t.label + "</button>"
      )
      .join("");
    $$("#term-chips .chip").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.term = btn.dataset.term;
        renderFilters(earned);
        renderCourses(earned);
      });
    });
  }

  function renderCourses(earned) {
    const taken = new Set(state.transcript.map((c) => c.code));
    // 必修は自動登録されるため、自分で選ぶ科目（選必・選択）だけを表示する
    let list = DATA.courses.filter((c) => !taken.has(c.code) && !c.required);

    if (state.filter !== "all") list = list.filter((c) => c.category === state.filter);
    if (state.term !== "all") {
      const parts = state.term.split("|");
      list = list.filter((c) => String(c.year) === parts[0] && c.term === parts[1]);
    }

    const termOrder = { "前期": 0, "後期": 1, "通年": 2, "集中": 3 };
    list.sort((a, b) => {
      if (!!b.group !== !!a.group) return (b.group ? 1 : 0) - (a.group ? 1 : 0);
      if (a.year !== b.year) return a.year - b.year;
      return (termOrder[a.term] || 9) - (termOrder[b.term] || 9) || a.code.localeCompare(b.code);
    });

    const wrap = $("#course-list");
    if (!list.length) {
      wrap.innerHTML = '<p class="empty">該当する科目がありません</p>';
      return;
    }

    wrap.innerHTML = list
      .map((c) => {
        const on = state.selected.has(c.code);
        const en = state.enrolled.has(c.code);
        const rem = remainingOf(c.category, earned);
        const fillTag =
          c.required || rem >= c.credits
            ? '<span class="tag tag-fill">' + CAT[c.category].name + "の不足をカバー</span>"
            : "";
        const meta =
          c.code + " ・ " + c.credits + "単位";
        return (
          '<div class="course ' + (on ? "is-on" : "") + (en ? " is-enrolled" : "") + '" data-code="' + c.code + '">' +
          '<div class="course-main">' +
          '<div class="course-tags">' +
          (c.required ? '<span class="tag tag-req">必修</span>' : "") +
          (en ? '<span class="tag tag-enrolled">履修中</span>' : "") +
          (c.group && GRP[c.group] ? '<span class="tag tag-group">' + c.group + " " + GRP[c.group].name + "</span>" : "") +
          '<span class="tag">' + c.year + "年" + c.term + "</span>" +
          fillTag +
          "</div>" +
          '<p class="course-name">' + c.name + "</p>" +
          '<p class="course-meta">' + meta +
          '<button class="enroll-link" data-enroll="' + c.code + '">' + (en ? "履修中を解除" : "履修中にする") + "</button>" +
          "</p>" +
          "</div>" +
          '<button class="add-btn ' + (on ? "is-on" : "") + '">' + (on ? "✓" : "＋") + "</button>" +
          "</div>"
        );
      })
      .join("");

    $$("#course-list .course").forEach((el) => {
      el.addEventListener("click", () => toggleCourse(el.dataset.code, earned));
    });
    $$("#course-list .enroll-link").forEach((el) => {
      el.addEventListener("click", (ev) => {
        ev.stopPropagation();
        toggleEnrolled(el.dataset.enroll, earned);
      });
    });
  }

  function toggleCourse(code, earned) {
    if (state.enrolled.has(code)) return;
    if (state.selected.has(code)) state.selected.delete(code);
    else state.selected.add(code);
    renderCourses(earned);
    updatePlanBar();
  }

  function toggleEnrolled(code, earned) {
    if (state.enrolled.has(code)) state.enrolled.delete(code);
    else {
      state.enrolled.add(code);
      state.selected.delete(code);
    }
    renderCourses(earned);
    updatePlanBar();
  }

  function enrolledCredits() {
    return Array.from(state.enrolled).map(byCode).filter(Boolean).reduce((s, c) => s + c.credits, 0);
  }

  function updatePlanBar() {
    const sel = Array.from(state.selected).map(byCode).filter(Boolean);
    const credits = sel.reduce((s, c) => s + c.credits, 0);
    const total = credits + enrolledCredits();
    const en = state.enrolled.size;
    $("#plan-count").textContent = sel.length + "科目";
    $("#plan-credits").textContent = credits + "単位" + (en ? "（履修中" + en + "科目を含めず）" : "");
    $("#btn-plan").disabled = sel.length === 0;
    $("#planbar").classList.toggle("is-warn", total > 42);
  }

  /* ---------------- modal ---------------- */
  function openPlan() {
    const sel = Array.from(state.selected).map(byCode).filter(Boolean);
    const credits = sel.reduce((s, c) => s + c.credits, 0);
    const enCredits = enrolledCredits();
    const over = credits + enCredits > 42;

    const gEarned = computeGroupStats();
    const gEnrolled = enrolledGroupUnits();
    const gSel = {};
    sel.forEach((c) => {
      if (c.group) gSel[c.group] = (gSel[c.group] || 0) + c.credits;
    });

    const planGroups = DATA.groups.map((g) => {
      const e = gEarned[g.id] || 0;
      const en = gEnrolled[g.id] || 0;
      const se = gSel[g.id] || 0;
      return { g: g, e: e, en: en, se: se, rem: g.required - e - en - se };
    });
    const pending = planGroups.filter((p) => p.e < p.g.required);
    const groupBlock = pending.length
      ? '<div class="plan-groups">' +
        '<p class="plan-groups-title">科目群チェック（この計画を含む）</p>' +
        pending
          .map((p) => {
            const parts = ["修得" + p.e];
            if (p.en) parts.push("履修中" + p.en);
            if (p.se) parts.push("選択中" + p.se);
            const ok = p.rem <= 0;
            return (
              '<div class="plan-group ' + (ok ? "is-ok" : "") + '">' +
              '<span class="plan-group-sym">' + p.g.id + "</span>" +
              "<span>" + p.g.name + "</span>" +
              "<b>" + (ok ? "✓ 充足" : "あと" + p.rem + "単位") +
              "<small>" + parts.join("＋") + "＝" + (p.e + p.en + p.se) + " / " + p.g.required + "単位</small></b></div>"
            );
          })
          .join("") +
        "</div>"
      : '<div class="plan-groups is-ok"><p class="plan-groups-title">選択必修の科目群はすべて充足しています</p></div>';

    $("#modal-title").textContent = "履修計画（案）";
    $("#modal-body").innerHTML =
      '<div class="plan-summary ' + (over ? "is-over" : "") + '">' +
      "<div><span>選必・選択</span><strong>" + sel.length + "科目</strong></div>" +
      "<div><span>合計単位数</span><strong>" + credits + "単位</strong></div>" +
      (enCredits ? "<div><span>履修中</span><strong>" + state.enrolled.size + "科目・" + enCredits + "単位</strong></div>" : "") +
      "</div>" +
      (over ? '<p class="plan-warn">履修中と選必・選択の合計が42単位を超えています（CAP制）。</p>' : "") +
      '<ul class="plan-list">' +
      sel
        .map(
          (c) =>
            "<li><div>" +
            '<p class="plan-name">' + c.name + "</p>" +
            '<p class="plan-meta">' + CAT[c.category].name + " ・ " + c.credits + "単位 ・ " + c.year + "年" + c.term + "</p>" +
            "</div>" +
            '<button class="rm-btn" data-rm="' + c.code + '" aria-label="削除">×</button></li>'
        )
        .join("") +
      "</ul>" +
      groupBlock +
      '<p class="plan-note">必修科目は自動登録されるため、この合計には含まれていません。「履修中にする」を付けた科目は登録済みとして扱い、この計画からは除外しています。この計画をもとに、履修登録期間にUNIPAで登録します。選択必修・選択科目は抽選のため、申込期間（2026年度後期は9/15〜9/18）に忘れず申し込んでください。</p>';

    $("#modal").hidden = false;
    document.body.classList.add("no-scroll");

    $$("#modal-body [data-rm]").forEach((b) => {
      b.addEventListener("click", () => {
        state.selected.delete(b.dataset.rm);
        renderCourses(computeStats().earned);
        updatePlanBar();
        if (state.selected.size === 0) closeModal();
        else openPlan();
      });
    });
  }

  function closeModal() {
    $("#modal").hidden = true;
    document.body.classList.remove("no-scroll");
  }

  /* ---------------- loading ---------------- */
  const STEPS = ["成績データを読み込んでいます…", "科目コードを照合しています…", "卒業要件と比較しています…"];
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  async function loadingSequence() {
    show("loading");
    const el = $("#loading-text");
    el.textContent = STEPS[0];
    await wait(500);
    el.textContent = STEPS[1];
    await wait(500);
    el.textContent = STEPS[2];
    await wait(500);
  }

  /* ---------------- PDF ---------------- */
  const HALF_KANA =
    "ｦｧｨｩｪｫｬｭｮｯｰｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ";
  const FULL_KANA =
    "ヲァィゥェォャュョッーアイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワン";
  const VOICED = {
    カ: "ガ", キ: "ギ", ク: "グ", ケ: "ゲ", コ: "ゴ",
    サ: "ザ", シ: "ジ", ス: "ズ", セ: "ゼ", ソ: "ゾ",
    タ: "ダ", チ: "ヂ", ツ: "ヅ", テ: "デ", ト: "ド",
    ハ: "バ", ヒ: "ビ", フ: "ブ", ヘ: "ベ", ホ: "ボ", ウ: "ヴ"
  };
  const SEMI = { ハ: "パ", ヒ: "ピ", フ: "プ", ヘ: "ペ", ホ: "ポ" };

  function toFullKana(s) {
    let out = "";
    for (let i = 0; i < s.length; i++) {
      const k = HALF_KANA.indexOf(s[i]);
      if (k < 0) {
        out += s[i];
        continue;
      }
      const base = FULL_KANA[k];
      const next = s[i + 1];
      if (next === "ﾞ" && VOICED[base]) {
        out += VOICED[base];
        i++;
      } else if (next === "ﾟ" && SEMI[base]) {
        out += SEMI[base];
        i++;
      } else {
        out += base;
      }
    }
    return out;
  }

  function normalize(s) {
    return toFullKana(s)
      .replace(/[※\s　]/g, "")
      .replace(/[！-～]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
      .toLowerCase();
  }

  /* 「単位修得状況表」の行を拾う（数値3つ＋ラベル、2つの行もある） */
  function parseCreditRows(text) {
    const lines = text.split(/\n/).map((l) => l.trim()).filter(Boolean);
    const rows = [];
    let vals = [];
    for (const ln of lines) {
      if (/^[-+]?\d+(\.\d+)?$/.test(ln)) {
        vals.push(parseFloat(ln));
        continue;
      }
      if (vals.length) {
        rows.push({ label: ln, vals: vals.length > 3 ? vals.slice(-3) : vals.slice() });
        vals = [];
      }
    }
    return rows;
  }

  function earnedFromRows(rows) {
    if (!rows || !rows.length) return null;
    const first = (label) => {
      const r = rows.find((x) => x.label === label && x.vals.length >= 2);
      return r ? r.vals[0] : null;
    };
    const cats = {
      basic: first("基礎科目"),
      keiei: first("経営"),
      ict: first("ICT"),
      ryoiki: first("領域共通"),
      sentaku: first("選択合計"),
      kokusai: first("国際"),
      sogo: first("総合")
    };
    const groups = {
      "◆": first("選必◆"),
      "▲": first("選必▲"),
      "■": first("選必■"),
      "□": first("選必□"),
      "◎": first("選必◎"),
      "★": first("選必★"),
      "☆": first("選必☆")
    };
    const known = Object.keys(cats).filter((k) => cats[k] !== null);
    if (known.length < 6) return null;
    Object.keys(cats).forEach((k) => {
      if (cats[k] === null) cats[k] = 0;
    });
    Object.keys(groups).forEach((k) => {
      if (groups[k] === null) groups[k] = 0;
    });
    const total = first("総計");
    const sum = Object.keys(cats).reduce((s, k) => s + cats[k], 0);
    return { cats, groups, total: total !== null ? total : sum };
  }

  async function extractPdf(file) {
    if (!window.pdfjsLib) return null;
    window.pdfjsLib.GlobalWorkerOptions.workerSrc =
      "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
    const buf = await file.arrayBuffer();
    const pdf = await window.pdfjsLib.getDocument({ data: buf }).promise;
    let text = "";
    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const content = await page.getTextContent();
      text += content.items.map((i) => i.str).join("\n") + "\n";
    }
    const t = normalize(text);
    const matched = DATA.courses.filter((c) => {
      if (c.required) return false; // 必修は自動登録なので、選択肢の除外判定には使わない
      const n = normalize(c.name);
      return n.length >= 3 && t.includes(n);
    });
    const earned = earnedFromRows(parseCreditRows(text));
    return { matched, earned, pages: pdf.numPages };
  }

  /* ---------------- flows ---------------- */
  async function startSample() {
    loadSample();
    await loadingSequence();
    renderDashboard();
    show("dashboard");
  }

  async function startPdf(file) {
    state.selected.clear();
    state.enrolled.clear();
    let res = null;
    try {
      res = await extractPdf(file);
    } catch (e) {
      res = null;
    }
    await loadingSequence();
    if (res && res.matched.length >= 5) {
      state.transcript = res.matched;
      state.source = "pdf";
      state.pdfEarned = res.earned;
      state.pdfNote = res.earned
        ? "PDFから " + res.matched.length + "科目・修得" + res.earned.total + "単位 を読み取りました。修得済みの科目は選択肢から外しています。"
        : "PDFから " + res.matched.length + "科目 を読み取りました。修得済みの科目は選択肢から外しています。";
    } else {
      loadSample();
      state.pdfEarned = null;
      state.pdfNote = res && res.matched
        ? "PDFからは " + res.matched.length + "科目 しか読み取れませんでした（サンプルで表示中）。"
        : "PDFの文字を読み取れませんでした（画像PDFか、科目名がデータと一致しない可能性）。サンプルで表示中。";
    }
    renderDashboard();
    show("dashboard");
  }

  function reset() {
    state.transcript = [];
    state.selected.clear();
    state.enrolled.clear();
    state.filter = "all";
    state.term = "all";
    state.source = "sample";
    state.pdfNote = null;
    state.pdfEarned = null;
    show("landing");
  }

  /* ---------------- init ---------------- */
  document.addEventListener("DOMContentLoaded", () => {
    $("#btn-sample").addEventListener("click", startSample);

    $("#pdf-input").addEventListener("change", (e) => {
      const file = e.target.files && e.target.files[0];
      if (file) startPdf(file);
      e.target.value = "";
    });

    $("#btn-reset").addEventListener("click", reset);
    $("#btn-plan").addEventListener("click", openPlan);
    $("#modal-close").addEventListener("click", closeModal);
    $("#modal-ok").addEventListener("click", closeModal);

    $("#modal").addEventListener("click", (e) => {
      if (e.target.id === "modal") closeModal();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !$("#modal").hidden) closeModal();
    });

    show("landing");

    /* ?demo=1 でダッシュボードを直接開く（発表・スクショ用） */
    if (new URLSearchParams(location.search).has("demo")) startSample();
  });

  /* ---------------- PWA ---------------- */
  /* オフライン動作用の service worker。file:// では登録できないので失敗は無視する。 */
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js").catch(() => {});
    });
  }
})();
