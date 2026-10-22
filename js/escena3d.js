// Escena 3D del globo: Tierra de puntos, costas, órbitas, satélites, enlaces y estrellas.
// La vista está fija a la Tierra (marco ECEF): RD no se va de cámara y son los
// satélites y sus órbitas los que se mueven. La cámara sigue a `meta`
// (lon, lat, distancia y desplazamiento en pantalla) con suavizado, así el
// scroll nunca produce saltos.

import * as THREE from "three";
import { OMEGA, R, posSat, posTierra } from "./modelo.js";

const RAD = Math.PI / 180;
const ROJO = new THREE.Color("#ff6b5a");
const BLANCO = new THREE.Color("#f3ecef");
const VERDE = new THREE.Color("#3ccf8e");
const GRIS = new THREE.Color("#6b6168");

// ECI/ECEF (km) → coordenadas de three.js (radio terrestre = 1, eje Y = polo norte)
const aVec = ([x, y, z], v = new THREE.Vector3()) => v.set(x / R, z / R, -y / R);
const lonLatAVec = (lon, lat, r = 1, v = new THREE.Vector3()) => {
  const la = lat * RAD, lo = lon * RAD;
  return v.set(r * Math.cos(la) * Math.cos(lo), r * Math.sin(la), -r * Math.cos(la) * Math.sin(lo));
};
const difAngulo = (a, b) => ((((b - a) % 360) + 540) % 360) - 180;

function segmentos(lineas, radio) {
  const pts = [];
  const a = new THREE.Vector3(), b = new THREE.Vector3();
  for (const l of lineas) {
    for (let i = 0; i < l.length - 1; i++) {
      lonLatAVec(l[i][0], l[i][1], radio, a);
      lonLatAVec(l[i + 1][0], l[i + 1][1], radio, b);
      pts.push(a.x, a.y, a.z, b.x, b.y, b.z);
    }
  }
  return new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
}

function reticula(paso = 20) {
  const lineas = [];
  for (let lat = -60; lat <= 60; lat += paso) {
    const l = [];
    for (let lon = -180; lon <= 180; lon += 3) l.push([lon, lat]);
    lineas.push(l);
  }
  for (let lon = -180; lon < 180; lon += paso) {
    const l = [];
    for (let lat = -84; lat <= 84; lat += 3) l.push([lon, lat]);
    lineas.push(l);
  }
  return lineas;
}

// Puntos sobre tierra firme: se pinta un mapa de máscara y se muestrea una esfera de Fibonacci.
function puntosDeTierra(paises, rd) {
  const d3 = window.d3;
  const W = 2048, H = 1024;
  const lienzo = document.createElement("canvas");
  lienzo.width = W; lienzo.height = H;
  const g = lienzo.getContext("2d", { willReadFrequently: true });
  const proy = d3.geoEquirectangular().scale(W / (2 * Math.PI)).translate([W / 2, H / 2]);
  const camino = d3.geoPath(proy, g);
  g.fillStyle = "#00ff00"; g.beginPath(); camino(paises); g.fill();
  g.fillStyle = "#ff0000"; g.beginPath(); camino(rd); g.fill();
  const px = g.getImageData(0, 0, W, H).data;
  const tipo = (lon, lat) => {
    const [x, y] = proy([lon, lat]);
    const i = (Math.min(H - 1, Math.max(0, Math.round(y))) * W + Math.min(W - 1, Math.max(0, Math.round(x)))) * 4;
    return px[i] > 128 ? 2 : px[i + 1] > 128 ? 1 : 0;
  };
  const tierra = [], rdPts = [];
  const v = new THREE.Vector3();
  const N = 52000, aureo = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < N; i++) {
    const y = 1 - (2 * (i + 0.5)) / N;
    const lat = Math.asin(y) / RAD;
    const lon = ((((i * aureo) / RAD) % 360) + 360) % 360 - 180;
    if (tipo(lon, lat) === 1) { lonLatAVec(lon, lat, 1.0015, v); tierra.push(v.x, v.y, v.z); }
  }
  // RD con más densidad para el acercamiento
  for (let lat = 17.45; lat <= 19.98; lat += 0.055) {
    for (let lon = -72.05; lon <= -68.3; lon += 0.055 / Math.cos(lat * RAD)) {
      if (tipo(lon, lat) === 2) { lonLatAVec(lon, lat, 1.002, v); rdPts.push(v.x, v.y, v.z); }
    }
  }
  return { tierra, rdPts };
}

const materialBrillo = (color, potencia, fuerza) => new THREE.ShaderMaterial({
  uniforms: { color: { value: new THREE.Color(color) }, potencia: { value: potencia }, fuerza: { value: fuerza } },
  vertexShader: "varying vec3 vN; void main(){ vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
  fragmentShader: "uniform vec3 color; uniform float potencia; uniform float fuerza; varying vec3 vN; void main(){ float i = pow(max(0.0, 0.72 - dot(vN, vec3(0.0,0.0,1.0))), potencia) * fuerza; gl_FragColor = vec4(color * i, i); }",
  side: THREE.BackSide, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false,
});

// Puntos luminosos redondos con tamaño en mundo y límite en píxeles (satélites y pulsos)
const materialLuz = () => new THREE.ShaderMaterial({
  uniforms: { escalaPx: { value: 800 }, alfa: { value: 1 } },
  vertexShader: `
    attribute float tam; attribute vec3 color; varying vec3 vColor;
    uniform float escalaPx;
    void main(){
      vColor = color;
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      gl_PointSize = clamp(tam * escalaPx / -mv.z, 2.5, 26.0);
      gl_Position = projectionMatrix * mv;
    }`,
  fragmentShader: `
    varying vec3 vColor; uniform float alfa;
    void main(){
      float d = length(gl_PointCoord - 0.5);
      float nucleo = smoothstep(0.2, 0.05, d);
      float halo = smoothstep(0.5, 0.0, d) * 0.45;
      float a = (nucleo + halo) * alfa;
      if (a < 0.01) discard;
      gl_FragColor = vec4(mix(vColor, vec3(1.0), nucleo * 0.35), a);
    }`,
  transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending,
});

// Puntos redondos de la superficie, con tope en píxeles para que no se vuelvan bloques al acercarse
const materialPuntos = (color, tam, maxPx, opacidad = 1) => new THREE.ShaderMaterial({
  uniforms: { color: { value: new THREE.Color(color) }, escalaPx: { value: 800 }, tam: { value: tam }, maxPx: { value: maxPx }, opacidad: { value: opacidad } },
  vertexShader: `
    uniform float escalaPx; uniform float tam; uniform float maxPx;
    void main(){
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      gl_PointSize = clamp(tam * escalaPx / -mv.z, 1.0, maxPx);
      gl_Position = projectionMatrix * mv;
    }`,
  fragmentShader: `
    uniform vec3 color; uniform float opacidad;
    void main(){
      float d = length(gl_PointCoord - 0.5);
      float a = smoothstep(0.5, 0.3, d) * opacidad;
      if (a < 0.02) discard;
      gl_FragColor = vec4(color, a);
    }`,
  transparent: true, depthWrite: false,
});

function buffer(n, comps) {
  return new THREE.Float32BufferAttribute(new Float32Array(Math.max(1, n) * comps), comps).setUsage(THREE.DynamicDrawUsage);
}

export class Escena {
  constructor(canvas, { mundo, estaciones }) {
    this.canvas = canvas;
    this.estaciones = estaciones;
    this.elevMin = 10;
    this.t = 0;
    this.reloj = 0;
    this.sats = [];
    this.pendientes = null;
    this.alfa = 0;
    this.opacidadOrbita = 0.2;
    this.tamSat = 0.016;
    this.instante = { sirviendo: 0, conServicio: 0 };
    this.alAvanzar = null;
    this.alDibujar = null;
    this.activa = true;
    this.meta = { lon: -40, lat: 15, dist: 7, dx: 0, dy: 0 };
    this.vista = { ...this.meta };

    this.dprMax = Math.min(window.devicePixelRatio || 1, 1.5);
    this.dpr = this.dprMax;
    // En pantallas Retina el antialiasing casi no se nota y cuesta mucho a la GPU
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: (window.devicePixelRatio || 1) < 1.5, alpha: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(this.dpr);
    this.scene = new THREE.Scene();
    this.camara = new THREE.PerspectiveCamera(36, 1, 0.01, 200);

    // Estrellas
    const est = [], colEst = [];
    for (let i = 0; i < 2200; i++) {
      const u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2, r = 60 + Math.random() * 40;
      const s = Math.sqrt(1 - u * u);
      est.push(r * s * Math.cos(th), r * u, r * s * Math.sin(th));
      const b = 0.35 + Math.random() * 0.65;
      colEst.push(b, b * (0.9 + Math.random() * 0.1), b);
    }
    const geoEst = new THREE.BufferGeometry();
    geoEst.setAttribute("position", new THREE.Float32BufferAttribute(est, 3));
    geoEst.setAttribute("color", new THREE.Float32BufferAttribute(colEst, 3));
    this.estrellas = new THREE.Points(geoEst, new THREE.PointsMaterial({
      size: 1.4, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 0.8, depthWrite: false,
    }));
    this.scene.add(this.estrellas);

    // Tierra
    const paises = window.topojson.feature(mundo, mundo.objects.countries);
    const rd = paises.features.find((f) => f.id === "214");
    const tierra = new THREE.Group();
    tierra.add(new THREE.Mesh(new THREE.SphereGeometry(0.996, 96, 64), new THREE.MeshBasicMaterial({ color: "#08060a" })));
    tierra.add(new THREE.Mesh(new THREE.SphereGeometry(1.025, 96, 64), materialBrillo("#ff5a46", 3.2, 1.1)));
    tierra.add(new THREE.Mesh(new THREE.SphereGeometry(1.22, 96, 64), materialBrillo("#e5352b", 2.2, 0.55)));
    tierra.add(new THREE.LineSegments(segmentos(reticula(), 1.0005),
      new THREE.LineBasicMaterial({ color: "#3a2a31", transparent: true, opacity: 0.45 })));
    const { tierra: ptsTierra, rdPts } = puntosDeTierra(paises, rd);
    const gT = new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(ptsTierra, 3));
    this.matTierra = materialPuntos("#8a7882", 0.0058, 3.2, 0.8);
    tierra.add(new THREE.Points(gT, this.matTierra));
    const gR = new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(rdPts, 3));
    this.matRD = materialPuntos("#ff6b5a", 0.0042, 4.2, 1);
    tierra.add(new THREE.Points(gR, this.matRD));
    const costas = window.topojson.mesh(mundo, mundo.objects.countries);
    tierra.add(new THREE.LineSegments(segmentos(costas.coordinates, 1.0012),
      new THREE.LineBasicMaterial({ color: "#a08f98", transparent: true, opacity: 0.32 })));
    const anillos = rd.geometry.type === "MultiPolygon" ? rd.geometry.coordinates.flat() : rd.geometry.coordinates;
    tierra.add(new THREE.LineSegments(segmentos(anillos, 1.003), new THREE.LineBasicMaterial({ color: ROJO })));
    this.scene.add(tierra);

    // Estaciones
    this.marcas = estaciones.map((e) => {
      const geo = e.tipo === "uplink"
        ? new THREE.BoxGeometry(0.012, 0.012, 0.004)
        : new THREE.CylinderGeometry(0.0065, 0.0065, 0.004, 16).rotateX(Math.PI / 2);
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: GRIS }));
      m.position.copy(lonLatAVec(e.lon, e.lat, 1.0035));
      m.lookAt(0, 0, 0);
      this.scene.add(m);
      e.vec = posTierra(e.lat, e.lon, e.alt_m / 1000, 0, false);
      const nr = Math.hypot(...e.vec);
      e.nor = e.vec.map((c) => c / nr);
      return m;
    });

    // Órbitas, enlaces, satélites y pulsos
    this.orbitas = new THREE.Group();
    this.scene.add(this.orbitas);
    this.matOrbita = new THREE.LineBasicMaterial({ color: "#e5352b", transparent: true, opacity: 0, depthWrite: false });
    this.geoEnlaces = new THREE.BufferGeometry().setAttribute("position", buffer(estaciones.length * 2, 3));
    this.matEnlaces = new THREE.LineBasicMaterial({ color: VERDE, transparent: true, opacity: 0, depthWrite: false });
    this.scene.add(new THREE.LineSegments(this.geoEnlaces, this.matEnlaces));
    this.matSats = materialLuz();
    this.geoSats = new THREE.BufferGeometry();
    const puntosSats = new THREE.Points(this.geoSats, this.matSats);
    puntosSats.frustumCulled = false;
    puntosSats.renderOrder = 5;
    this.scene.add(puntosSats);
    this.matPulsos = materialLuz();
    this.geoPulsos = new THREE.BufferGeometry()
      .setAttribute("position", buffer(estaciones.length, 3))
      .setAttribute("color", buffer(estaciones.length, 3))
      .setAttribute("tam", buffer(estaciones.length, 1));
    const pulsos = new THREE.Points(this.geoPulsos, this.matPulsos);
    pulsos.frustumCulled = false;
    pulsos.renderOrder = 6;
    this.scene.add(pulsos);

    new ResizeObserver(() => this.redimensionar()).observe(canvas.parentElement);
    this.redimensionar();
    this.colocarCamara();
    this.ultimo = performance.now();
    this.tiempos = [];
    this.renderer.setAnimationLoop((ahora) => this.cuadro(ahora));
  }

  redimensionar() {
    const r = this.canvas.parentElement.getBoundingClientRect();
    if (!r.width || !r.height) return;
    this.ancho = r.width;
    this.alto = r.height;
    this.renderer.setSize(r.width, r.height, false);
    this.camara.aspect = r.width / r.height;
    this.camara.updateProjectionMatrix();
  }

  // Posición en pantalla (px) de un punto de la superficie y si mira hacia la cámara
  proyectar(lon, lat, salida = {}) {
    const p = lonLatAVec(lon, lat, 1.01, this.tmpP || (this.tmpP = new THREE.Vector3()));
    const c = this.camara.position;
    salida.frente = (p.x * c.x + p.y * c.y + p.z * c.z) / (1.01 * c.length()) > 0.2;
    p.project(this.camara);
    salida.x = ((p.x + 1) / 2) * this.ancho;
    salida.y = ((1 - p.y) / 2) * this.alto;
    return salida;
  }

  // Cambia de constelación con un fundido: se apaga, se reemplaza y vuelve a encender
  setConstelacion(sats) {
    if (!this.sats.length) this.aplicarConstelacion(sats);
    else this.pendientes = sats;
  }

  aplicarConstelacion(sats) {
    this.sats = sats;
    this.pendientes = null;
    for (const hijo of this.orbitas.children) hijo.geometry.dispose();
    this.orbitas.clear();
    const planos = new Map();
    for (const s of sats) if (!planos.has(s.raan)) planos.set(s.raan, s);
    for (const s of planos.values()) {
      const pts = [];
      for (let k = 0; k <= 160; k++) pts.push(aVec(posSat({ ...s, u0: (k / 160) * 2 * Math.PI, n: 0 }, 0)));
      this.orbitas.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), this.matOrbita));
    }
    this.constantes = sats.map((sat) => ({
      a: sat.a, u0: sat.u0, n: sat.n,
      cr: Math.cos(sat.raan), sr: Math.sin(sat.raan), ci: Math.cos(sat.inc), si: Math.sin(sat.inc),
    }));
    this.ecef = new Float64Array(sats.length * 3);
    this.sirviendo = new Uint8Array(sats.length);
    this.opacidadOrbita = planos.size > 12 ? 0.16 : planos.size > 4 ? 0.3 : 0.5;
    this.tamSat = sats.length > 100 ? 0.016 : sats.length > 20 ? 0.02 : 0.028;
    for (const nombre of ["position", "color", "tam"]) this.geoSats.deleteAttribute(nombre);
    this.geoSats.setAttribute("position", buffer(sats.length, 3));
    this.geoSats.setAttribute("color", buffer(sats.length, 3));
    this.geoSats.setAttribute("tam", buffer(sats.length, 1));
  }

  colocarCamara() {
    const v = this.vista;
    lonLatAVec(v.lon, v.lat, v.dist, this.camara.position);
    this.camara.up.set(0, 1, 0);
    this.camara.lookAt(0, 0, 0);
    const w = this.ancho || 1, h = this.alto || 1;
    this.camara.setViewOffset(w, h, -v.dx * w, -v.dy * h, w, h);
    this.camara.updateMatrixWorld();
    for (const m of [this.matSats, this.matPulsos, this.matTierra, this.matRD]) m.uniforms.escalaPx.value = h * this.dpr;
  }

  // ¿El segmento cámara → punto atraviesa la Tierra?
  oculto(p) {
    const c = this.camara.position;
    const dx = p.x - c.x, dy = p.y - c.y, dz = p.z - c.z;
    const t = -(c.x * dx + c.y * dy + c.z * dz) / (dx * dx + dy * dy + dz * dz);
    if (t <= 0 || t >= 1) return false;
    const x = c.x + t * dx, y = c.y + t * dy, z = c.z + t * dz;
    return x * x + y * y + z * z < 0.995;
  }

  actualizar(dt) {
    const th = OMEGA * this.t;
    const cth = Math.cos(th), sth = Math.sin(th);
    this.orbitas.rotation.y = -th;
    const pos = this.geoSats.getAttribute("position");
    if (!pos || !this.constantes) return;
    const col = this.geoSats.getAttribute("color");
    const tam = this.geoSats.getAttribute("tam");
    // Posiciones ECEF sin crear objetos (evita pausas del recolector de basura)
    const E = this.ecef, ns = this.constantes.length;
    for (let i = 0; i < ns; i++) {
      const c = this.constantes[i];
      const u = c.u0 + c.n * this.t, cu = Math.cos(u), su = Math.sin(u);
      const x = c.a * (c.cr * cu - c.sr * su * c.ci);
      const y = c.a * (c.sr * cu + c.cr * su * c.ci);
      E[i * 3] = x * cth + y * sth;
      E[i * 3 + 1] = -x * sth + y * cth;
      E[i * 3 + 2] = c.a * su * c.si;
    }
    const sirviendo = this.sirviendo.fill(0);
    const senMin = Math.sin(this.elevMin * RAD);
    const enl = this.geoEnlaces.getAttribute("position");
    const pp = this.geoPulsos.getAttribute("position");
    const pc = this.geoPulsos.getAttribute("color");
    const pt = this.geoPulsos.getAttribute("tam");
    const v = this.tmpV || (this.tmpV = new THREE.Vector3());
    const a = this.tmpA || (this.tmpA = new THREE.Vector3());
    let conServicio = 0, n = 0, np = 0;
    for (let j = 0; j < this.estaciones.length; j++) {
      const e = this.estaciones[j], pe = e.vec, nr = e.nor;
      let mejor = -1, mejorSen = -2;
      for (let i = 0; i < ns; i++) {
        const dx = E[i * 3] - pe[0], dy = E[i * 3 + 1] - pe[1], dz = E[i * 3 + 2] - pe[2];
        const sen = (dx * nr[0] + dy * nr[1] + dz * nr[2]) / Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (sen >= senMin) {
          sirviendo[i] = 1;
          if (sen > mejorSen) { mejorSen = sen; mejor = i; }
        }
      }
      e.servicio = mejor >= 0;
      this.marcas[j].material.color.copy(e.servicio ? VERDE : GRIS);
      if (!e.servicio) continue;
      conServicio++;
      const s = this.marcas[j].position;
      v.set(E[mejor * 3] / R, E[mejor * 3 + 2] / R, -E[mejor * 3 + 1] / R);
      enl.setXYZ(n++, s.x, s.y, s.z);
      enl.setXYZ(n++, v.x, v.y, v.z);
      // Pulso de datos que sube y baja por el enlace
      const f = (this.reloj * 0.55 + j * 0.173) % 1;
      a.copy(s).lerp(v, f < 0.5 ? f * 2 : 2 - f * 2);
      if (!this.oculto(a)) {
        pp.setXYZ(np, a.x, a.y, a.z);
        pc.setXYZ(np, 0.55, 1, 0.78);
        pt.setX(np, 0.011);
        np++;
      }
    }
    enl.needsUpdate = true;
    this.geoEnlaces.setDrawRange(0, n);
    pp.needsUpdate = pc.needsUpdate = pt.needsUpdate = true;
    this.geoPulsos.setDrawRange(0, np);

    // Solo se dibujan los satélites que no quedan detrás del planeta
    let nv = 0, sirven = 0;
    for (let i = 0; i < ns; i++) {
      sirven += sirviendo[i];
      v.set(E[i * 3] / R, E[i * 3 + 2] / R, -E[i * 3 + 1] / R);
      if (this.oculto(v)) continue;
      pos.setXYZ(nv, v.x, v.y, v.z);
      const c = sirviendo[i] ? ROJO : BLANCO;
      col.setXYZ(nv, c.r, c.g, c.b);
      tam.setX(nv, sirviendo[i] ? this.tamSat * 1.5 : this.tamSat);
      nv++;
    }
    pos.needsUpdate = col.needsUpdate = tam.needsUpdate = true;
    this.geoSats.setDrawRange(0, nv);
    this.instante.sirviendo = sirven;
    this.instante.conServicio = conServicio;

    // Fundido entre constelaciones
    if (this.pendientes) {
      this.alfa = Math.max(0, this.alfa - dt * 4.5);
      if (this.alfa === 0) this.aplicarConstelacion(this.pendientes);
    } else {
      this.alfa = Math.min(1, this.alfa + dt * 2.2);
    }
    this.matSats.uniforms.alfa.value = this.alfa;
    this.matPulsos.uniforms.alfa.value = this.alfa;
    this.matOrbita.opacity = this.opacidadOrbita * this.alfa;
    this.matEnlaces.opacity = 0.55 * this.alfa;
  }

  // Ajusta la resolución si el equipo no sostiene la animación
  medir(dt) {
    this.tiempos.push(dt);
    if (this.tiempos.length < 90) return;
    const prom = this.tiempos.reduce((x, y) => x + y, 0) / this.tiempos.length;
    this.tiempos = [];
    let nuevo = this.dpr;
    if (prom > 1 / 50) nuevo = Math.max(0.85, this.dpr - 0.25);
    else if (prom < 1 / 58) nuevo = Math.min(this.dprMax, this.dpr + 0.25);
    if (nuevo !== this.dpr) { this.dpr = nuevo; this.renderer.setPixelRatio(nuevo); this.redimensionar(); }
  }

  cuadro(ahora) {
    const dt = Math.max(0, Math.min((ahora - this.ultimo) / 1000, 0.1));
    this.ultimo = ahora;
    if (!this.activa) return;
    this.reloj += dt;
    if (this.alAvanzar) this.t = this.alAvanzar(dt, this.t);
    // La cámara persigue a la meta: suave aunque el scroll llegue a saltos
    const k = 1 - Math.exp(-dt * 7);
    const v = this.vista, m = this.meta;
    v.lon += difAngulo(v.lon, m.lon) * k;
    v.lat += (m.lat - v.lat) * k;
    v.dist += (m.dist - v.dist) * k;
    v.dx += (m.dx - v.dx) * k;
    v.dy += (m.dy - v.dy) * k;
    this.colocarCamara();
    this.actualizar(dt);
    const esc = Math.min(0.6, Math.max(0.12, (v.dist - 1) / 3.2));
    for (const mk of this.marcas) mk.scale.setScalar(esc);
    this.estrellas.rotation.y += dt * 0.004;
    this.renderer.render(this.scene, this.camara);
    if (this.alDibujar) this.alDibujar(dt);
    this.medir(dt);
  }
}
