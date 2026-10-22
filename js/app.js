import { fsplDb, geometria, latenciaMs, posTierra, walker } from "./modelo.js";
import { Escena } from "./escena3d.js";

const { d3, gsap, ScrollTrigger, Lenis, lucide } = window;
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const fmt = (n, d = 0) => n.toLocaleString("es-DO", { minimumFractionDigits: d, maximumFractionDigits: d });
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const suave = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const difAngulo = (a, b) => ((((b - a) % 360) + 540) % 360) - 180;
const SERIES = { 550: "var(--serie-1)", 800: "var(--serie-2)", 1200: "var(--serie-3)" };
const FORMAS = { 550: d3.symbolCircle, 800: d3.symbolSquare, 1200: d3.symbolTriangle };
const reducido = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const icono = (nombre) => `<i data-lucide="${nombre}"></i>`;
const pintarIconos = () => lucide.createIcons({ attrs: { "stroke-width": 1.8 } });
const RD = { lon: -70.4, lat: 18.8 };

const PRESETS = {
  uno: { planos: 1, sats: 1, altitud: 629, escalonada: true },
  fragil: { planos: 10, sats: 1, altitud: 629, escalonada: false },
  inicial: { planos: 20, sats: 10, altitud: 629, escalonada: true },
  optimo: { planos: 8, sats: 8, altitud: 1200, escalonada: true },
};
const constelacion = (p) => walker(p.planos, p.sats, p.altitud, 98, 1, p.escalonada);

pintarIconos();

// ---------------------------------------------------------------------------
// Scroll suave + barra de progreso
// ---------------------------------------------------------------------------
gsap.registerPlugin(ScrollTrigger);
let lenis = null;
if (!reducido) {
  lenis = new Lenis({ lerp: 0.09, smoothWheel: true, wheelMultiplier: 0.9 });
  lenis.on("scroll", ScrollTrigger.update);
  gsap.ticker.add((t) => lenis.raf(t * 1000));
  gsap.ticker.lagSmoothing(0);
}
$$('a[href^="#"]').forEach((a) => a.addEventListener("click", (e) => {
  const destino = document.querySelector(a.getAttribute("href"));
  if (!destino) return;
  e.preventDefault();
  if (lenis) lenis.scrollTo(destino, { offset: destino.id === "inicio" ? 0 : -64, duration: 1.6 });
  else destino.scrollIntoView();
}));
gsap.to("#barra-progreso", { scaleX: 1, ease: "none", scrollTrigger: { start: 0, end: "max", scrub: 0.3 } });

// ---------------------------------------------------------------------------
// Datos
// ---------------------------------------------------------------------------
const [estaciones, barrido, historiaDatos, mundo] = await Promise.all([
  fetch("data/estaciones.json").then((r) => r.json()),
  fetch("data/barrido.json").then((r) => r.json()),
  fetch("data/historia.json").then((r) => r.json()),
  fetch("https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-50m.json").then((r) => r.json()),
]);

// ---------------------------------------------------------------------------
// Globo 3D compartido por el hero y la historia
// ---------------------------------------------------------------------------
const canvas = $("#canvas-principal");
const escena = new Escena(canvas, { mundo, estaciones: estaciones.map((e) => ({ ...e })) });
escena.setConstelacion(constelacion(PRESETS.inicial));

const cam = { giro: -32, vel: 0, latDrag: 0, parX: 0, parY: 0, metaX: 0, metaY: 0, intro: reducido ? 1 : 0 };
let pHero = 0, pHist = 0;
const movil = () => window.innerWidth < 760;

escena.alAvanzar = (dt, t) => {
  const b = suave(0.06, 0.34, pHero); // giro hacia RD
  const z = suave(0.2, 0.56, pHero); // acercamiento
  const s = suave(0.8, 1, pHero); // paso a la historia
  const m = movil();
  if (!reducido) cam.giro += dt * 7 * (1 - b);
  cam.giro += cam.vel * dt;
  cam.vel *= Math.pow(0.04, dt);
  cam.parX = lerp(cam.parX, cam.metaX, 1 - Math.pow(0.02, dt));
  cam.parY = lerp(cam.parY, cam.metaY, 1 - Math.pow(0.02, dt));
  const libre = cam.giro + cam.parX;
  const v = escena.meta;
  v.lon = libre + difAngulo(libre, RD.lon) * b + s * (pHist * 12 - 6);
  v.lat = lerp(lerp(14 + cam.parY + cam.latDrag * (1 - b), RD.lat - 1.5, b), 13, s);
  const intro = gsap.parseEase("power3.out")(cam.intro);
  v.dist = lerp(lerp(m ? 3.6 : 2.9, m ? 1.7 : 1.3, z), m ? 2.9 : 2.5, s) + (1 - intro) * 4;
  v.dx = lerp(lerp(m ? 0 : 0.2, 0, z), m ? 0 : -0.2, s);
  v.dy = lerp(lerp(m ? -0.17 : 0, m ? -0.1 : 0.04, z), m ? -0.06 : 0, s);
  return t + dt * (reducido ? 0 : lerp(90, 140, s));
};

// Etiquetas de las estaciones sobre el globo
// Lado de cada etiqueta: izquierda, derecha o debajo del punto
const ETIQUETAS = {
  Pedernales: "izq", Jimaní: "izq", Comendador: "izq", Dajabón: "izq", Neiba: "abajo", Constanza: "abajo",
  "Sabana Grande de Boyá": "der", "Santo Domingo": "der", Santiago: "der",
};
const capa = $("#etiquetas");
const etiquetas = estaciones.filter((e) => e.nombre in ETIQUETAS).map((e) => {
  const el = document.createElement("div");
  el.className = `etq${e.tipo === "uplink" ? " ciudad" : ""}`;
  el.innerHTML = `${e.nombre}<small>${fmt(Math.abs(e.lat), 2)}° N</small>`;
  capa.appendChild(el);
  return { e, el, lado: ETIQUETAS[e.nombre], ancho: 0 };
});
const EN_MOVIL = new Set(["Pedernales", "Dajabón", "Santo Domingo", "Santiago", "Neiba"]);
escena.alDibujar = () => {
  const visibilidad = suave(0.42, 0.58, pHero) * (1 - suave(0.8, 0.9, pHero));
  const m = movil();
  for (const et of etiquetas) {
    if (visibilidad <= 0.001 || (m && !EN_MOVIL.has(et.e.nombre))) { et.el.style.opacity = 0; continue; }
    const p = escena.proyectar(et.e.lon, et.e.lat, et.p || (et.p = {}));
    if (!et.ancho) et.ancho = et.el.offsetWidth;
    const x = et.lado === "der" ? p.x + 10 : et.lado === "izq" ? p.x - et.ancho - 10 : p.x - et.ancho / 2;
    const y = et.lado === "abajo" ? p.y + 10 : p.y - 12;
    et.el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
    et.el.style.opacity = p.frente ? visibilidad : 0;
  }
};

// Arrastrar para girar (solo mouse: en pantallas táctiles el dedo hace scroll)
let arrastre = null;
canvas.addEventListener("pointerdown", (e) => {
  if (e.pointerType !== "mouse" || pHero > 0.25) return;
  arrastre = { x: e.clientX, y: e.clientY, t: performance.now() };
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener("pointermove", (e) => {
  if (!arrastre) return;
  const ahora = performance.now();
  const dx = e.clientX - arrastre.x, dy = e.clientY - arrastre.y;
  cam.giro -= dx * 0.22;
  cam.latDrag = clamp(cam.latDrag + dy * 0.15, -35, 35);
  cam.vel = (-dx * 0.22) / Math.max(0.008, (ahora - arrastre.t) / 1000);
  arrastre = { x: e.clientX, y: e.clientY, t: ahora };
});
const soltar = () => { arrastre = null; };
canvas.addEventListener("pointerup", soltar);
canvas.addEventListener("pointercancel", soltar);
window.addEventListener("pointermove", (e) => {
  if (e.pointerType !== "mouse") return;
  cam.metaX = (e.clientX / window.innerWidth - 0.5) * -10;
  cam.metaY = (e.clientY / window.innerHeight - 0.5) * 6;
});

// ---------------------------------------------------------------------------
// Hero: entrada y zoom a República Dominicana con el scroll
// ---------------------------------------------------------------------------
if (!reducido) {
  const intro = gsap.timeline({ defaults: { ease: "power3.out" } });
  intro.to(cam, { intro: 1, duration: 2.6, ease: "none" }, 0)
    .from("[data-intro]", { y: 40, opacity: 0, duration: 1.1, stagger: 0.12 }, 0.35)
    .from(["#pista-giro", "#indicador-scroll"], { opacity: 0, duration: 1 }, 1.4);
  $$("[data-contar]").forEach((el) => {
    const o = { v: 0 };
    intro.to(o, { v: Number(el.dataset.contar), duration: 1.6, ease: "power2.out",
      onUpdate: () => { el.textContent = Math.round(o.v); } }, 1);
  });
}

// Métricas de 24 h calculadas con el motor de Python (scripts/exportar_web.py)
const metricasDe = (nombre) => ({
  cob: historiaDatos[nombre].cobertura_min_pct,
  hueco: historiaDatos[nombre].hueco_maximo_min,
});
const animarNumero = (sel, valor, dec, sufijo) => {
  const el = $(sel);
  const o = { v: Number(el.dataset.v || 0) };
  gsap.to(o, { v: valor, duration: 0.9, ease: "power2.out", onUpdate: () => { el.textContent = `${fmt(o.v, dec)}${sufijo}`; } });
  el.dataset.v = valor;
};
let pasoActual = "hero";
ScrollTrigger.create({
  trigger: ".hero", start: "top top", end: "bottom bottom",
  onUpdate: (st) => {
    pHero = st.progress;
    const salida = suave(0.04, 0.3, pHero);
    gsap.set("#hero-contenido", { opacity: 1 - salida, y: -80 * salida });
    gsap.set("#hero-velo", { opacity: 1 - salida });
    gsap.set(["#pista-giro", "#indicador-scroll"], { opacity: 1 - suave(0.01, 0.08, pHero) });
    const titulo = suave(0.46, 0.6, pHero) * (1 - suave(0.8, 0.9, pHero));
    gsap.set("#rd-titulo", { opacity: titulo, y: 30 * (1 - suave(0.46, 0.6, pHero)) });
    gsap.set("#historia-hud", { opacity: suave(0.88, 1, pHero) * (1 - suave(0.9, 1, pHist)) });
    if (pHero > 0.85 && !$("#h-cob").dataset.v) {
      const m = metricasDe("inicial");
      animarNumero("#h-cob", m.cob, 1, " %");
      animarNumero("#h-hueco", m.hueco, 0, " min");
    }
    if (pHero < 0.97 && pasoActual !== "hero") {
      pasoActual = "hero";
      escena.setConstelacion(constelacion(PRESETS.inicial));
      $$(".paso").forEach((el) => el.classList.remove("activo"));
    }
  },
});

// ---------------------------------------------------------------------------
// Historia: cada paso cambia la constelación del mismo globo
// ---------------------------------------------------------------------------
function mostrarPaso(nombre) {
  if (pasoActual === nombre) return;
  pasoActual = nombre;
  const p = PRESETS[nombre];
  escena.setConstelacion(constelacion(p));
  $$(".paso").forEach((el) => el.classList.toggle("activo", el.dataset.paso === nombre));
  const m = metricasDe(nombre);
  animarNumero("#h-total", p.planos * p.sats, 0, "");
  animarNumero("#h-cob", m.cob, 1, " %");
  animarNumero("#h-hueco", m.hueco, 0, " min");
}
// En móvil las cifras van dentro de cada paso (el panel fijo quedaría tapado por el texto)
$$(".paso").forEach((el) => {
  const d = historiaDatos[el.dataset.paso];
  el.insertAdjacentHTML("beforeend", `<dl class="paso-datos">
    <div><dt>Satélites</dt><dd class="mono">${d.satelites}</dd></div>
    <div><dt>Peor estación</dt><dd class="mono">${fmt(d.cobertura_min_pct, 1)} %</dd></div>
    <div><dt>Hueco máx.</dt><dd class="mono">${fmt(d.hueco_maximo_min)} min</dd></div></dl>`);
});
$$(".paso").forEach((el) => ScrollTrigger.create({
  trigger: el, start: "top 62%", end: "bottom 38%",
  onToggle: (st) => { if (st.isActive) mostrarPaso(el.dataset.paso); },
}));
ScrollTrigger.create({
  trigger: ".historia", start: "top bottom", end: "bottom bottom",
  onUpdate: (st) => { pHist = st.progress; },
});

// El globo se desvanece cuando entran los resultados y deja de dibujarse
ScrollTrigger.create({
  trigger: "#resultados", start: "top bottom", end: "top 15%",
  onUpdate: (st) => {
    $("#escenario").style.opacity = (1 - st.progress).toFixed(3);
    escena.activa = st.progress < 1;
  },
});
if (!reducido) {
  gsap.from(".paso h3, .paso p", { x: 40, duration: 0.9, ease: "power3.out", stagger: 0.08,
    scrollTrigger: { trigger: ".historia-pasos", start: "top 75%" } });
}

// ---------------------------------------------------------------------------
// Resultados del barrido
// ---------------------------------------------------------------------------
const minimo = Math.min(...barrido.mejores_por_altitud.map((m) => m.total_satelites));
$("#tarjetas-altitud").innerHTML = barrido.mejores_por_altitud.map((m) => `
  <article class="tarjeta-alt${m.total_satelites === minimo ? " destacada" : ""}">
    <h3>${icono("orbit")}A ${fmt(m.altitud_km)} km</h3>
    <div class="num"><span data-contar-vista="${m.total_satelites}">${m.total_satelites}</span><small>satélites</small></div>
    <p>${m.planos} planos × ${m.sats_por_plano} · latencia al cénit ${fmt(latenciaMs(m.altitud_km), 1)} ms</p>
    ${m.total_satelites === minimo ? '<span class="etiqueta">Menos satélites</span>' : ""}
  </article>`).join("");

const altitudes = [...new Set(barrido.todos.map((r) => r.altitud_km))].sort((a, b) => a - b);
$("#leyenda-barrido").innerHTML = altitudes.map((h) => `
  <span><svg width="12" height="12" viewBox="-6 -6 12 12"><path d="${d3.symbol(FORMAS[h], 70)()}" fill="${SERIES[h]}"/></svg>${fmt(h)} km</span>`).join("")
  + '<span><svg width="18" height="2"><line x1="0" y1="1" x2="18" y2="1" stroke="var(--texto-3)" stroke-dasharray="4 3"/></svg>Objetivo 99.9 %</span>';

const tooltip = $("#tooltip");
function mostrarTooltip(html, x, y) {
  tooltip.innerHTML = html;
  tooltip.hidden = false;
  const r = tooltip.getBoundingClientRect();
  tooltip.style.left = `${Math.min(x + 14, window.innerWidth - r.width - 8)}px`;
  tooltip.style.top = `${y - r.height - 12 < 8 ? y + 16 : y - r.height - 12}px`;
}
const ocultarTooltip = () => { tooltip.hidden = true; };

let graficoAnimado = false;
function graficoBarrido() {
  const cont = $("#grafico-barrido");
  const w = Math.max(300, cont.clientWidth);
  const h = Math.round(Math.min(420, Math.max(280, w * 0.45)));
  const m = { t: 16, r: 18, b: 46, l: 52 };
  const x = d3.scaleLinear().domain([0, d3.max(barrido.todos, (d) => d.total_satelites) * 1.05]).range([m.l, w - m.r]).nice();
  const y = d3.scaleLinear().domain([0, 100]).range([h - m.b, m.t]);
  const svg = d3.create("svg").attr("viewBox", `0 0 ${w} ${h}`).attr("role", "img")
    .attr("aria-label", "Gráfico de dispersión: cobertura de la peor estación según la cantidad de satélites");
  svg.append("g").attr("class", "rejilla").selectAll("line").data(y.ticks(5)).join("line")
    .attr("x1", m.l).attr("x2", w - m.r).attr("y1", y).attr("y2", y);
  svg.append("g").attr("class", "eje").attr("transform", `translate(0,${h - m.b})`)
    .call(d3.axisBottom(x).ticks(w < 500 ? 4 : 8).tickSizeOuter(0));
  svg.append("g").attr("class", "eje").attr("transform", `translate(${m.l},0)`)
    .call(d3.axisLeft(y).ticks(5).tickFormat((v) => `${v} %`).tickSizeOuter(0));
  svg.selectAll(".eje .domain").remove();
  svg.append("text").attr("class", "titulo-eje").attr("x", (m.l + w - m.r) / 2).attr("y", h - 8).attr("text-anchor", "middle").text("Satélites en la constelación");
  svg.append("line").attr("class", "umbral").attr("x1", m.l).attr("x2", w - m.r).attr("y1", y(99.9)).attr("y2", y(99.9));
  const marcas = svg.append("g").selectAll("g").data(barrido.todos).join("g")
    .attr("transform", (d) => `translate(${x(d.total_satelites)},${y(d.cobertura_min_pct)})`)
    .append("path").attr("class", "marca-dato")
    .attr("d", (d) => d3.symbol(FORMAS[d.altitud_km], 64)())
    .attr("fill", (d) => SERIES[d.altitud_km]);
  const optimo = barrido.mejores_por_altitud.find((d) => d.total_satelites === minimo);
  const ox = x(optimo.total_satelites), oy = y(optimo.cobertura_min_pct);
  const anillo = svg.append("circle").attr("class", "anillo-optimo").attr("cx", ox).attr("cy", oy).attr("r", 11);
  const etiqueta = svg.append("text").attr("class", "etiqueta-optimo").attr("x", ox + 16).attr("y", oy + 24)
    .text(`${optimo.total_satelites} satélites a ${fmt(optimo.altitud_km)} km`);
  svg.append("g").selectAll("circle").data(barrido.todos).join("circle")
    .attr("cx", (d) => x(d.total_satelites)).attr("cy", (d) => y(d.cobertura_min_pct)).attr("r", 10)
    .attr("fill", "transparent")
    .on("pointerenter pointermove", (ev, d) => {
      marcas.classed("foco", (k) => k === d);
      mostrarTooltip(`<b>${d.planos} planos × ${d.sats_por_plano} = ${d.total_satelites} satélites</b><br>`
        + `Altitud: ${fmt(d.altitud_km)} km<br>Peor estación: ${d.peor_estacion} · ${fmt(d.cobertura_min_pct, 1)} %<br>`
        + `Hueco más largo: ${fmt(d.hueco_maximo_min)} min`, ev.clientX, ev.clientY);
    })
    .on("pointerleave", () => { marcas.classed("foco", false); ocultarTooltip(); });
  cont.replaceChildren(svg.node());
  if (!graficoAnimado && !reducido) {
    gsap.set(marcas.nodes(), { scale: 0, transformOrigin: "50% 50%" });
    gsap.set([anillo.node(), etiqueta.node()], { opacity: 0 });
    ScrollTrigger.create({
      trigger: cont, start: "top 75%", once: true,
      onEnter: () => {
        graficoAnimado = true;
        gsap.to(marcas.nodes(), { scale: 1, duration: 0.5, ease: "back.out(2)", stagger: { each: 0.012 } });
        gsap.to([anillo.node(), etiqueta.node()], { opacity: 1, duration: 0.6, delay: 1.2 });
      },
    });
  }
}
graficoBarrido();
let anchoGrafico = $("#grafico-barrido").clientWidth;
new ResizeObserver(() => {
  const w = $("#grafico-barrido").clientWidth;
  if (Math.abs(w - anchoGrafico) > 4) { anchoGrafico = w; graficoBarrido(); }
}).observe($("#grafico-barrido"));

const filas = [...barrido.todos].sort((a, b) => a.total_satelites - b.total_satelites || a.altitud_km - b.altitud_km);
$("#tabla-barrido").innerHTML = "<thead><tr><th>Diseño</th><th>Satélites</th><th>Altitud</th><th>Cobertura mín.</th><th>Hueco máx.</th><th>Peor estación</th></tr></thead><tbody>"
  + filas.map((d) => `<tr><td>${d.planos} × ${d.sats_por_plano}</td><td>${d.total_satelites}</td><td>${fmt(d.altitud_km)} km</td>`
    + `<td>${fmt(d.cobertura_min_pct, 1)} %</td><td>${fmt(d.hueco_maximo_min)} min</td><td class="texto">${d.peor_estacion}</td></tr>`).join("")
  + "</tbody>";

// ---------------------------------------------------------------------------
// Calculadora de enlace
// ---------------------------------------------------------------------------
const opciones = (lista, sel) => lista.map((e) => `<option${e.nombre === sel ? " selected" : ""}>${e.nombre}</option>`).join("");
$("#c-origen").innerHTML = `<optgroup label="Estaciones de subida">${opciones(estaciones.filter((e) => e.tipo === "uplink"), "Santo Domingo")}</optgroup>`;
$("#c-destino").innerHTML = `<optgroup label="Zonas rurales">${opciones(estaciones.filter((e) => e.tipo === "downlink"), "Pedernales")}</optgroup>`
  + `<optgroup label="Ciudades">${opciones(estaciones.filter((e) => e.tipo === "uplink"), "")}</optgroup>`;
function calcular() {
  const buscar = (n) => estaciones.find((e) => e.nombre === n);
  const o = buscar($("#c-origen").value), d = buscar($("#c-destino").value);
  const alt = Number($("#c-alt").value), mhz = Number($("#c-banda").value);
  $("#v-c-alt").textContent = `${fmt(alt)} km`;
  const lat = (o.lat + d.lat) / 2, lon = (o.lon + d.lon) / 2;
  const sat = posTierra(lat, lon, alt, 0, false);
  const po = posTierra(o.lat, o.lon, o.alt_m / 1000, 0, false);
  const pd = posTierra(d.lat, d.lon, d.alt_m / 1000, 0, false);
  const sube = geometria(po, sat), baja = geometria(pd, sat);
  const tarjeta = (titulo, ico, lugar, g) => `
    <article class="tramo">
      <h3>${icono(ico)}${titulo}<span>${lugar}</span></h3>
      <dl>
        <div><dt>Elevación</dt><dd>${fmt(g.elevacion, 1)}°</dd></div>
        <div><dt>Distancia</dt><dd>${fmt(g.distancia)} km</dd></div>
        <div><dt>Latencia</dt><dd>${fmt(latenciaMs(g.distancia), 2)} ms</dd></div>
        <div><dt>Pérdida</dt><dd>${fmt(fsplDb(g.distancia, mhz), 1)} dB</dd></div>
      </dl>
      ${g.elevacion < 10 ? '<p class="aviso">Elevación menor de 10°: enlace poco fiable.</p>' : ""}
    </article>`;
  $("#c-tramos").innerHTML = tarjeta("Subida", "arrow-up-right", o.nombre, sube) + tarjeta("Bajada", "satellite-dish", d.nombre, baja);
  pintarIconos();
  const geo = posTierra(0, lon, 35786, 0, false);
  const leo = latenciaMs(sube.distancia + baja.distancia);
  const lgeo = latenciaMs(geometria(po, geo).distancia + geometria(pd, geo).distancia);
  $("#c-lat-leo").textContent = `${fmt(leo, 2)} ms`;
  $("#c-lat-geo").textContent = `${fmt(lgeo, 1)} ms`;
  $("#c-bar-leo").style.width = `${Math.max(1.5, (leo / lgeo) * 100)}%`;
  $("#c-bar-geo").style.width = "100%";
  $("#c-veces").textContent = `Por GEO la señal tarda unas ${fmt(lgeo / leo)} veces más. Ida y vuelta por LEO: ${fmt(2 * leo, 1)} ms.`;
}
["#c-origen", "#c-destino", "#c-alt", "#c-banda"].forEach((s) => $(s).addEventListener("input", calcular));
calcular();

// ---------------------------------------------------------------------------
// Terminal: salida real de la CLI, escrita al entrar en pantalla
// ---------------------------------------------------------------------------
const LINEAS = [
  ["$", "git clone https://github.com/Lonxs69/LonxsLocate.git"],
  ["$", "cd LonxsLocate"],
  ["$", "python -m lonxslocate enlace"],
  ["", "Enlace Santo Domingo → satélite (600 km) → Pedernales"],
  ["", "Subida  83.3°   604 km   2.01 ms   169.6 dB"],
  ["", "Bajada  74.6°   620 km   2.07 ms   169.9 dB"],
  ["ok", "Latencia extremo a extremo: 4.08 ms"],
  ["$", "python -m lonxslocate barrido"],
  ["", "Evaluando 90 configuraciones en local..."],
  ["ok", "8 × 8 = 64 satélites · 1200 km · cobertura 100.0 %"],
  ["$", "make test"],
  ["ok", "Ran 20 tests · OK"],
];
const codigo = $("#terminal code");
const escapar = (t) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;");
const linea = ([tipo, txt]) => (tipo === "$" ? `<span class="prompt">$</span> ${escapar(txt)}`
  : tipo === "ok" ? `<span class="ok">${escapar(txt)}</span>` : escapar(txt));
if (reducido) {
  codigo.innerHTML = LINEAS.map(linea).join("\n");
} else {
  codigo.innerHTML = '<span class="cursor"></span>';
  ScrollTrigger.create({
    trigger: ".terminal", start: "top 75%", once: true,
    onEnter: async () => {
      const hechas = [];
      for (const l of LINEAS) {
        if (l[0] === "$") {
          for (let i = 1; i <= l[1].length; i += 2) {
            codigo.innerHTML = [...hechas, `<span class="prompt">$</span> ${escapar(l[1].slice(0, i))}`].join("\n") + '<span class="cursor"></span>';
            await new Promise((r) => setTimeout(r, 18));
          }
        } else {
          await new Promise((r) => setTimeout(r, 140));
        }
        hechas.push(linea(l));
        codigo.innerHTML = hechas.join("\n") + '\n<span class="cursor"></span>';
      }
    },
  });
}

// ---------------------------------------------------------------------------
// Animaciones al hacer scroll
// ---------------------------------------------------------------------------
pintarIconos();
if (!reducido) {
  $$("[data-revelar]").forEach((el) => gsap.from(el, {
    y: 56, opacity: 0, duration: 1.1, ease: "power3.out",
    scrollTrigger: { trigger: el, start: "top 86%" },
  }));
  $$("[data-revelar-hijos]").forEach((el) => gsap.from(el.children, {
    y: 48, opacity: 0, duration: 0.9, ease: "power3.out", stagger: 0.1,
    scrollTrigger: { trigger: el, start: "top 88%" },
  }));
  $$("[data-imagen]").forEach((el) => gsap.fromTo(el.querySelector("img"),
    { clipPath: "inset(10% 10% 10% 10% round 24px)", scale: 1.06, opacity: 0.5 },
    { clipPath: "inset(0% 0% 0% 0% round 14px)", scale: 1, opacity: 1, ease: "none",
      scrollTrigger: { trigger: el, start: "top 92%", end: "top 50%", scrub: 0.6 } }));
  $$("[data-contar-vista]").forEach((el) => {
    const o = { v: 0 };
    gsap.to(o, { v: Number(el.dataset.contarVista), duration: 1.4, ease: "power2.out",
      onUpdate: () => { el.textContent = Math.round(o.v); },
      scrollTrigger: { trigger: el, start: "top 88%" } });
  });
  $$(".cifras dd").forEach((el) => {
    const fin = Number(el.textContent);
    if (Number.isNaN(fin)) return;
    const o = { v: 0 };
    gsap.to(o, { v: fin, duration: 1.4, ease: "power2.out", onUpdate: () => { el.textContent = Math.round(o.v); },
      scrollTrigger: { trigger: ".cifras", start: "top 90%" } });
  });
  gsap.fromTo("#flujo-avance", { scaleX: 0 }, { scaleX: 1, ease: "none",
    scrollTrigger: { trigger: ".flujo-marco", start: "top 75%", end: "bottom 45%", scrub: 0.5 } });
  gsap.from(".flujo li", { y: 40, opacity: 0, stagger: 0.15, duration: 0.8, ease: "power3.out",
    scrollTrigger: { trigger: ".flujo-marco", start: "top 80%" } });
  gsap.from(".flujo-icono", { scale: 0, rotate: -90, stagger: 0.15, duration: 0.7, ease: "back.out(2)",
    scrollTrigger: { trigger: ".flujo-marco", start: "top 80%" } });
  gsap.from(".pie-gigante", { yPercent: 45, opacity: 0, ease: "none",
    scrollTrigger: { trigger: ".pie", start: "top 85%", end: "bottom bottom", scrub: 0.6 } });
  gsap.from(".pie-grid > *", { y: 30, opacity: 0, stagger: 0.08, duration: 0.8, ease: "power3.out",
    scrollTrigger: { trigger: ".pie-grid", start: "top 90%" } });
}
ScrollTrigger.refresh();
