"""Genera los datos, figuras y descargas del sitio a partir del motor LonxsLocate.

    python scripts/exportar_datos.py --motor ../LonxsLocate [--barrido barrido.json]

Las estaciones salen de data/estaciones.csv del motor, la historia se simula
con su código y el ranking viene de un barrido real
(python -m lonxslocate barrido --json barrido.json).
"""

from __future__ import annotations

import argparse
import json
import shutil
import sys
from pathlib import Path

WEB = Path(__file__).resolve().parent.parent

# Constelaciones de la historia de la página (mismos parámetros que web/js/app.js)
HISTORIA = {
    "uno": (1, 1, 629, True),
    "fragil": (10, 1, 629, False),
    "inicial": (20, 10, 629, True),
    "optimo": (8, 8, 1200, True),
}


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--motor", type=Path, default=WEB.parent / "LonxsLocate", help="ruta al repo LonxsLocate")
    p.add_argument("--barrido", type=Path, help="JSON generado por `lonxslocate barrido --json`")
    args = p.parse_args()

    RAIZ = args.motor.resolve()
    sys.path.insert(0, str(RAIZ))
    from lonxslocate.barrido import mejores
    from lonxslocate.cobertura import simular_cobertura
    from lonxslocate.enlace import cargar_estaciones
    from lonxslocate.orbita import RADIO_TIERRA, constelacion_walker

    (WEB / "data").mkdir(parents=True, exist_ok=True)
    (WEB / "img").mkdir(exist_ok=True)
    (WEB / "descargas").mkdir(exist_ok=True)

    estaciones = [
        {"nombre": e.nombre, "tipo": e.tipo, "region": e.region,
         "lat": e.latitud, "lon": e.longitud, "alt_m": e.altitud_m}
        for e in cargar_estaciones()
    ]
    (WEB / "data" / "estaciones.json").write_text(
        json.dumps(estaciones, ensure_ascii=False, indent=1), encoding="utf-8")

    historia = {}
    for nombre, (planos, sats, alt, escalonada) in HISTORIA.items():
        res = simular_cobertura(
            cargar_estaciones(),
            constelacion_walker(planos, sats, RADIO_TIERRA + alt, 98.0, escalonada=escalonada),
            duracion_h=24, paso_s=60,
        )
        historia[nombre] = {
            "satelites": planos * sats,
            "cobertura_min_pct": round(min(r.porcentaje for r in res), 1),
            "hueco_maximo_min": max(r.hueco_maximo_min for r in res),
        }
    (WEB / "data" / "historia.json").write_text(json.dumps(historia, ensure_ascii=False, indent=1), encoding="utf-8")

    if args.barrido:
        resultados = json.loads(args.barrido.read_text(encoding="utf-8"))
        campos = ("planos", "sats_por_plano", "altitud_km", "total_satelites",
                  "cobertura_min_pct", "hueco_maximo_min", "visibles_promedio", "peor_estacion")
        resumen = {
            "configuraciones": len(resultados),
            "mejores_por_altitud": [
                {k: m[0][k] for k in campos}
                for h in sorted({r["altitud_km"] for r in resultados})
                if (m := mejores([r for r in resultados if r["altitud_km"] == h], 99.9, 1))
            ],
            "todos": [{k: r[k] for k in campos} for r in resultados],
        }
        (WEB / "data" / "barrido.json").write_text(
            json.dumps(resumen, ensure_ascii=False), encoding="utf-8")

    for nombre in ("enlace-santo-domingo-pedernales.png", "estaciones-rd.png",
                   "red-acceso-pedernales.png", "banner.svg"):
        shutil.copy2(RAIZ / "docs" / "img" / nombre, WEB / "img" / nombre)
    shutil.copy2(RAIZ / "simulaciones" / "cisco" / "SimulacionCisco.pkt",
                 WEB / "descargas" / "SimulacionCisco.pkt")
    print(f"Sitio actualizado en {WEB}")


if __name__ == "__main__":
    main()
