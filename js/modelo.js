// Port a JavaScript del motor de lonxslocate (orbita.py, enlace.py, cobertura.py).
// Tierra esférica y órbitas circulares, igual que la versión en Python.

export const MU = 398600.4418; // km^3/s^2
export const R = 6371.0; // km
export const OMEGA = 7.2921159e-5; // rad/s
export const C = 299792.458; // km/s
const RAD = Math.PI / 180;

export const periodo = (a) => 2 * Math.PI * Math.sqrt(a ** 3 / MU);
const movMedio = (a) => Math.sqrt(MU / a ** 3);

export function walker(planos, satsPorPlano, altitudKm, inclinacion = 98, fase = 1, escalonada = true) {
  const a = R + altitudKm;
  const total = planos * satsPorPlano;
  const sats = [];
  for (let p = 0; p < planos; p++) {
    const raan = (360 * p) / planos;
    const desfase = escalonada ? (360 * fase * p) / total : 0;
    for (let s = 0; s < satsPorPlano; s++) {
      sats.push({ nombre: `LEO ${p + 1}-${s + 1}`, a, inc: inclinacion * RAD, raan: raan * RAD,
        u0: ((360 * s) / satsPorPlano + desfase) * RAD, n: movMedio(a) });
    }
  }
  return sats;
}

export function posSat(sat, t) {
  const u = sat.u0 + sat.n * t;
  const cu = Math.cos(u), su = Math.sin(u);
  const cr = Math.cos(sat.raan), sr = Math.sin(sat.raan);
  const ci = Math.cos(sat.inc), si = Math.sin(sat.inc);
  return [sat.a * (cr * cu - sr * su * ci), sat.a * (sr * cu + cr * su * ci), sat.a * su * si];
}

export function posTierra(lat, lon, altKm = 0, t = 0, rotacion = true) {
  const r = R + altKm;
  const la = lat * RAD;
  const lo = lon * RAD + (rotacion ? OMEGA * t : 0);
  return [r * Math.cos(la) * Math.cos(lo), r * Math.cos(la) * Math.sin(lo), r * Math.sin(la)];
}

export function geometria(pe, ps) {
  const d = [ps[0] - pe[0], ps[1] - pe[1], ps[2] - pe[2]];
  const dist = Math.hypot(...d);
  const cenit = Math.hypot(...pe);
  const s = (d[0] * pe[0] + d[1] * pe[1] + d[2] * pe[2]) / (dist * cenit);
  return { elevacion: Math.asin(Math.max(-1, Math.min(1, s))) / RAD, distancia: dist };
}

// Punto sobre la superficie bajo el satélite (lat, lon en grados), con la Tierra girando
export function subpunto(ps, t) {
  const r = Math.hypot(...ps);
  let lon = (Math.atan2(ps[1], ps[0]) - OMEGA * t) / RAD;
  lon = ((((lon + 180) % 360) + 360) % 360) - 180;
  return [lon, Math.asin(ps[2] / r) / RAD];
}

export const latenciaMs = (km) => (km / C) * 1000;
export const fsplDb = (km, mhz) => 20 * Math.log10(km) + 20 * Math.log10(mhz) + 32.44;

export function anguloHuella(altKm, elevMin = 10) {
  const e = elevMin * RAD;
  return Math.acos((R * Math.cos(e)) / (R + altKm)) - e; // ángulo central en rad
}

export function simularCobertura(estaciones, sats, { horas = 24, paso = 60, elevMin = 10 } = {}) {
  const pasos = Math.floor((horas * 3600) / paso) + 1;
  const st = estaciones.map(() => ({ ok: 0, suma: 0, hueco: 0, max: 0 }));
  for (let k = 0; k < pasos; k++) {
    const t = k * paso;
    const ps = sats.map((s) => posSat(s, t));
    estaciones.forEach((e, i) => {
      const pe = posTierra(e.lat, e.lon, e.alt_m / 1000, t);
      let vis = 0;
      for (const p of ps) if (geometria(pe, p).elevacion >= elevMin) vis++;
      const x = st[i];
      x.suma += vis;
      if (vis) { x.ok++; x.hueco = 0; } else { x.hueco++; x.max = Math.max(x.max, x.hueco); }
    });
  }
  return estaciones.map((e, i) => ({
    estacion: e.nombre,
    porcentaje: (100 * st[i].ok) / pasos,
    huecoMaxMin: (st[i].max * paso) / 60,
    visibles: st[i].suma / pasos,
  }));
}
