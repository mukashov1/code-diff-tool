const $ = (id) => document.getElementById(id);
const leftEl = $("left");
const rightEl = $("right");
const outLeft = $("outLeft");
const outRight = $("outRight");
const outWrap = $("outWrap");
const modeEl = $("mode");
const ignoreWsEl = $("ignoreWs");
const wrapEl = $("wrap");
const leftInfo = $("leftInfo");
const rightInfo = $("rightInfo");
const STORAGE_KEY = "converter>code-diff-tool";
const normalize = (s) => (s ?? "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
const countLines = (s) => normalize(s).split("\n").length;

function jsDiffLoaded() {
  if (!window.Diff) {
    outLeft.innerHTML =
      "<div style='padding:12px;color:#b91c1c;font-family:system-ui'>Error: diff library not loaded. Check your internet / CDN access.</div>";
    outRight.innerHTML = "";
    return false;
  }
  return true;
}

function enableScrollSync(a, b) {
  let lock = false;

  function sync(src, dst) {
    if (lock) return;
    lock = true;
    const maxSrc = Math.max(1, src.scrollHeight - src.clientHeight);
    const ratio = src.scrollTop / maxSrc;
    dst.scrollTop = ratio * (dst.scrollHeight - dst.clientHeight);
    dst.scrollLeft = src.scrollLeft;
    lock = false;
  }

  a.addEventListener("scroll", () => sync(a, b), { passive: true });
  b.addEventListener("scroll", () => sync(b, a), { passive: true });
}

function saveState() {
  const state = {
    left: leftEl.value,
    right: rightEl.value,
    mode: modeEl.value,
    ignoreWs: ignoreWsEl.checked,
    wrap: wrapEl.checked,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return false;

  try {
    const s = JSON.parse(raw);
    leftEl.value = s.left ?? "";
    rightEl.value = s.right ?? "";
    modeEl.value = s.mode ?? "lines";
    ignoreWsEl.checked = !!s.ignoreWs;
    wrapEl.checked = !!s.wrap;
    applyWrap();
    return true;
  } catch {
    return false;
  }
}

function applyWrap() {
  leftEl.classList.toggle("wrapText", wrapEl.checked);
  rightEl.classList.toggle("wrapText", wrapEl.checked);
  outWrap.classList.toggle("wrapOut", wrapEl.checked);
}

function inlineDiffNodes(leftStr, rightStr, side, mode) {
  const frag = document.createDocumentFragment();

  const parts =
    mode === "chars"
      ? Diff.diffChars(leftStr ?? "", rightStr ?? "")
      : Diff.diffWordsWithSpace(leftStr ?? "", rightStr ?? "");

  for (const p of parts) {
    if ((side === "left" && p.removed) || (side === "right" && p.added)) {
      const span = document.createElement("span");
      span.textContent = p.value;
      span.className = side === "left" ? "wDel" : "wAdd";
      frag.appendChild(span);
    } else if (!p.added && !p.removed) {
      frag.appendChild(document.createTextNode(p.value));
    }
  }
  return frag;
}

function partToLines(val) {
  const lines = normalize(val).split("\n");
  if (lines.length && lines[lines.length - 1] === "") lines.pop();
  return lines;
}

function buildAlignedRows(oldText, newText, ignoreWhitespace) {
  const parts = Diff.diffLines(normalize(oldText), normalize(newText), {
    ignoreWhitespace: !!ignoreWhitespace,
  });

  const rows = [];
  let oldNo = 1,
    newNo = 1;
  let removedBuf = [];

  const flushRemoved = () => {
    for (const l of removedBuf) {
      rows.push({
        type: "del",
        left: l,
        right: null,
        leftNo: oldNo++,
        rightNo: null,
      });
    }
    removedBuf = [];
  };

  for (const p of parts) {
    const lines = partToLines(p.value);

    if (p.removed) {
      removedBuf.push(...lines);
      continue;
    }

    if (p.added) {
      if (removedBuf.length) {
        const max = Math.max(removedBuf.length, lines.length);

        for (let i = 0; i < max; i++) {
          const l = i < removedBuf.length ? removedBuf[i] : null;
          const r = i < lines.length ? lines[i] : null;

          if (l !== null && r !== null) {
            rows.push({
              type: "chg",
              left: l,
              right: r,
              leftNo: oldNo++,
              rightNo: newNo++,
            });
          } else if (l !== null) {
            rows.push({
              type: "del",
              left: l,
              right: null,
              leftNo: oldNo++,
              rightNo: null,
            });
          } else if (r !== null) {
            rows.push({
              type: "add",
              left: null,
              right: r,
              leftNo: null,
              rightNo: newNo++,
            });
          }
        }

        removedBuf = [];
      } else {
        for (const r of lines) {
          rows.push({
            type: "add",
            left: null,
            right: r,
            leftNo: null,
            rightNo: newNo++,
          });
        }
      }
      continue;
    }

    if (removedBuf.length) flushRemoved();
    for (const l of lines) {
      rows.push({
        type: "eq",
        left: l,
        right: l,
        leftNo: oldNo++,
        rightNo: newNo++,
      });
    }
  }

  if (removedBuf.length) flushRemoved();
  return rows;
}

function makeTable() {
  return document.createElement("table");
}

function addRow(table, cls, line, content) {
  const tr = document.createElement("tr");
  if (cls) tr.className = cls;

  const tdLine = document.createElement("td");
  tdLine.className = "line";
  tdLine.textContent = line == null ? "" : String(line);

  const tdCode = document.createElement("td");
  tdCode.className = "code";

  if (content == null) tdCode.textContent = "";
  else if (typeof content === "string") tdCode.textContent = content;
  else tdCode.appendChild(content);

  tr.appendChild(tdLine);
  tr.appendChild(tdCode);
  table.appendChild(tr);
}

function render(rows) {
  const tL = makeTable();
  const tR = makeTable();

  const mode = modeEl.value;

  for (const r of rows) {
    if (r.type === "eq") {
      addRow(tL, "", r.leftNo, r.left);
      addRow(tR, "", r.rightNo, r.right);
    } else if (r.type === "del") {
      addRow(tL, "del", r.leftNo, r.left);
      addRow(tR, "miss", null, "");
    } else if (r.type === "add") {
      addRow(tL, "miss", null, "");
      addRow(tR, "add", r.rightNo, r.right);
    } else if (r.type === "chg") {
      let leftNode = r.left;
      let rightNode = r.right;

      if (mode === "words" || mode === "chars") {
        leftNode = inlineDiffNodes(r.left, r.right, "left", mode);
        rightNode = inlineDiffNodes(r.left, r.right, "right", mode);
      }

      addRow(tL, "chg", r.leftNo, leftNode);
      addRow(tR, "chg", r.rightNo, rightNode);
    }
  }

  outLeft.replaceChildren(tL);
  outRight.replaceChildren(tR);
}

function renderDiff() {
  if (!jsDiffLoaded()) return;
  const a = leftEl.value;
  const b = rightEl.value;
  leftInfo.textContent = `${countLines(a)} lines`;
  rightInfo.textContent = `${countLines(b)} lines`;
  const rows = buildAlignedRows(a, b, ignoreWsEl.checked);
  render(rows);
}

const loaded = loadState();
if (!loaded) {
  leftEl.value = "Paste a text";
  rightEl.value = "Paste a text";
  applyWrap();
  saveState();
}

const topControlsEl = document.querySelector(".top-controls");
const tcLeftEl = document.querySelector(".tc-left");
const tcRightEl = document.querySelector(".tc-right");
const outHeadEl = document.querySelector(".out-head");
const legendEl = document.getElementById("legend");
let isDocked = false;

function dockLegend() {
  if (isDocked) return;
  if (legendEl && tcRightEl) tcRightEl.prepend(legendEl);
  topControlsEl.classList.add("legend-docked");
  isDocked = true;
}

function undockLegend() {
  if (!isDocked) return;
  if (legendEl && outHeadEl) outHeadEl.appendChild(legendEl);
  topControlsEl.classList.remove("legend-docked");
  isDocked = false;
}

function handleScroll() {
  const outHeadPos = outHeadEl.getBoundingClientRect().top;
  const topH = topControlsEl.getBoundingClientRect().height;
  if (outHeadPos <= topH + 1) dockLegend();
  else undockLegend();
}

window.addEventListener("scroll", handleScroll, { passive: true });
handleScroll();
renderDiff();
enableScrollSync(outLeft, outRight);
enableScrollSync(leftEl, rightEl);
leftEl.addEventListener("input", () => {
  saveState();
  renderDiff();
});
rightEl.addEventListener("input", () => {
  saveState();
  renderDiff();
});

modeEl.addEventListener("change", () => {
  saveState();
  renderDiff();
});

ignoreWsEl.addEventListener("change", () => {
  saveState();
  renderDiff();
});

wrapEl.addEventListener("change", () => {
  applyWrap();
  saveState();
});

$("swap").addEventListener("click", () => {
  const tmp = leftEl.value;
  leftEl.value = rightEl.value;
  rightEl.value = tmp;
  saveState();
  renderDiff();
});

$("copyL").addEventListener("click", () => navigator.clipboard.writeText(leftEl.value));
$("copyR").addEventListener("click", () => navigator.clipboard.writeText(rightEl.value));
