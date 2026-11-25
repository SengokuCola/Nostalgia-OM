import { startLookLab, workbench } from "../src/main";
import { filmOf } from "../src/om3films";
import { previewToneLut } from "../src/tone";
import { drawRollLabel } from "../src/boxlabel";
const fields = [
  ["highlights", "高光"], ["midtones", "中间调"], ["shadows", "阴影"],
  ["whites", "白位"], ["blacks", "黑位"],
];
const get = id => document.getElementById(id);
const number = index => String(index + 1).padStart(2, "0");
const signed = value => value > 0 ? "+" + value : String(value);
const wheel = get("wheel");
let parameter = 0;
const controls = fields.map(([, label], index) => {
  const button = document.createElement("button");
  button.className = "control";
  const readout = document.createElement("span");
  button.append(label, readout);
  button.onclick = () => {
    parameter = index;
    syncDial();
    wheel.focus({preventScroll:true});
  };
  get("controls").append(button);
  return {button, readout};
});
function syncDial() {
  const tone = workbench.selected()?.tone;
  controls.forEach(({button, readout}, index) => {
    button.disabled = !tone;
    readout.textContent = tone ? signed(tone[fields[index][0]]) : "—";
    button.setAttribute("aria-pressed", index === parameter);
  });
  const [key, label] = fields[parameter];
  const value = tone?.[key] ?? 0;
  wheel.setAttribute("aria-disabled", String(!tone));
  wheel.tabIndex = tone ? 0 : -1;
  get("reset").disabled = !tone;
  wheel.setAttribute("aria-label", label);
  wheel.setAttribute("aria-valuenow", value);
  wheel.setAttribute("aria-valuetext", signed(value));
  wheel.style.setProperty("--angle", (value * 18) + "deg");
  get("up").disabled = !tone || value === 7;
  get("down").disabled = !tone || value === -7;
}
function setTone(value) {
  const tone = workbench.selected()?.tone;
  const key = fields[parameter][0];
  value = Math.min(7, Math.max(-7, value));
  if (!tone || tone[key] === value) return;
  workbench.setTone(key, value, Boolean(drag));
  if (!drag) workbench.finishTone();
}
function step(amount) { if (workbench.selected()) setTone(workbench.selected().tone[fields[parameter][0]] + amount); }
get("up").onclick = () => step(1);
get("down").onclick = () => step(-1);
wheel.onkeydown = event => {
  if (["ArrowUp","ArrowRight","ArrowDown","ArrowLeft","Home","End"].includes(event.key)) {
    event.preventDefault();
    if (event.key === "Home") setTone(-7);
    else if (event.key === "End") setTone(7);
    else step(["ArrowUp","ArrowRight"].includes(event.key) ? 1 : -1);
  }
};
function dialAngle(event) {
  const bounds = wheel.getBoundingClientRect();
  return Math.atan2(event.clientX - bounds.left - bounds.width / 2, bounds.top + bounds.height / 2 - event.clientY) * 180 / Math.PI;
}
let drag;
wheel.onpointerdown = event => {
  if (event.button !== 0 || drag || !workbench.selected()) return;
  wheel.focus();
  drag = {id: event.pointerId, last: dialAngle(event), value: workbench.selected()?.tone[fields[parameter][0]]};
  wheel.setPointerCapture(event.pointerId);
};
wheel.onpointermove = event => {
  if (drag?.id !== event.pointerId) return;
  const angle = dialAngle(event);
  const delta = (angle - drag.last + 540) % 360 - 180;
  drag.last = angle;
  drag.value = Math.min(7, Math.max(-7, drag.value + delta / 18));
  setTone(Math.round(drag.value));
};
wheel.onlostpointercapture = () => { drag = undefined; workbench.finishTone(); };

function drawCurve() {
  const canvas = get("curve");
  const w = canvas.clientWidth, h = canvas.clientHeight;
  const scale = devicePixelRatio || 1;
  canvas.width = w * scale;
  canvas.height = h * scale;
  const ctx = canvas.getContext("2d");
  ctx.scale(scale, scale);
  ctx.strokeStyle = "#969d97";
  ctx.beginPath();
  for (let i = 0; i <= 4; i++) {
    ctx.moveTo(w*i/4,0); ctx.lineTo(w*i/4,h);
    ctx.moveTo(0,h*i/4); ctx.lineTo(w,h*i/4);
  }
  ctx.stroke();
  ctx.beginPath();
  if (!workbench.selected()) return;
  const lut = previewToneLut(workbench.selected().tone, 128);
  lut.forEach((y,i) => ctx.lineTo(w*i/128, h-1-y*(h-2)));
  ctx.lineWidth = 2;
  ctx.strokeStyle = "#2b342e";
  ctx.stroke();
}

let displayedLabel;
function syncLabel(look) {
  const label = look?.boxLabel;
  const canvas = get("stock-label");
  const caption = get("stock-caption");
  const definition = JSON.stringify([look?.name, label]);
  if (definition === displayedLabel) return;
  displayedLabel = definition;
  get("stock-label-button").hidden = !look;
  get("stock").classList.toggle("custom-label", Boolean(label));
  caption.hidden = !label?.caption;
  caption.textContent = label?.caption ?? "";
  if (look) {
    const tile = drawRollLabel(look, 192);
    canvas.width = tile.width;
    canvas.height = tile.height;
    canvas.classList.toggle("native-label", tile.classList.contains("native-label"));
    canvas.getContext("2d").drawImage(tile, 0, 0);
  }
}

get("stock-label-button").onclick = get("edit-label").onclick = workbench.editStockLabel;

function syncWorkbench() {
  workbench.renderShelf();
  const look = workbench.selected();
  get("edit-label").hidden = !look;
  syncLabel(look);
  const film = look && filmOf(look);
  get("stock").dataset.process = film?.group ?? "";
  get("film-id").textContent = workbench.slot() < 0 ? "库藏胶卷" : "FILM " + number(workbench.slot());
  get("film-name").textContent = look ? look.name || "未命名" : "空位";
  get("film-type").textContent = !look ? "" : film?.group === "slide" ? "彩色反转片" : film?.group === "neg" ? "彩色负片" : "胶片配方";
  syncDial();
  drawCurve();
}

get("new-roll").onclick = workbench.newRoll;
get("browse-films").onclick = workbench.films;
get("delete-roll").onclick = workbench.deleteRoll;
get("choose").onclick = () => {
  get("film-dialog").showModal();
  document.querySelector("#list li.sel")?.focus();
};
get("list").addEventListener("keydown", event => {
  if (event.target.matches("li.look") && ["Enter", " "].includes(event.key)) {
    event.preventDefault();
    event.target.click();
  }
});
get("list").addEventListener("click", event => {
  if (event.target.closest("li.look") && !event.target.closest("button")) {
    get("film-dialog").close();
  }
});
get("reset").onclick = workbench.resetTone;
get("undo").onclick = workbench.undo;
get("redo").onclick = workbench.redo;
get("export").onclick = workbench.exportBank;
get("write-card").onclick = workbench.quickToCard;
get("workbench-help").onclick = workbench.help;
get("firmware-help").onclick = workbench.install;
get("file").onchange = workbench.onFile;
get("photo").onchange = workbench.onPhoto;
get("grade").onchange = workbench.onGrade;
get("import-grade").onclick = () => get("grade").click();
const menu = get("tools-menu");
menu.querySelectorAll("[data-command]").forEach(button => {
  button.onclick = () => workbench[button.dataset.command]();
});
document.addEventListener("click", event => {
  if (!menu.contains(event.target) || event.target.closest(".tool-items button")) menu.open = false;
});
menu.addEventListener("keydown", event => {
  if (event.key === "Escape") { menu.open = false; menu.querySelector("summary").focus(); }
});
const views = [...document.querySelectorAll(".view-switch [data-view]")];
views.forEach(button => {
  button.onclick = () => {
    get("preview").dataset.view = button.dataset.view;
    views.forEach(other => other.setAttribute("aria-pressed", other === button));
  };
});

function mountZoom(preview) {
  const viewport = preview.querySelector(".pv-viewport");
  const frame = viewport.firstElementChild;
  const button = get("zoom");
  function toggle() {
    const zoomed = preview.dataset.zoom !== "true";
    const width = frame.offsetWidth;
    const height = frame.offsetHeight;
    preview.dataset.zoom = String(zoomed);
    viewport.style.setProperty("--zoom", zoomed ? 2 : 1);
    workbench.showPreviewDetail(zoomed);
    viewport.tabIndex = zoomed ? 0 : -1;
    if (zoomed) viewport.scrollTo((frame.offsetWidth - width) / 2, (frame.offsetHeight - height) / 2);
    button.textContent = zoomed ? "适应" : "放大";
    button.setAttribute("aria-pressed", String(zoomed));
    button.title = zoomed ? "适应窗口" : "放大查看细节（双击照片）";
  }
  button.onclick = toggle;
  viewport.ondblclick = event => {
    if (!event.target.closest(".divider")) toggle();
  };
  let pan;
  viewport.onpointerdown = event => {
    if (preview.dataset.zoom !== "true" || event.button !== 0 || event.target.closest(".divider")) return;
    pan = {id: event.pointerId, x: event.clientX, y: event.clientY, left: viewport.scrollLeft, top: viewport.scrollTop};
    viewport.setPointerCapture(event.pointerId);
  };
  viewport.onpointermove = event => {
    if (!pan || pan.id !== event.pointerId) return;
    viewport.scrollTo(pan.left + pan.x - event.clientX, pan.top + pan.y - event.clientY);
  };
  viewport.onlostpointercapture = () => { pan = undefined; };
}

function mountPreview() {
  workbench.buildPreview("taxi");
  const preview = get("preview");
  mountZoom(preview);
  const options = preview.querySelector(".pv-opts");
  preview.querySelector(".thumbs").before(options);
}

function showPhoto(name) {
  if (get("preview").dataset.zoom === "true") get("zoom").click();
  get("frame-name").textContent = name;

}

export function startDarkroom(resources = {}) {
  new ResizeObserver(drawCurve).observe(get("curve"));
  startLookLab({ ...resources, sync: syncWorkbench, photoChanged: showPhoto }, mountPreview);
}
