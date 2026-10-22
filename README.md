# LonxsLocate Web

Sitio de [LonxsLocate](https://github.com/Lonxs69/LonxsLocate): un globo 3D en wireframe que hace zoom a República Dominicana con el scroll, la historia de cómo se llegó a una constelación de 64 satélites, los resultados del barrido de 90 diseños, una calculadora de enlace, los videos de Universe Sandbox y la arquitectura en AWS.

## Stack

- **Three.js** para el globo: Tierra de puntos, órbitas, satélites, enlaces y estrellas.
- **GSAP ScrollTrigger + Lenis** para las animaciones ligadas al scroll.
- **D3** para el gráfico de resultados y las fronteras (Natural Earth vía world-atlas).
- **Lucide** para los iconos.
- Sin build: HTML, CSS y módulos de JavaScript servidos como archivos estáticos.

El modelo orbital de `js/modelo.js` es el mismo del motor en Python, portado a JavaScript, y da las mismas cifras.

## Ver en local

```bash
python3 -m http.server 8765
# abrir http://127.0.0.1:8765
```

## Actualizar los datos

Los archivos de `data/`, `img/` y `descargas/` se generan con el motor:

```bash
git clone https://github.com/Lonxs69/LonxsLocate.git ../LonxsLocate
python3 scripts/exportar_datos.py --motor ../LonxsLocate --barrido barrido.json
```

## Despliegue

Vercel, con la raíz del repositorio como *Root Directory* y sin comando de build. `vercel.json` define la caché de los videos y las cabeceras de seguridad.

---

Junior De León · [@Lonxs69](https://github.com/Lonxs69) · Licencia MIT
