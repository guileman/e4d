// Visor interactivo del Rover 1 (Tarot 650). Se empaqueta con esbuild en assets/tecnologia/visor.js
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { R, PASOS, ETIQUETAS, FISICA, FICHAS } from './datos.js';

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
let modelo = null, tamano = 1, centro = new THREE.Vector3(), sueloY = 0;
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
    sueloY = caja.min.y;
    caja.getCenter(centro);
    tamano = caja.getSize(new THREE.Vector3()).length();
    // Piezas de primer nivel con nombre (para despiece, foco y etiquetas)
    modelo.children.forEach((n) => {
      const c = new THREE.Box3().setFromObject(n).getCenter(new THREE.Vector3());
      piezas.push({ nodo: n, nombre: n.name || 'Pieza', centro: c, base: n.position.clone() });
    });
    // Cada pieza con su propio material: el GLB comparte materiales entre piezas y eso resaltaba piezas de más
    modelo.traverse((o) => { if (o.isMesh) o.material = Array.isArray(o.material) ? o.material.map((m) => m.clone()) : o.material.clone(); });
    recorrerMateriales(modelo, (m) => { m.userData.opacidadBase = m.opacity ?? 1; m.userData.transparenteBase = m.transparent; m.userData.color = m.color.clone(); });
    controls.target.copy(centro);
    camaraA({ dir: [0.6, 0.5, 0.9], dist: 1.25 }, centro, true);
    crearEtiquetas();
    crearFlujo();
    crearRTK();
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
  const plano = nombre.replace(/_/g, ' '); // el GLB cambia los espacios por guiones bajos
  return reglas.some((r) => new RegExp(r, 'i').test(plano));
}

const GRIS = new THREE.Color(0xa3aab3);
function aplicarFoco(reglas) {
  if (!modelo) return;
  const hay = !!(reglas && reglas.length);
  piezas.forEach((p) => {
    const res = hay && coincide(p.nombre, reglas);   // pieza del paso: color original
    const fuera = hay && !res;                          // resto del modelo: fantasma
    p.nodo.traverse((o) => {
      if (!o.isMesh) return;
      (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => {
        m.color.copy(res ? m.userData.color : GRIS);
        m.transparent = fuera || m.userData.transparenteBase;
        m.opacity = fuera ? 0.12 : (m.userData.opacidadBase ?? 1);
        m.depthWrite = !fuera;
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
  RTK.grupo.visible = !!p.rtk;
  if (RTK.pinEt) RTK.pinEt.visible = !!p.pin;
  RTK.activos = new Set(p.enlaces || []);
  Object.entries(RTK.enlaces).forEach(([k, e]) => { e.obj.visible = RTK.activos.has(k); });
  if (modelo) {
    aplicarFoco(p.foco);
    const objetivo = p.objetivo ? puntoRTK(p.objetivo) : (p.foco ? centroDe(p.foco) : centro);
    camaraA(p.camara, objetivo);
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
  animarRTK(reloj.elapsedTime);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);


// ---------- modo RTK: base, celular, ondas de radio y cables ----------
const RTK = { grupo: new THREE.Group(), enlaces: {}, pts: {}, activos: new Set() };
scene.add(RTK.grupo);
RTK.grupo.visible = false;

function puntoRTK(k) {
  if (RTK.pts[k]) return RTK.pts[k].clone().add(new THREE.Vector3(0, k === 'base' || k === 'celular' ? tamano * 0.3 : 0, 0));
  return centroDe(k === 'cuav' ? R.cuav : k === 'rtk' ? R.rtk : R.camara);
}
function etiquetaRTK(texto, pos) {
  const c = document.createElement('canvas'); c.width = 384; c.height = 96;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(14,15,17,.85)'; g.beginPath(); g.roundRect(4, 4, 376, 88, 44); g.fill();
  g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 3; g.stroke();
  g.fillStyle = '#eef'; g.font = '600 40px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(texto, 192, 50);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }));
  sp.position.copy(pos);
  sp.scale.set(tamano * 0.3, tamano * 0.075, 1);
  return sp;
}
const MAT_ONDA = () => new THREE.MeshBasicMaterial({ color: 0x7fe0ff, transparent: true, opacity: 1, side: THREE.DoubleSide, depthWrite: false });
const MAT_CABLE = new THREE.MeshStandardMaterial({ color: 0xffa040, emissive: 0xff7a00, emissiveIntensity: 0.7, roughness: 0.4 });

function crearRTK() {
  const cuav = centroDe(R.cuav), rtk = centroDe(R.rtk), cam = centroDe(R.camara);
  const base = new THREE.Vector3(centro.x - tamano * 0.95, sueloY, centro.z + tamano * 0.75);
  const cel = new THREE.Vector3(centro.x + tamano * 0.95, sueloY, centro.z + tamano * 0.4);
  RTK.pts = { base, celular: cel, cuav, rtk, camara: cam };

  // Base RTK: mástil con antena
  const mast = new THREE.Group();
  const tubo = new THREE.Mesh(new THREE.CylinderGeometry(tamano * 0.02, tamano * 0.03, tamano * 0.5, 16), new THREE.MeshStandardMaterial({ color: 0x9aa3ad }));
  tubo.position.y = tamano * 0.25;
  const ant = new THREE.Mesh(new THREE.CylinderGeometry(tamano * 0.05, tamano * 0.05, tamano * 0.08, 24), new THREE.MeshStandardMaterial({ color: 0x2b6cb0 }));
  ant.position.y = tamano * 0.54;
  mast.add(tubo, ant); mast.position.copy(base);
  RTK.grupo.add(mast, etiquetaRTK('Base RTK', base.clone().add(new THREE.Vector3(0, tamano * 0.75, 0))));

  // Celular con la app de control de tierra
  const celG = new THREE.Group();
  const cuerpo = new THREE.Mesh(new THREE.BoxGeometry(tamano * 0.12, tamano * 0.22, tamano * 0.02), new THREE.MeshStandardMaterial({ color: 0x222831, roughness: 0.3 }));
  const pantalla = new THREE.Mesh(new THREE.PlaneGeometry(tamano * 0.1, tamano * 0.18), new THREE.MeshBasicMaterial({ color: 0x3fbf84 }));
  pantalla.position.z = tamano * 0.0115;
  celG.add(cuerpo, pantalla); celG.position.copy(cel).add(new THREE.Vector3(0, tamano * 0.13, 0));
  RTK.grupo.add(celG, etiquetaRTK('Celular · app', cel.clone().add(new THREE.Vector3(0, tamano * 0.42, 0))));

  // Punto de la foto (en el suelo, debajo del dron)
  const pin = new THREE.Mesh(new THREE.RingGeometry(tamano * 0.04, tamano * 0.05, 32), new THREE.MeshBasicMaterial({ color: 0xffd166, side: THREE.DoubleSide }));
  pin.rotation.x = -Math.PI / 2; pin.position.set(centro.x, sueloY + tamano * 0.002, centro.z);
  RTK.pinEt = etiquetaRTK('Punto de la foto', new THREE.Vector3(centro.x, sueloY + tamano * 0.22, centro.z));
  RTK.grupo.add(pin, RTK.pinEt);
  RTK.pinFoto = pin;

  // Enlaces
  const defs = {
    'base-celular': { de: base.clone().add(new THREE.Vector3(0, tamano * 0.5, 0)), a: cel.clone().add(new THREE.Vector3(0, tamano * 0.2, 0)), medio: 'radio' },
    'celular-cuav': { de: cel.clone().add(new THREE.Vector3(0, tamano * 0.2, 0)), a: cuav.clone().add(new THREE.Vector3(0, tamano * 0.1, 0)), medio: 'radio' },
    'cuav-rtk': { de: cuav.clone(), a: rtk.clone(), medio: 'cable' },
    'cuav-camara': { de: cuav.clone(), a: cam.clone(), medio: 'cable' },
  };
  Object.entries(defs).forEach(([k, d]) => {
    const obj = new THREE.Group();
    obj.visible = false;
    if (d.medio === 'radio') {
      const anillos = [];
      for (let i = 0; i < 5; i++) {
        const m = new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 28, 1, -Math.PI * 0.35, Math.PI * 0.7), MAT_ONDA());
        obj.add(m); anillos.push(m);
      }
      RTK.enlaces[k] = { obj, tipo: 'radio', de: d.de, a: d.a, anillos };
    } else {
      const mid1 = d.de.clone().lerp(d.a, 0.33).add(new THREE.Vector3(0, tamano * 0.02, 0));
      const mid2 = d.de.clone().lerp(d.a, 0.66).add(new THREE.Vector3(0, tamano * 0.02, 0));
      const curva = new THREE.CatmullRomCurve3([d.de, mid1, mid2, d.a]);
      const tubo = new THREE.Mesh(new THREE.TubeGeometry(curva, 48, tamano * 0.0022, 8, false), MAT_CABLE);
      const pulso = new THREE.Mesh(new THREE.SphereGeometry(tamano * 0.004, 12, 12), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      obj.add(tubo, pulso);
      RTK.enlaces[k] = { obj, tipo: 'cable', curva, pulso };
    }
    RTK.grupo.add(obj);
  });
}

function animarRTK(t) {
  if (!RTK.grupo.visible) return;
  Object.entries(RTK.enlaces).forEach(([k, e]) => {
    if (!RTK.activos.has(k)) return;
    if (e.tipo === 'radio') {
      e.anillos.forEach((m, i) => {
        const f = (i / e.anillos.length + t * 0.35) % 1;
        m.position.lerpVectors(e.de, e.a, f);
        m.lookAt(e.a);
        m.scale.setScalar(tamano * (0.03 + 0.1 * f));
        m.material.opacity = Math.pow(1 - f, 0.6);
      });
    } else {
      e.pulso.position.copy(e.curva.getPointAt((t * 0.4) % 1));
    }
  });
  if (RTK.pinFoto) RTK.pinFoto.scale.setScalar(1 + 0.15 * Math.sin(t * 3));
}

// ---------- arranque ----------
$('#carga-reintento').addEventListener('click', () => { $('#carga-reintento').hidden = true; cargarModelo(); });
cargarModelo();
window.__tec = { estado, mostrarPaso, PASOS, get modelo() { return modelo; }, camera, controls };
