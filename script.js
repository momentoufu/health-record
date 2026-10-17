(() => {
  "use strict";

  const STORAGE_KEY = "childHealthRecordApp_v1";
  const DEFAULT_SYMPTOMS = ["鼻水", "せき", "発熱", "じんましん", "発疹"];
  const $ = (id) => document.getElementById(id);

  const today = new Date();
  let selectedDate = dateString(today);
  let calendarMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  let activeChildId = null;
  let editingRecordId = null;
  let data = loadData();

  function dateString(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  function makeId() {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }
  function loadData() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (saved && Array.isArray(saved.children) && Array.isArray(saved.symptoms) && Array.isArray(saved.records)) {
        return saved;
      }
    } catch (error) { console.warn("保存データを読み込めませんでした", error); }
    return { children: [], symptoms: [...DEFAULT_SYMPTOMS], records: [] };
  }
  function saveData() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }
  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[char]);
  }
  function showScreen(screenId) {
    document.querySelectorAll(".screen").forEach(screen => screen.classList.toggle("hidden", screen.id !== screenId));
    document.querySelectorAll(".nav-button").forEach(button => {
      button.classList.toggle("active", button.dataset.screen === screenId);
    });
    if (screenId === "calendar-screen") renderCalendar();
    if (screenId === "settings-screen") renderSettings();
  }
  function childById(id) { return data.children.find(child => child.id === id); }
  function formatDate(date) {
    const [y, m, d] = date.split("-").map(Number);
    return `${y}年${m}月${d}日`;
  }
  function formatTemperatures(record) {
    // 旧バージョンの単一検温データも表示できるようにする
    if (record.temperatureMorning !== undefined || record.temperatureNoon !== undefined || record.temperatureNight !== undefined) {
      const parts = [["朝", record.temperatureMorning], ["昼", record.temperatureNoon], ["夜", record.temperatureNight]]
        .filter(([, value]) => value !== "" && value !== null && value !== undefined)
        .map(([label, value]) => `${label} ${escapeHtml(value)}℃`);
      return parts.length ? parts.join(" / ") : "未入力";
    }
    return record.temperature !== "" && record.temperature !== null && record.temperature !== undefined
      ? `${escapeHtml(record.temperature)}℃` : "未入力";
  }

  function getCalendarSymptomRows(dayRecords) {
    const iconBySymptom = [
      { match: "鼻水", icon: "👃" },
      { match: "せき", icon: "😷" },
      { match: "発熱", icon: "🌡️" },
      { match: "じんましん", icon: "🖐️" },
      { match: "発疹", icon: "🔴" }
    ];
    return data.children.map(child => {
      const record = dayRecords.find(item => item.childId === child.id);
      const icons = (Array.isArray(record?.symptoms) ? record.symptoms : [])
        .map(symptom => {
          const found = iconBySymptom.find(item => symptom.includes(item.match));
          return found ? { symptom, icon: found.icon } : null;
        })
        .filter(Boolean)
        .slice(0, 3);
      return { childId: child.id, icons };
    });
  }

  function renderCalendar() {
    $("month-label").textContent = `${calendarMonth.getFullYear()}年${calendarMonth.getMonth() + 1}月`;
    const calendar = $("calendar");
    calendar.innerHTML = "";
    ["日", "月", "火", "水", "木", "金", "土"].forEach(day => {
      const cell = document.createElement("div");
      cell.className = "calendar-cell weekday";
      cell.textContent = day;
      calendar.appendChild(cell);
    });

    const firstDay = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1);
    const daysInMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 0).getDate();
    for (let i = 0; i < firstDay.getDay(); i++) {
      const empty = document.createElement("div");
      empty.className = "calendar-cell empty";
      calendar.appendChild(empty);
    }
    for (let day = 1; day <= daysInMonth; day++) {
      const date = dateString(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), day));
      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "calendar-cell";
      if (date === selectedDate) cell.classList.add("selected");
      if (date === dateString(new Date())) cell.classList.add("today");
      const dayRecords = data.records.filter(record => record.date === date);
      const symptomRows = getCalendarSymptomRows(dayRecords);
      cell.innerHTML = `<span class="day-number">${day}</span>${
        symptomRows.length
          ? `<span class="calendar-symptom-rows">${symptomRows.map(row =>
              `<span class="calendar-symptom-row" title="${escapeHtml(childById(row.childId)?.name || "")}" style="background-color:${escapeHtml(childById(row.childId)?.bgColor || "#9aa0a6")}">${
                row.icons.map(item =>
                  `<span class="calendar-symptom-icon" title="${escapeHtml(item.symptom)}" aria-label="${escapeHtml(item.symptom)}">${item.icon}</span>`
                ).join("")
              }</span>`
            ).join("")}</span>`
          : ""}`;
      cell.addEventListener("click", () => {
        selectedDate = date;
        renderCalendar();
      });
      calendar.appendChild(cell);
    }

    const buttons = $("child-buttons");
    buttons.innerHTML = "";
    if (!data.children.length) {
      buttons.innerHTML = '<p class="hint">設定画面から子どもを登録してください。</p>';
    } else {
      data.children.forEach(child => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "child-button";
        button.textContent = child.name;
        button.style.backgroundColor = child.bgColor;
        button.style.color = child.textColor;
        button.addEventListener("click", () => openRecordForm(child.id));
        buttons.appendChild(button);
      });
    }
    renderDayRecords();
  }

  function renderDayRecords() {
    $("selected-date-label").textContent = `${formatDate(selectedDate)}の記録`;
    const target = $("records-for-day");
    const records = data.records.filter(record => record.date === selectedDate)
      .sort((a, b) => (childById(a.childId)?.name || "").localeCompare(childById(b.childId)?.name || "", "ja"));
    if (!records.length) {
      target.innerHTML = '<p class="hint">この日の記録はありません。</p>';
      return;
    }
    target.innerHTML = records.map(record => {
      const child = childById(record.childId);
      const symptoms = Array.isArray(record.symptoms) && record.symptoms.length ? record.symptoms.join("、") : "なし";
      return `<article class="record-card">
        <strong>${escapeHtml(child?.name || "登録解除された子ども")}</strong>
        <span>機嫌：${escapeHtml(record.mood || "未設定")}</span>
        <p>検温：${formatTemperatures(record)}</p>
        <p>症状：${escapeHtml(symptoms)}</p>
        ${record.memo ? `<p>メモ：${escapeHtml(record.memo)}</p>` : ""}
        <div class="record-actions">
          <button type="button" data-edit="${escapeHtml(record.id)}">編集</button>
          <button type="button" data-delete="${escapeHtml(record.id)}">削除</button>
        </div>
      </article>`;
    }).join("");
    target.querySelectorAll("[data-edit]").forEach(button => button.addEventListener("click", () => {
      const record = data.records.find(item => item.id === button.dataset.edit);
      if (record) openRecordForm(record.childId, record);
    }));
    target.querySelectorAll("[data-delete]").forEach(button => button.addEventListener("click", () => {
      if (!confirm("この記録を削除しますか？")) return;
      data.records = data.records.filter(item => item.id !== button.dataset.delete);
      saveData();
      renderCalendar();
    }));
  }

  function openRecordForm(childId, record = null) {
    activeChildId = childId;
    editingRecordId = record?.id || null;
    const child = childById(childId);
    $("record-title").textContent = `${child?.name || "子ども"}の体調記録${record ? "（編集）" : ""}`;
    $("record-date").value = record?.date || selectedDate;
    $("mood").value = record?.mood || "普通";
    $("temperature-morning").value = record?.temperatureMorning ?? "";
    $("temperature-noon").value = record?.temperatureNoon ?? "";
    $("temperature-night").value = record?.temperatureNight ?? "";
    // 旧バージョンの記録を編集する場合は、既存の検温値を朝の欄に表示
    if (record && record.temperatureMorning === undefined && record.temperature !== undefined && record.temperature !== "") {
      $("temperature-morning").value = record.temperature;
    }
    $("memo").value = record?.memo || "";
    renderSymptomOptions(record?.symptoms || []);
    showScreen("record-screen");
  }
  function renderSymptomOptions(checkedSymptoms) {
    const options = $("symptom-options");
    options.innerHTML = "";
    if (!data.symptoms.length) {
      options.innerHTML = '<p class="hint">設定画面から症状を登録してください。</p>';
      return;
    }
    data.symptoms.forEach((symptom, index) => {
      const label = document.createElement("label");
      const input = document.createElement("input");
      input.type = "checkbox";
      input.name = "symptoms";
      input.value = symptom;
      input.checked = checkedSymptoms.includes(symptom);
      label.append(input, document.createTextNode(symptom));
      options.appendChild(label);
    });
  }

  function renderSettings() {
    const childrenList = $("children-list");
    childrenList.innerHTML = "";
    data.children.forEach(child => {
      const li = document.createElement("li");
      li.innerHTML = `<span class="color-preview" style="background:${escapeHtml(child.bgColor)};color:${escapeHtml(child.textColor)}"></span>
        <span class="item-name">${escapeHtml(child.name)}</span>
        <button type="button" class="small-button" data-child-edit="${escapeHtml(child.id)}">編集</button>
        <button type="button" class="small-button" data-child-delete="${escapeHtml(child.id)}">削除</button>`;
      childrenList.appendChild(li);
    });
    $("child-form").querySelector('button[type="submit"]').disabled = data.children.length >= 3;
    $("child-form").querySelector('button[type="submit"]').textContent = data.children.length >= 3 ? "登録上限" : "追加";

    childrenList.querySelectorAll("[data-child-edit]").forEach(button => button.addEventListener("click", () => {
      const child = childById(button.dataset.childEdit);
      if (!child) return;
      const name = prompt("子どもの名前", child.name);
      if (name === null) return;
      const trimmed = name.trim();
      if (!trimmed) { alert("名前を入力してください。"); return; }
      const textColor = prompt("文字色のカラーコード（例：#ffffff）", child.textColor);
      if (textColor === null) return;
      const bgColor = prompt("背景色のカラーコード（例：#5b8def）", child.bgColor);
      if (bgColor === null) return;
      if (!/^#[0-9a-f]{6}$/i.test(textColor.trim()) || !/^#[0-9a-f]{6}$/i.test(bgColor.trim())) {
        alert("色は #ffffff の形式で入力してください。"); return;
      }
      child.name = trimmed;
      child.textColor = textColor.trim();
      child.bgColor = bgColor.trim();
      saveData(); renderSettings(); renderCalendar();
    }));
    childrenList.querySelectorAll("[data-child-delete]").forEach(button => button.addEventListener("click", () => {
      const child = childById(button.dataset.childDelete);
      if (!child || !confirm(`${child.name}を登録解除しますか？\n過去の記録は残ります。`)) return;
      data.children = data.children.filter(item => item.id !== child.id);
      saveData(); renderSettings(); renderCalendar();
    }));

    const symptomsList = $("symptoms-list");
    symptomsList.innerHTML = "";
    data.symptoms.forEach((symptom, index) => {
      const li = document.createElement("li");
      li.innerHTML = `<span class="item-name">${escapeHtml(symptom)}</span>
        <button type="button" class="small-button" data-symptom-up="${index}" ${index === 0 ? "disabled" : ""}>↑</button>
        <button type="button" class="small-button" data-symptom-down="${index}" ${index === data.symptoms.length - 1 ? "disabled" : ""}>↓</button>
        <button type="button" class="small-button" data-symptom-edit="${index}">編集</button>
        <button type="button" class="small-button" data-symptom-delete="${index}">削除</button>`;
      symptomsList.appendChild(li);
    });
    symptomsList.querySelectorAll("[data-symptom-up]").forEach(button => button.addEventListener("click", () => moveSymptom(Number(button.dataset.symptomUp), -1)));
    symptomsList.querySelectorAll("[data-symptom-down]").forEach(button => button.addEventListener("click", () => moveSymptom(Number(button.dataset.symptomDown), 1)));
    symptomsList.querySelectorAll("[data-symptom-edit]").forEach(button => button.addEventListener("click", () => {
      const index = Number(button.dataset.symptomEdit);
      const updated = prompt("症状名を編集", data.symptoms[index]);
      if (updated === null) return;
      if (!updated.trim()) { alert("症状名を入力してください。"); return; }
      const oldName = data.symptoms[index];
      const newName = updated.trim();
      data.symptoms[index] = newName;
      data.records.forEach(record => {
        if (Array.isArray(record.symptoms)) record.symptoms = record.symptoms.map(value => value === oldName ? newName : value);
      });
      saveData(); renderSettings();
    }));
    symptomsList.querySelectorAll("[data-symptom-delete]").forEach(button => button.addEventListener("click", () => {
      const index = Number(button.dataset.symptomDelete);
      const symptom = data.symptoms[index];
      if (!confirm(`「${symptom}」を削除しますか？過去の記録の症状表示はそのまま残ります。`)) return;
      data.symptoms.splice(index, 1);
      saveData(); renderSettings();
    }));
  }
  function moveSymptom(index, direction) {
    const next = index + direction;
    if (next < 0 || next >= data.symptoms.length) return;
    [data.symptoms[index], data.symptoms[next]] = [data.symptoms[next], data.symptoms[index]];
    saveData(); renderSettings();
  }

  document.querySelectorAll("[data-screen]").forEach(button => button.addEventListener("click", () => showScreen(button.dataset.screen)));
  $("prev-month").addEventListener("click", () => {
    calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1);
    renderCalendar();
  });
  $("next-month").addEventListener("click", () => {
    calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1);
    renderCalendar();
  });
  $("cancel-record").addEventListener("click", () => showScreen("calendar-screen"));

  $("record-form").addEventListener("submit", event => {
    event.preventDefault();
    if (!activeChildId || !childById(activeChildId)) {
      alert("設定画面から子どもを登録してください。"); return;
    }
    const symptoms = [...document.querySelectorAll('input[name="symptoms"]:checked')].map(input => input.value);
    const record = {
      id: editingRecordId || makeId(),
      childId: activeChildId,
      date: $("record-date").value,
      mood: $("mood").value,
      temperatureMorning: $("temperature-morning").value === "" ? "" : Number($("temperature-morning").value),
      temperatureNoon: $("temperature-noon").value === "" ? "" : Number($("temperature-noon").value),
      temperatureNight: $("temperature-night").value === "" ? "" : Number($("temperature-night").value),
      symptoms,
      memo: $("memo").value.trim()
    };
    if (!record.date) { alert("日付を入力してください。"); return; }
    if (editingRecordId) {
      const index = data.records.findIndex(item => item.id === editingRecordId);
      if (index >= 0) data.records[index] = record;
      else data.records.push(record);
    } else {
      data.records.push(record);
    }
    selectedDate = record.date;
    calendarMonth = new Date(Number(record.date.slice(0, 4)), Number(record.date.slice(5, 7)) - 1, 1);
    saveData();
    showScreen("calendar-screen");
  });

  $("child-form").addEventListener("submit", event => {
    event.preventDefault();
    const name = $("child-name").value.trim();
    if (!name) return;
    if (data.children.length >= 3) { alert("子どもは最大3人まで登録できます。"); return; }
    if (data.children.some(child => child.name === name)) { alert("同じ名前が登録されています。"); return; }
    data.children.push({
      id: makeId(),
      name,
      textColor: $("child-text-color").value,
      bgColor: $("child-bg-color").value
    });
    $("child-name").value = "";
    saveData(); renderSettings(); renderCalendar();
  });

  $("symptom-form").addEventListener("submit", event => {
    event.preventDefault();
    const symptom = $("new-symptom").value.trim();
    if (!symptom) return;
    if (data.symptoms.includes(symptom)) { alert("その症状はすでに登録されています。"); return; }
    data.symptoms.push(symptom);
    $("new-symptom").value = "";
    saveData(); renderSettings();
  });

  $("export-data").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `子どもの体調記録バックアップ-${dateString(new Date())}.json`;
    link.click();
    URL.revokeObjectURL(url);
  });
  $("import-data").addEventListener("change", async event => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const imported = JSON.parse(await file.text());
      if (!imported || !Array.isArray(imported.children) || !Array.isArray(imported.symptoms) || !Array.isArray(imported.records)) {
        throw new Error("形式が正しくありません");
      }
      if (!confirm("現在の記録と設定をバックアップデータで置き換えますか？")) return;
      data = {
        children: imported.children.slice(0, 3),
        symptoms: imported.symptoms,
        records: imported.records
      };
      saveData(); renderSettings(); renderCalendar();
      alert("復元しました。");
    } catch (error) {
      alert("バックアップを読み込めませんでした。正しいファイルを選択してください。");
    } finally {
      event.target.value = "";
    }
  });

  renderCalendar();
})();
