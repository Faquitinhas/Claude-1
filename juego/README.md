# Horizonte — simulador de vuelo

Simulador de vuelo 3D que corre en el navegador, sin instalar nada y sin dependencias: todo
(mundo, avión, sonido e instrumentos) se genera por código con WebGL 2 y Web Audio.

Pilotás un monomotor de ala alta (el *Cóndor C-160*) sobre la **Isla Aurora**: 49 × 49 km con
cordillera nevada, volcán, bosques, lagunas costeras y cuatro aeródromos.

## Cómo jugar

Abrí `juego/` en el sitio (por ejemplo `https://tu-sitio/juego/`). Para probarlo en tu
computadora necesitás un servidor estático, porque usa módulos de JavaScript:

```
cd juego
python3 -m http.server 8000
# y abrí http://localhost:8000
```

Funciona en Chrome, Edge, Firefox y Safari recientes, en computadora y en celular (en
horizontal, con controles táctiles).

### Controles (teclado)

| Tecla | Acción |
| --- | --- |
| ↑ ↓ | Cabeceo (↓ = tirar de la palanca, morro arriba) |
| ← → | Alabeo; en tierra, dirección |
| W / S | Más / menos gases (1–9 y 0: gases al 10–100 %) |
| A / D | Timón de dirección |
| F / V | Bajar / subir flaps |
| Espacio | Frenos · **B**: freno de estacionamiento |
| T / G | Compensador: morro arriba / abajo |
| E | Arrancar o parar el motor |
| C | Cámara: exterior, cabina, sobrevuelo · arrastrar para mirar, rueda para zoom |
| M | Mapa · **Tab**: HUD · **L**: luces · **Y**: pilotar con el ratón |
| R | Reiniciar · **Esc / P**: pausa |

También hay soporte de mando (palanca izquierda, gatillos para los gases) y controles en
pantalla para móviles.

**Despegue rápido:** soltá el freno (B), gases a fondo (W), mantené el eje y a 55 nudos tirá
suave (↓). Ascendé a unos 75 nudos.

### Modos

- **Volar ahora / Misiones:** primer vuelo guiado, aterrizaje, circuito de tráfico, viento
  cruzado, aterrizaje con lluvia, pista de montaña, travesía al volcán, motor parado y aproximación nocturna. Los
  aterrizajes se puntúan (suavidad, eje, punto de contacto, alineación, velocidad).
- **Vuelo libre:** elegís aeródromo, pista, hora, nubes, viento y visibilidad.

## Qué simula

**Vuelo.** Sólido rígido de 6 grados de libertad integrado a 240 Hz. El avión se divide en
elementos aerodinámicos (tiras de ala, estabilizador, deriva, fuselaje) y cada uno calcula su
propio ángulo de ataque con curvas válidas en ±180°, así que la pérdida, la caída de ala, la
barrena, la guiñada adversa y el efecto suelo salen solos de la física. Hélice de paso fijo
con curvas de tracción y potencia, motor de pistón, estela de la hélice sobre la cola, par
motor y factor P (hay que pisar pedal derecho al despegar, salvo que uses la ayuda de timón),
tren triciclo con amortiguadores y neumáticos, viento con capa límite, ascendencias de ladera,
térmicas que derivan con el viento, bataneo antes de la pérdida, turbulencia y pista mojada
con menos agarre cuando llueve. Cifras de referencia: 123 nudos de velocidad máxima, pérdida a 52 nudos (45
con flaps), planeo 9:1.

**Mundo.** El relieve se esculpe en la GPU al cargar: forma base, erosión por octavas que
sigue la pendiente acumulada (drenaje dendrítico), erosión térmica, oclusión ambiental y
máscara de bosque. Se dibuja con *geometry clipmaps*.

**Luz y aire.** Atmósfera física (Rayleigh, Mie y ozono, con tablas de transmitancia,
dispersión múltiple y perspectiva aérea), Sol y Luna con sus posiciones reales para la hora,
estrellas, exposición automática y render HDR. Nubes volumétricas con sombra sobre el
terreno, océano con olas filtradas por distancia y brillo solar, bosques instanciados,
luces de pista fotométricas y PAPI que cambia de color según tu senda real. Lluvia con suelo
mojado y reflectante, y destello del Sol en la lente.

**Cabina y sonido.** Tablero con los seis instrumentos básicos, tacómetro y GPS; motor,
hélice (con efecto Doppler), viento, ruedas y avisos sintetizados en tiempo real.

## Ajustes

Calidad gráfica en cuatro niveles (cambia la resolución del mundo, nubes y árboles) y
resolución automática para sostener la fluidez. Si en tu equipo va lento, bajá un nivel o
abrí el juego con `?q=low`. Añadí `?fps` para ver los cuadros por segundo.

## Estructura

```
juego/
  index.html, style.css
  src/
    main.js            arranque y flujo del juego
    core/              utilidades WebGL 2 y matemáticas
    world/             terreno, atmósfera, océano, nubes, árboles, aeródromos, luces
    render/            cámara, orquestación del frame y post-proceso
    aircraft/          dinámica de vuelo, modelo 3D y render del avión
    game/              entrada, cámaras, misiones, entorno, guardado
    ui/                menús, HUD, panel de instrumentos, controles táctiles
    audio/             sonido procedural
```
