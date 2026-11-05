// Visor interactivo del Rover 1 (Tarot 650). Se empaqueta con esbuild en assets/tecnologia/visor.js
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { PASOS, ETIQUETAS, FISICA, FICHAS } from './datos.js';

const $ = (s) => document.querySelector(s);
const root = $('#vis');
const esMovil = matchMedia('(max-width: 720px)').matches;
const reduceMov = matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------- escena ----------
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.localClippingEnabled = true;
renderer.outputColorSpace = THREE.SRGBColorSpace;
root.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 1000);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.enablePan = false;
const luz = new THREE.DirectionalLight(0xffffff, 1.2);
luz.position.set(2, 3, 2);
scene.add(luz);

function ajustar() {
  const w = root.clientWidth, h = root.clientHeight;
  renderer.setSize(w, h, false);
  renderer.domElement.style.width = w + 'px';
  renderer.domElement.style.height = h + 'px';
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
new ResizeObserver(ajustar).observe(root);
ajustar();

// ---------- modelo ----------
let modelo = null, tamano = 1, centro = new THREE.Vector3();
const piezas = []; // { nodo (de primer nivel), nombre, centro, base, materiales }
const planosCorte = [new THREE.Plane(new THREE.Vector3(1, 0, 0), 0)];
const estado = { paso: 0, despiece: 0, corte: false, etiquetas: false, flujo: false, lenta: false, sonido: true };

function recorrerMateriales(obj, fn) {
  obj.traverse((o) => { if (o.isMesh) (Array.isArray(o.material) ? o.material : [o.material]).forEach(fn); });
}

function cargarModelo() {
  const loader = new GLTFLoader();
  $('#carga-txt').textContent = 'Cargando modelo 3D…';
  const tmo = setTimeout(() => errorCarga('El modelo tarda demasiado. Revisá la conexión y reintentá.'), 60000);
  loader.load('assets/tecnologia/tarot650.glb?v=34', (gltf) => {
    clearTimeout(tmo);
    modelo = gltf.scene;
    modelo.rotation.y = Math.PI; // el frente del CAD (-Z) queda hacia el visor
    scene.add(modelo);
    modelo.updateMatrixWorld(true);
    const caja = new THREE.Box3().setFromObject(modelo);
    caja.getCenter(centro);
    tamano = caja.getSize(new THREE.Vector3()).length();
    // Piezas de primer nivel con nombre (para despiece, foco y etiquetas)
    modelo.children.forEach((n) => {
      const c = new THREE.Box3().setFromObject(n).getCenter(new THREE.Vector3());
      piezas.push({ nodo: n, nombre: n.name || 'Pieza', centro: c, base: n.position.clone() });
    });
    // Cada pieza con su propio material: el GLB comparte materiales entre piezas y eso resaltaba piezas de más
    modelo.traverse((o) => { if (o.isMesh) o.material = Array.isArray(o.material) ? o.material.map((m) => m.clone()) : o.material.clone(); });
    recorrerMateriales(modelo, (m) => { m.userData.opacidadBase = m.opacity ?? 1; m.userData.transparenteBase = m.transparent; });
    controls.target.copy(centro);
    camaraA({ dir: [0.6, 0.5, 0.9], dist: 1.25 }, centro, true);
    crearEtiquetas();
    crearFlujo();
    $('#carga').hidden = true;
    mostrarPaso(0, false);
  }, (ev) => {
    if (ev.total) $('#carga-txt').textContent = `Cargando modelo 3D… ${Math.round((ev.loaded / ev.total) * 100)} %`;
  }, (err) => { clearTimeout(tmo); errorCarga('No se pudo cargar el modelo 3D.', (err && (err.message || err.type)) || String(err)); console.error(err); });
}

function errorCarga(msg, detalle) {
  $('#carga-txt').textContent = msg + (detalle ? ' (' + String(detalle).slice(0, 160) + ')' : '');
  $('#carga-reintento').hidden = false;
}

// ---------- foco y transparencia ----------
function coincide(nombre, reglas) {
  if (!reglas || !reglas.length) return false;
  return reglas.some((r) => new RegExp(r, 'i').test(nombre));
}

function aplicarFoco(reglas) {
  if (!modelo) return;
  piezas.forEach((p) => {
    const en = !reglas || !reglas.length || coincide(p.nombre, reglas);
    p.nodo.traverse((o) => {
      if (!o.isMesh) return;
      (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => {
        m.transparent = !en || m.userData.transparenteBase;
        m.opacity = en ? (m.userData.opacidadBase ?? 1) : 0.12;
        m.depthWrite = en;
        m.needsUpdate = true;
      });
    });
  });
}

// ---------- cámara ----------
let viaje = null;
function camaraA(vista, objetivo, instantanea = false) {
  const destinoT = objetivo.clone();
  const dir = new THREE.Vector3(...vista.dir).normalize();
  const destinoP = destinoT.clone().add(dir.multiplyScalar(tamano * vista.dist));
  if (instantanea || reduceMov) {
    camera.position.copy(destinoP);
    controls.target.copy(destinoT);
    controls.update();
    return;
  }
  viaje = { p0: camera.position.clone(), t0: controls.target.clone(), p1: destinoP, t1: destinoT, t: 0 };
}

function centroDe(reglas) {
  const sel = piezas.filter((p) => coincide(p.nombre, reglas));
  if (!sel.length) return centro.clone();
  return sel.reduce((a, p) => a.add(p.centro), new THREE.Vector3()).multiplyScalar(1 / sel.length);
}

// ---------- pasos guiados ----------
const pasosEl = $('#pasos');
PASOS.forEach((p, i) => {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = i + 1;
  b.setAttribute('aria-label', `Paso ${i + 1}: ${p.titulo}`);
  b.addEventListener('click', () => mostrarPaso(i));
  pasosEl.appendChild(b);
});

let auto = null;
function mostrarPaso(i, hablar = true) {
  estado.paso = (i + PASOS.length) % PASOS.length;
  const p = PASOS[estado.paso];
  $('#paso-kicker').textContent = p.kicker;
  $('#paso-titulo').textContent = p.titulo;
  $('#paso-cuerpo').innerHTML = p.cuerpo;
  [...pasosEl.children].forEach((b, k) => b.classList.toggle('on', k === estado.paso));
  $('#paso-count').textContent = `${estado.paso + 1} / ${PASOS.length}`;
  if (modelo) {
    aplicarFoco(p.foco);
    camaraA(p.camara, p.foco ? centroDe(p.foco) : centro);
    estado.corte = !!p.corte; corteCtl.checked = estado.corte; aplicarCorte();
    if (p.flujo !== undefined) { estado.flujo = !!p.flujo; flujoCtl.checked = estado.flujo; }
    if (p.etiquetas !== undefined) { estado.etiquetas = !!p.etiquetas; etiqCtl.checked = estado.etiquetas; mostrarEtiquetas(); }
  }
  if (hablar) hablarPaso(p);
}

// ---------- voz (Web Speech, sin servicios externos) ----------
const hayVoz = 'speechSynthesis' in window;
const vozBtn = $('#voz');
function textoParaLeer(p) {
  const t = (p.voz || (p.titulo + '. ' + p.cuerpo)).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  return t.replace(/Ø/g, 'diámetro ').replace(/\bmm\b/g, 'milímetros').replace(/\bW\b/g, 'vatios')
          .replace(/\bkV\b/g, 'kilovoltios').replace(/\bkg\b/g, 'kilogramos').replace(/\bRPM\b|\brpm\b/g, 'revoluciones por minuto');
}
function hablarPaso(p) {
  if (!hayVoz || !estado.sonido) return;
  speechSynthesis.cancel();
  const frases = textoParaLeer(p).match(/[^.!?]{1,200}[.!?]?/g) || [];
  const voces = speechSynthesis.getVoices();
  const v = voces.find((x) => /es-AR/i.test(x.lang) && /natural|online/i.test(x.name)) || voces.find((x) => /^es/i.test(x.lang));
  frases.forEach((f) => { const u = new SpeechSynthesisUtterance(f.trim()); u.lang = 'es-AR'; if (v) u.voice = v; speechSynthesis.speak(u); });
}
if (!hayVoz) vozBtn.hidden = true;
vozBtn.addEventListener('click', () => {
  estado.sonido = !estado.sonido;
  vozBtn.textContent = estado.sonido ? '🔊' : '🔇';
  vozBtn.setAttribute('aria-pressed', String(estado.sonido));
  try { localStorage.setItem('tec-voz', estado.sonido ? '1' : '0'); } catch (e) {}
  if (!estado.sonido && hayVoz) speechSynthesis.cancel();
  else if (estado.sonido) hablarPaso(PASOS[estado.paso]);
});
try { if (localStorage.getItem('tec-voz') === '0') { estado.sonido = false; vozBtn.textContent = '🔇'; } } catch (e) {}

// ---------- reproducir ----------
const playBtn = $('#play');
function parar() { clearInterval(auto); auto = null; playBtn.textContent = '▶ Reproducir'; }
playBtn.addEventListener('click', () => {
  if (auto) return parar();
  playBtn.textContent = '■ Detener';
  mostrarPaso(estado.paso);
  auto = setInterval(() => mostrarPaso(estado.paso + 1), 9000);
});
$('#ant').addEventListener('click', () => { parar(); mostrarPaso(estado.paso - 1); });
$('#sig').addEventListener('click', () => { parar(); mostrarPaso(estado.paso + 1); });
document.addEventListener('keydown', (e) => {
  if (e.target.matches('input, textarea')) return;
  if (e.key === 'ArrowRight') { parar(); mostrarPaso(estado.paso + 1); }
  if (e.key === 'ArrowLeft') { parar(); mostrarPaso(estado.paso - 1); }
});
document.addEventListener('visibilitychange', () => { if (document.hidden && hayVoz) speechSynthesis.pause(); else if (hayVoz) speechSynthesis.resume(); });

// ---------- despiece, corte, etiquetas, flujo, lenta, centrar ----------
$('#despiece').addEventListener('input', (e) => { estado.despiece = +e.target.value; });
const corteCtl = $('#corte');
corteCtl.addEventListener('change', () => { estado.corte = corteCtl.checked; aplicarCorte(); });
function aplicarCorte() {
  if (!modelo) return;
  const activo = estado.corte;
  planosCorte[0].constant = centro.x; // corte longitudinal por el eje del frame
  recorrerMateriales(modelo, (m) => { m.clippingPlanes = activo ? planosCorte : null; m.clipShadows = activo; m.needsUpdate = true; });
}
const etiqCtl = $('#etiquetas');
etiqCtl.addEventListener('change', () => { estado.etiquetas = etiqCtl.checked; mostrarEtiquetas(); });
const flujoCtl = $('#flujo');
flujoCtl.addEventListener('change', () => { estado.flujo = flujoCtl.checked; flujoGrupo.visible = estado.flujo; });
const lentaBtn = $('#lenta');
lentaBtn.addEventListener('click', () => { estado.lenta = !estado.lenta; lentaBtn.setAttribute('aria-pressed', String(estado.lenta)); lentaBtn.textContent = estado.lenta ? 'Velocidad normal' : 'Cámara lenta ×¼'; });
$('#centrar').addEventListener('click', () => mostrarPaso(estado.paso));

const etiquetasEl = [];
function crearEtiquetas() {
  ETIQUETAS.forEach((e) => {
    const b = document.createElement('button');
    b.className = 'tec-etq';
    b.type = 'button';
    b.textContent = e.texto;
    b.hidden = true;
    b.addEventListener('click', () => {
      const idx = PASOS.findIndex((p) => p.foco && p.foco.some((f) => e.regex.some((r) => f === r)));
      if (idx >= 0) mostrarPaso(idx); else { $('#ficha-nombre').textContent = e.texto; $('#ficha-texto').textContent = e.descripcion; }
    });
    $('#etiquetas-capa').appendChild(b);
    etiquetasEl.push({ el: b, centro: centroDe(e.regex), def: e });
  });
}
function mostrarEtiquetas() { etiquetasEl.forEach((x) => { x.el.hidden = !estado.etiquetas; }); }

// Flujo de aire: partículas bajo cada hélice
let flujoGrupo = new THREE.Group();
flujoGrupo.visible = false;
scene.add(flujoGrupo);
const flujoPart = [];
function crearFlujo() {
  const rotores = piezas.filter((p) => coincide(p.nombre, ['h[ée]lice', 'prop']));
  const n = esMovil ? 60 : 110;
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(n * 3);
  const datos = [];
  for (let i = 0; i < n; i++) {
    const r = rotores.length ? rotores[i % rotores.length].centro : centro;
    const ang = Math.random() * Math.PI * 2, rad = Math.random() * tamano * 0.06;
    datos.push({ base: r.clone(), ang, rad, y: Math.random() * tamano * 0.4, v: 0.4 + Math.random() * 0.3 });
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({ size: tamano * 0.018, color: 0x7fd4ff, transparent: true, opacity: 0.8, depthWrite: false });
  const pts = new THREE.Points(geo, mat);
  flujoGrupo.add(pts);
  flujoPart.push({ geo, datos, pos });
}

// ---------- física (modelo simplificado con datos de flyeval) ----------
const sliderEmp = $('#empuje');
const fmt = (x, d = 0) => x.toLocaleString('es-AR', { maximumFractionDigits: d, minimumFractionDigits: d });
function actualizarFisica() {
  const s = +sliderEmp.value / 100;
  const omega = FISICA.CR * s + FISICA.wb;                      // rad/s
  const rpm = omega * 60 / (2 * Math.PI);
  const empujeMotor = FISICA.Ct * omega * omega;                // N
  const total = empujeMotor * 4;
  const peso = FISICA.masa * 9.8;
  $('#f-rpm').textContent = fmt(rpm);
  $('#f-emp').textContent = fmt(empujeMotor, 1);
  $('#f-tot').textContent = fmt(total, 1);
  $('#f-peso').textContent = fmt(peso, 1);
  $('#f-sign').textContent = total >= peso ? 'Sobra empuje: el dron sube' : 'Falta empuje: el dron baja';
  $('#f-sign').className = total >= peso ? 'ok' : 'bajo';
  $('#f-s').textContent = fmt(s * 100) + ' %';
  flujoVel = 0.3 + Math.sqrt(Math.max(total, 0) / peso) * 0.8;
}
let flujoVel = 1;
sliderEmp.addEventListener('input', actualizarFisica);
actualizarFisica();

// ---------- tap: ficha de pieza ----------
const ray = new THREE.Raycaster();
const ptr = new THREE.Vector2();
renderer.domElement.addEventListener('pointerup', (e) => {
  if (!modelo || Math.hypot(e.movementX || 0, e.movementY || 0) > 4) return;
  const r = renderer.domElement.getBoundingClientRect();
  ptr.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ptr, camera);
  const hit = ray.intersectObject(modelo, true)[0];
  if (!hit) return;
  let n = hit.object;
  while (n.parent && n.parent !== modelo) n = n.parent;
  const ficha = FICHAS.find((f) => coincide(n.name || '', f.regex));
  $('#ficha-nombre').textContent = ficha ? ficha.nombre : (n.name || 'Pieza');
  $('#ficha-texto').textContent = ficha ? ficha.descripcion : 'Pieza del modelo. Sin descripción cargada todavía.';
});

// ---------- bucle ----------
const reloj = new THREE.Clock();
function frame() {
  const dt = Math.min(reloj.getDelta(), 0.05) * (estado.lenta ? 0.25 : 1);
  controls.update();
  if (viaje) {
    viaje.t = Math.min(1, viaje.t + dt * 0.9);
    const k = viaje.t < 0.5 ? 2 * viaje.t * viaje.t : 1 - Math.pow(-2 * viaje.t + 2, 2) / 2;
    camera.position.lerpVectors(viaje.p0, viaje.p1, k);
    controls.target.lerpVectors(viaje.t0, viaje.t1, k);
    if (viaje.t >= 1) viaje = null;
  }
  if (modelo) {
    piezas.forEach((p) => {
      const dir = p.centro.clone().sub(centro).normalize();
      p.nodo.position.copy(p.base).addScaledVector(dir, estado.despiece * tamano * 0.18);
    });
    // etiquetas: posición en pantalla
    if (estado.etiquetas) {
      const w = root.clientWidth, h = root.clientHeight;
      etiquetasEl.forEach((x) => {
        const v = x.centro.clone().project(camera);
        const ok = v.z < 1;
        x.el.hidden = !ok;
        x.el.style.transform = `translate(${(v.x * 0.5 + 0.5) * w}px, ${(-v.y * 0.5 + 0.5) * h}px)`;
      });
    }
  }
  flujoPart.forEach((f) => {
    for (let i = 0; i < f.datos.length; i++) {
      const d = f.datos[i];
      d.y -= dt * d.v * flujoVel * tamano * 0.6;
      if (d.y < -tamano * 0.8) d.y = tamano * 0.4 * Math.random();
      f.pos[i * 3] = d.base.x + Math.cos(d.ang + d.y * 3) * d.rad;
      f.pos[i * 3 + 1] = d.base.y + d.y;
      f.pos[i * 3 + 2] = d.base.z + Math.sin(d.ang + d.y * 3) * d.rad;
    }
    f.geo.attributes.position.needsUpdate = true;
  });
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// ---------- arranque ----------
$('#carga-reintento').addEventListener('click', () => { $('#carga-reintento').hidden = true; cargarModelo(); });
cargarModelo();
window.__tec = { estado, mostrarPaso, PASOS, get modelo() { return modelo; }, camera, controls };
