// Datos del visor del Rover 1. Para otro dron solo cambia este archivo y el GLB.
// Los patrones (regex, sin distinguir mayúsculas) se comparan con el nombre de cada pieza del GLB.
export const R = {
  frame:   ['tarot', 'frame', 'chasis', 'brazo', 'arm', 'placa.*inf', 'placa.*sup'],
  motor:   ['motor', 'gartt', '4108'],
  esc:     ['esc', 'hobbywing', 'xrotor'],
  helice:  ['h[ée]lice', 'prop', 'cfp'],
  bateria: ['bater', 'battery', 'gensace', '18650'],
  cuav:    ['cuav', 'v5'],
  rtk:     ['ardusimple', 'rtk', 'simplertk', 'rtk2b'],
  camara:  ['c[áa]mara', 'sony', 'a6000', 'cam holder', 'cam'],
  radio:   ['skydroid', 'radio', 'antena'],
};

// Pasos guiados: cada uno mueve la cámara, resalta piezas y puede activar capas.
// camara.dir: dirección desde el objetivo; camara.dist: distancia en tamaños del modelo.
export const PASOS = [
  {
    kicker: 'Paso 1 · Estructura',
    titulo: 'El chasis: fibra de carbono',
    cuerpo: 'Base Tarot 650 de fibra de carbono de 650 mm entre ejes. Los brazos reparten el peso de 3,07 kg y sostienen los cuatro motores. Es liviana y rígida, y absorbe las vibraciones de los motores.',
    foco: R.frame,
    camara: { dir: [0.6, 0.55, 0.9], dist: 1.3 },
    flujo: false,
  },
  {
    kicker: 'Paso 2 · Propulsión',
    titulo: 'Cuatro motores y hélices',
    cuerpo: 'Cuatro motores Gartt 4108 de 620 KV con hélices de 15 × 5,5 pulgadas. Cada motor aporta cerca de 7,5 N de empuje en vuelo estacionario. Girando a unas 3.700 rpm, sostienen el dron.',
    foco: [...R.motor, ...R.helice],
    camara: { dir: [0.9, 0.7, 0.6], dist: 1.1 },
    flujo: true,
  },
  {
    kicker: 'Paso 3 · Control de potencia',
    titulo: 'Los variadores ESC',
    cuerpo: 'Cuatro variadores Hobbywing XRotor Pro de 40 A. Reciben la orden de la controladora y convierten la energía de la batería en corriente trifásica para cada motor. Ajustan la velocidad de cada uno en milisegundos.',
    foco: R.esc,
    camara: { dir: [0.4, 0.5, 1], dist: 0.9 },
    flujo: false,
  },
  {
    kicker: 'Paso 4 · El cerebro',
    titulo: 'Controladora CUAV V5 Nano',
    cuerpo: 'Corre ArduPilot. Lee los sensores (giróscopo, acelerómetro, barómetro y GPS) y decide cuánta potencia da a cada motor para mantener el dron estable, en posición y en la altura elegida.',
    foco: R.cuav,
    camara: { dir: [0.5, 0.6, 0.8], dist: 0.8 },
    flujo: false,
  },
  {
    kicker: 'Paso 5 · Posición',
    titulo: 'GPS RTK a bordo',
    cuerpo: 'Un receptor simpleRTK2B Lite recibe la corrección de una base propia y calcula la posición con precisión centimétrica. Cada foto queda georreferenciada en el momento del disparo, con menos dependencia de puntos de control en el terreno.',
    foco: R.rtk,
    camara: { dir: [0.7, 0.5, 0.7], dist: 0.85 },
    flujo: false,
  },
  {
    kicker: 'Paso 6 · Energía',
    titulo: 'Batería 4S5P',
    cuerpo: '20 celdas Li-ion 18650 (Samsung 30Q) en configuración 4S5P: 4 en serie para unos 14,4 a 16,8 V y 5 en paralelo para unos 15 Ah. Con 3 kg al despegue, las pruebas dan entre 16 y 17 minutos, y el cálculo estima unos 34.',
    foco: R.bateria,
    camara: { dir: [-0.5, -0.5, 0.9], dist: 1.0 },
    flujo: false,
  },
  {
    kicker: 'Paso 7 · Mapeo',
    titulo: 'Cámara Sony A6000',
    cuerpo: 'Sensor APS-C de 24 MP montado en su soporte. Dispara sobre el plan de vuelo y cada imagen se asocia a la posición RTK del momento, lista para el procesamiento fotogramétrico.',
    foco: R.camara,
    camara: { dir: [0.3, -0.2, 1], dist: 0.8 },
    flujo: false,
    etiquetas: true,
  },
  {
    kicker: 'Recorrido completo',
    titulo: 'Todo junto',
    cuerpo: 'Así queda el dron armado. Usá el despiece para ver cómo encajan las piezas, el corte para ver el interior, y el flujo para ver hacia dónde empuja el aire cada hélice.',
    foco: null,
    camara: { dir: [0.6, 0.5, 0.9], dist: 1.3 },
    flujo: true,
    etiquetas: false,
  },
];

// Etiquetas flotantes sobre el modelo (se activan con el botón Etiquetas).
export const ETIQUETAS = [
  { texto: 'Motor', regex: R.motor, descripcion: 'Gartt 4108 · 620 KV. Motor sin escobillas que mueve cada hélice.' },
  { texto: 'Hélice', regex: R.helice, descripcion: 'Hélice de 15 × 5,5 pulgadas. Genera el empuje de cada motor.' },
  { texto: 'ESC', regex: R.esc, descripcion: 'Hobbywing XRotor Pro 40 A. Variador de velocidad de cada motor.' },
  { texto: 'CUAV V5', regex: R.cuav, descripcion: 'Controladora de vuelo con ArduPilot.' },
  { texto: 'RTK', regex: R.rtk, descripcion: 'simpleRTK2B Lite (ArduSimple). Posición con precisión centimétrica.' },
  { texto: 'Batería', regex: R.bateria, descripcion: 'Li-ion 4S5P, celdas 18650. Alimenta todo el sistema.' },
  { texto: 'Cámara', regex: R.camara, descripcion: 'Sony A6000 · APS-C 24 MP, disparo sincronizado con el RTK.' },
];

// Fichas al tocar una pieza (si el nombre coincide con el patrón).
export const FICHAS = [
  { regex: R.motor, nombre: 'Motor Gartt 4108 · 620 KV', descripcion: 'Motor brushless de 620 KV. A unas 3.700 rpm en vuelo estacionario consume unos 57 W.' },
  { regex: R.esc, nombre: 'ESC Hobbywing XRotor Pro 40 A', descripcion: 'Variador de 40 A por motor. En vuelo estacionario circulan unos 5,9 A por cada uno.' },
  { regex: R.cuav, nombre: 'CUAV V5 Nano', descripcion: 'Controladora de vuelo ArduPilot con giróscopo, acelerómetro y barómetro.' },
  { regex: R.rtk, nombre: 'simpleRTK2B Lite', descripcion: 'Receptor GNSS RTK de ArduSimple para posicionamiento centimétrico a bordo.' },
];

// Constantes del modelo simplificado (flyeval): ω = CR·σ + ωb, empuje por motor T = Ct·ω².
export const FISICA = {
  masa: 3.07,       // kg
  CR: 472.94,       // rad/s
  wb: 133.51,       // rad/s
  Ct: 4.965e-5,     // N/(rad/s)²
};
