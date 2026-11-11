// Funcionamiento común de las páginas de proyecto (proyectos/<slug>/index.html): sección del edificio
// (Planta / Modelo 3D), carrusel de interiores con vista ampliada y cuadro de tipologías.
// Cada página trae su configuración en <script type="application/json" id="config"> y sus unidades en un CSV
// (una fila por departamento: codigo, piso, posicion, tipologia, area_m2, dormitorios, banos, prueba).
// Para pasar a cifras reales basta con reemplazar el CSV; la columna «prueba» vacía quita la marca roja.

const C = JSON.parse(document.getElementById("config").textContent);
const SVGNS = "http://www.w3.org/2000/svg";
const $ = (s) => document.querySelector(s);
const fmt = (n, d = 2) => n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
const tinta = (t) => `var(--t${t})`;
const track = (accion) => window.trackCTA?.(`${C.ref}_${accion}`, `proyecto-${C.ref}`);
const nombreTipo = (t) => C.tipologias?.[t] ?? `Tipo ${t}`;
let unidades = [];

function el(tag, attrs = {}, ns) {
  const e = ns ? document.createElementNS(ns, tag) : document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
}

// ---------- Llegada desde el portafolio ----------
// ?desde=portafolio: el «← Proyectos» vuelve al portafolio (no a la landing) mientras dure la visita.
(function desdePortafolio() {
  let url = null;
  try {
    if (new URLSearchParams(location.search).get("desde") === "portafolio") {
      url = document.referrer && new URL(document.referrer).origin === location.origin ? document.referrer : new URL("../../portafolio/", location.href).href;
      sessionStorage.setItem("portafolio", url);
    } else url = sessionStorage.getItem("portafolio");
  } catch { /* sin almacenamiento: se queda el enlace a la landing */ }
  if (!url) return;
  document.querySelectorAll("a.volver").forEach((a) => { a.href = url; if (a.textContent.includes("Proyectos")) a.textContent = "← Portafolio"; });
  document.querySelectorAll("a.brand").forEach((a) => { a.href = url; });
})();

// ---------- Plantas: una pestaña por planta distinta ----------
// Los pisos consecutivos que usan la misma planta se agrupan en «Planta típica»; sus departamentos se nombran
// con X en lugar del número de piso (X05). Un nivel con «unidadesDe» (segundo nivel de un dúplex) va aparte.
const grupos = [];
for (const p of C.pisos) {
  const ult = grupos.at(-1);
  if (ult && ult.planta === p.planta && !p.unidadesDe && !ult.pisos[0].unidadesDe) ult.pisos.push(p);
  else grupos.push({ planta: p.planta, pisos: [p] });
}
for (const g of grupos) {
  const n = g.pisos.length, a = g.pisos[0], z = g.pisos.at(-1);
  g.nombre = n > 1 ? "Planta típica" : a.nombre;
  g.rango = n > 1 ? `${a.etiqueta ?? a.id} al ${z.etiqueta ?? z.id}` : "";
}
// ?piso=6 en la URL abre la planta de ese piso.
const pisoUrl = new URLSearchParams(location.search).get("piso") ?? C.pisoInicial;
let grupo = grupos.find((g) => g.pisos.some((p) => p.id === pisoUrl)) ?? grupos[0];

function pintarTabs() {
  $("#tabs").replaceChildren(...grupos.map((g) => {
    const b = el("button", { class: "chip", type: "button", "aria-pressed": String(g === grupo) });
    b.innerHTML = g.nombre + (g.rango ? `<small>${g.rango}</small>` : "");
    b.addEventListener("click", () => { grupo = g; pintarTabs(); pintarPlanta(); track("planta_" + g.pisos[0].id); });
    return b;
  }));
}

// Centro de área del polígono (no el promedio de vértices, que se va hacia donde hay más quiebres).
function centroide(pts) {
  let a = 0, x = 0, y = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x0, y0] = pts[i], [x1, y1] = pts[(i + 1) % pts.length], k = x0 * y1 - x1 * y0;
    a += k; x += (x0 + x1) * k; y += (y0 + y1) * k;
  }
  return Math.abs(a) < 1e-6 ? pts[0] : [x / (3 * a), y / (3 * a)];
}

function pintarEjes(svg) {
  const E = C.ejes;
  if (!E) return;
  const g = el("g", { class: "ejes", "aria-hidden": "true" }, SVGNS);
  for (const [x1, y1, x2, y2] of E.lineas ?? []) g.append(el("line", { x1, y1, x2, y2 }, SVGNS));
  for (const b of E.burbujas ?? []) {
    g.append(el("circle", { cx: b.x, cy: b.y, r: E.r }, SVGNS));
    const t = el("text", { x: b.x, y: b.y, "text-anchor": "middle", "dominant-baseline": "central", "font-size": E.r * 1.05 }, SVGNS);
    t.textContent = b.t;
    g.append(t);
  }
  svg.append(g);
}

function pintarPlanta() {
  const g = grupo, ps = g.pisos[0], p = C.plantas[g.planta], vista = p?.vista ?? C.vista;
  $("#planta-titulo").textContent = g.nombre + (g.rango ? `, pisos ${g.rango}` : "");
  $("#planta-nota").textContent = ps.unidadesDe ? (ps.nota ?? "")
    : "Pasa el mouse por un departamento para ver su número." + (g.pisos.length > 1 ? " X es el número de piso." : "");
  if (!p?.src) {
    const v = el("div", { class: "planta-vacia" });
    v.style.aspectRatio = `${vista[2]} / ${vista[3]}`;
    v.innerHTML = `<span class="pend">planta por cargar</span>`;
    $("#planta").replaceChildren(v);
    return;
  }
  // Todas las plantas comparten la vista (C.vista): mismo encuadre y misma escala. x/y corren una planta
  // cuyo recorte no coincide con el de las demás.
  const svg = el("svg", { viewBox: vista.join(" "), role: "group", "aria-label": g.nombre }, SVGNS);
  const capa = el("g", { transform: `translate(${p.x ?? 0} ${p.y ?? 0})` }, SVGNS);
  capa.append(el("image", { href: p.src, width: p.w, height: p.h }, SVGNS));
  svg.append(capa);
  pintarEjes(svg);
  const dePiso = ps.unidadesDe ?? ps.id;
  for (const u of unidades.filter((x) => x.piso === dePiso)) {
    const pts = p.poligonos?.[u.posicion];
    if (!pts) continue;
    // En la planta típica el número de piso es X; «rotulos» usa el nombre del proyecto (p. ej., BX01 = torre B).
    const nombre = g.pisos.length > 1 ? (C.rotulos?.[u.posicion] ?? `X${u.posicion}`) : u.codigo;
    const gu = el("g", { class: "u", tabindex: "0", "aria-label": `Departamento ${nombre}` }, SVGNS);
    // «colores»: un color por grupo (p. ej., por torre); sin él, todos se pintan en azul.
    if (C.colores?.[u.tipologia]) gu.style.setProperty("--u", C.colores[u.tipologia]);
    gu.append(el("polygon", { points: pts.map((q) => q.join(",")).join(" ") }, SVGNS));
    const [cx, cy] = centroide(pts);
    const fs = (p.etiqueta ?? 44) * 1.25;
    const t = el("text", { x: cx, y: cy + fs * 0.35, "text-anchor": "middle", "font-size": fs }, SVGNS);
    t.textContent = nombre;
    gu.append(t);
    // En pantallas táctiles no hay mouse: un toque pinta el departamento y otro lo apaga.
    gu.addEventListener("click", () => {
      const on = !gu.classList.contains("on");
      svg.querySelectorAll(".u.on").forEach((x) => x.classList.remove("on"));
      gu.classList.toggle("on", on);
    });
    capa.append(gu);
  }
  $("#planta").replaceChildren(svg);
}

// ---------- Vista: Planta / Modelo 3D ----------
function mostrar(vista) {
  document.querySelectorAll("#vistas button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.vista === vista)));
  $("#bloque-planta").hidden = vista !== "planta";
  $("#bloque-3d").hidden = vista !== "3d";
  $("#tabs").hidden = vista !== "planta";
}
document.querySelectorAll("#vistas button").forEach((b) => b.addEventListener("click", () => { mostrar(b.dataset.vista); track("vista_" + b.dataset.vista); }));

// ---------- Modelo 3D: cortes por piso dentro del visor y vuelta a la isometría ----------
let visor = null, corte = null;
const nombresCapa = { arq: "Arquitectura", est: "Estructuras", mep: "Instalaciones sanitarias" };

function pintarCortes() {
  const lista = [{ id: null, etiqueta: "Todo", nombre: "Edificio completo" }, ...[...C.pisos].reverse()];
  const lbl = el("span", { class: "lbl" });
  lbl.textContent = "Piso";
  $("#cortes").replaceChildren(lbl, ...lista.map((p) => {
    const b = el("button", { type: "button", "aria-pressed": String(p.id === corte), "aria-label": p.nombre });
    b.textContent = p.etiqueta ?? p.id;
    b.addEventListener("click", () => { corte = p.id; visor?.cortarEn(p.id == null ? null : p.corte); pintarCortes(); track("corte_" + (p.id ?? "todo")); });
    return b;
  }));
}

async function abrir3d() {
  const b = $("#abrir");
  if (b.getAttribute("aria-busy")) return;
  b.setAttribute("aria-busy", "true");
  $("#estado").textContent = "Cargando el modelo…";
  $("#marco").classList.add("en-3d"); $("#visor").hidden = false;
  track("visor_3d");
  try {
    const mod = await import(C.visor);
    // ?az= en la URL prueba otro giro de cámara sin tocar la configuración.
    const az = new URLSearchParams(location.search).get("az");
    visor = await mod.abrirVisor($("#visor"), { id: C.ref, acimut: az != null ? +az : C.acimut, modelos: C.modelos });
    corte = null; pintarCortes();
    b.hidden = true; $("#cortes").hidden = false;
    const capas = $("#capas");
    capas.replaceChildren(...C.modelos.map((m) => {
      const c = el("button", { class: "chip", type: "button", "aria-pressed": String(m.activo !== false) });
      c.textContent = nombresCapa[m.id] ?? m.id;
      c.addEventListener("click", async () => {
        if (c.getAttribute("aria-busy")) return;
        const si = c.getAttribute("aria-pressed") !== "true";
        c.setAttribute("aria-pressed", si); c.setAttribute("aria-busy", "true");
        try { await visor.alternar(m.id, si); } catch (err) { console.error(err); c.setAttribute("aria-pressed", "false"); $("#estado").textContent = "No se pudo cargar esa capa."; }
        c.removeAttribute("aria-busy");
      });
      return c;
    }));
    const volver = el("button", { class: "btn", type: "button" });
    volver.textContent = "Volver a la isometría";
    volver.addEventListener("click", cerrar3d);
    capas.append(el("span", { class: "sep" }), volver);
    capas.hidden = false;
    $("#estado").textContent = "Arrastra para girar. Pellizca o usa la rueda para acercar. Elige un piso a la derecha para cortar el edificio.";
  } catch (e) {
    console.error(e);
    await cerrar3d();
    $("#estado").textContent = "No se pudo abrir el modelo en este dispositivo.";
  }
  b.removeAttribute("aria-busy");
}

async function cerrar3d() {
  const v = visor; visor = null;
  $("#marco").classList.remove("en-3d"); $("#visor").hidden = true;
  $("#capas").hidden = true; $("#cortes").hidden = true; $("#abrir").hidden = false;
  $("#estado").textContent = "";
  if (v) await v.cerrar();
  $("#visor").replaceChildren();
}
$("#abrir").addEventListener("pointerenter", () => import(C.visor), { once: true });
$("#abrir").addEventListener("click", abrir3d);

// ---------- Galerías («Por fuera», «Por dentro»): carrusel y vista ampliada ----------
// Cada [data-galeria] muestra sus imágenes enteras (sin recortar) a una altura fija; tocar una la abre a pantalla
// completa, con anterior/siguiente, flechas del teclado y deslizamiento. Un <video> en la galería se reproduce solo,
// sin sonido y en bucle mientras está a la vista (no si el sistema pide reducir el movimiento) y no se amplía.
(function galerias() {
  const caja = $("#visor-img"), img = $("#vi-img"), pie = $("#vi-pie");
  if (!caja) return;
  let lista = [], abierta = 0, alCerrar = null;
  const mostrarImg = (i) => {
    abierta = (i + lista.length) % lista.length;
    const f = lista[abierta], fuente = f.querySelector("img");
    img.src = fuente.currentSrc || fuente.src; img.alt = fuente.alt;
    pie.textContent = `${f.querySelector("figcaption")?.textContent ?? ""}  ·  ${abierta + 1} / ${lista.length}`;
  };
  $("#vi-ant").addEventListener("click", () => mostrarImg(abierta - 1));
  $("#vi-sig").addEventListener("click", () => mostrarImg(abierta + 1));
  caja.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft") mostrarImg(abierta - 1);
    if (e.key === "ArrowRight") mostrarImg(abierta + 1);
  });
  caja.addEventListener("click", (e) => { if (e.target === caja || e.target.classList.contains("vi-marco")) caja.close(); });
  let x0 = null;
  caja.addEventListener("pointerdown", (e) => { x0 = e.clientX; });
  caja.addEventListener("pointerup", (e) => {
    if (x0 == null) return;
    const dx = e.clientX - x0; x0 = null;
    if (Math.abs(dx) > 50) mostrarImg(abierta + (dx < 0 ? 1 : -1));
  });
  // Al cerrar, el carrusel queda en la imagen que se estaba viendo.
  caja.addEventListener("close", () => alCerrar?.());

  const quieto = matchMedia("(prefers-reduced-motion: reduce)").matches;
  document.querySelectorAll("[data-galeria]").forEach((pista) => {
    const ctrl = pista.nextElementSibling;
    const figs = [...pista.querySelectorAll("figure")];
    const cuenta = ctrl.querySelector(".i-cuenta");
    let actual = 0;
    const marcar = () => { cuenta.textContent = `${actual + 1} / ${figs.length}`; };
    const ir = (i) => {
      actual = Math.max(0, Math.min(figs.length - 1, i));
      pista.scrollTo({ left: figs[actual].offsetLeft - pista.offsetLeft });
      marcar();
    };
    pista.addEventListener("scroll", () => {
      const x = pista.scrollLeft;
      let i = 0;
      figs.forEach((f, k) => { if (Math.abs(f.offsetLeft - pista.offsetLeft - x) < Math.abs(figs[i].offsetLeft - pista.offsetLeft - x)) i = k; });
      if (i !== actual) { actual = i; marcar(); }
    }, { passive: true });
    ctrl.querySelector("[data-ant]").addEventListener("click", () => ir(actual - 1));
    ctrl.querySelector("[data-sig]").addEventListener("click", () => ir(actual + 1));
    marcar();

    const conImg = figs.filter((f) => f.querySelector("button img"));
    conImg.forEach((f, i) => {
      f.querySelector("button").addEventListener("click", () => {
        lista = conImg; mostrarImg(i);
        alCerrar = () => ir(figs.indexOf(lista[abierta]));
        caja.showModal(); track(pista.dataset.galeria);
      });
    });
    pista.querySelectorAll("video").forEach((v) => {
      if (quieto) return;
      new IntersectionObserver(([e]) => { e.isIntersecting ? v.play().catch(() => {}) : v.pause(); }, { threshold: 0.3 }).observe(v);
    });
  });
})();

// ---------- Cuadro de tipologías ----------
async function cargarUnidades() {
  const txt = await (await fetch(C.unidades)).text();
  const [cab, ...filas] = txt.trim().split(/\r?\n/);
  const cols = cab.split(",");
  unidades = filas.map((f) => Object.fromEntries(f.split(",").map((v, i) => [cols[i], v.trim()])))
    .map((u) => ({ ...u, area_m2: +u.area_m2, dormitorios: +u.dormitorios, banos: +u.banos, prueba: u.prueba ?? "",
      area_libre_m2: +(u.area_libre_m2 || 0) }));
}

function pintarMix() {
  const tipos = [...new Set(unidades.map((u) => u.tipologia))].sort();
  $("#mix tbody").replaceChildren(...tipos.map((t) => {
    const us = unidades.filter((u) => u.tipologia === t);
    const a = us.map((u) => u.area_m2), min = Math.min(...a), max = Math.max(...a);
    // Rango cuando la tipología mezcla unidades distintas (por ejemplo, los dos departamentos del semisótano).
    const rango = (k, uno, varios) => {
      const v = us.map((u) => u[k]), lo = Math.min(...v), hi = Math.max(...v);
      return lo === hi ? `${lo} ${lo > 1 ? varios : uno}` : `${lo} a ${hi} ${varios}`;
    };
    const tr = el("tr"); tr.style.setProperty("--c", C.colores?.[t] ?? tinta(t)); tr.style.setProperty("--c-on", `var(--t${t}-on)`);
    tr.innerHTML = `<th scope="row"><span class="tag">${nombreTipo(t)}</span></th><td class="n">${us.length}</td>
      <td>${fmt(us.length / unidades.length * 100, 1)} %</td>
      <td>${min === max ? fmt(min) : fmt(min) + " a " + fmt(max)} m²</td>
      <td>${rango("dormitorios", "dormitorio", "dormitorios")}, ${rango("banos", "baño", "baños")}</td>`;
    return tr;
  }));
  // El total suma solo unidades y participación: sumar áreas de tipologías distintas confunde al lector.
  // vendibleExtra: áreas vendibles que no están en el CSV por departamento (p. ej., lavanderías de azotea sin asignar).
  const vendible = unidades.reduce((s, u) => s + u.area_m2, 0) + (C.vendibleExtra?.m2 ?? 0);
  $("#mix-total").textContent = unidades.length;
  if ($("#c-vendible")) $("#c-vendible").innerHTML = `${fmt(vendible)} <small>m²</small>`;
  if ($("#c-eficiencia")) $("#c-eficiencia").innerHTML = `${fmt(vendible / C.areaTechada * 100, 1)} <small>%</small>`;
}

// ---------- Arranque ----------
pintarTabs();
mostrar(new URLSearchParams(location.search).get("vista") === "3d" ? "3d" : "planta");
try {
  await cargarUnidades();
  pintarPlanta(); pintarMix();
} catch (e) {
  console.error(e);
  $("#planta").textContent = "No se pudieron cargar las unidades.";
}
