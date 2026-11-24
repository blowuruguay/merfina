/* ============================================================
   MERFINA · Panel SPA
   ============================================================ */
const TOKEN_KEY = 'merfina_token';
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));

const estado = {
  token: localStorage.getItem(TOKEN_KEY) || null,
  usuario: null,
  vista: 'resumen',
  cache: {}
};

const ESTADOS_PEDIDO = {
  consulta:   { txt: 'Consulta',    cls: 'badge' },
  confirmado: { txt: 'Confirmado',  cls: 'badge badge-gold' },
  pagado:     { txt: 'Pagado',      cls: 'badge badge-ok' },
  enviado:    { txt: 'Enviado',     cls: 'badge badge-ok' },
  entregado:  { txt: 'Entregado',   cls: 'badge badge-ok' },
  cancelado:  { txt: 'Cancelado',   cls: 'badge badge-err' }
};

// ============================================================
// API
// ============================================================
async function api(url, opts = {}) {
  const r = await fetch(url, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(estado.token ? { Authorization: `Bearer ${estado.token}` } : {}),
      ...(opts.headers || {})
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined
  });

  // Renovación automática del token
  const nuevo = r.headers.get('X-Token-Nuevo');
  if (nuevo) {
    estado.token = nuevo;
    localStorage.setItem(TOKEN_KEY, nuevo);
  }

  if (r.status === 401) {
    const data = await r.json().catch(() => ({}));
    if (data.expirado || url.includes('/auth/yo')) {
      logout();
      throw new Error(data.error || 'Sesión expirada');
    }
    throw new Error(data.error || 'No autorizado');
  }
  if (r.status === 204) return null;
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || `Error ${r.status}`);
  return data;
}

// ============================================================
// UI helpers
// ============================================================
function toast(msg, tipo = '') {
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'toast ' + tipo;
  t.classList.remove('hidden');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.add('hidden'), 2800);
}

function modal(html, ancho = false) {
  $('#modal-contenido').innerHTML = html;
  $('.modal-box').classList.toggle('ancho', !!ancho);
  $('#modal').classList.remove('hidden');
}
function cerrarModal() { $('#modal').classList.add('hidden'); }
$('#modal').addEventListener('click', e => {
  if (e.target.matches('[data-cerrar]')) cerrarModal();
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') cerrarModal();
});

function precio(n) {
  if (n == null) return '—';
  return '$ ' + Number(n).toLocaleString('es-UY');
}
function fecha(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('es-UY', { day: '2-digit', month: 'short', year: 'numeric' });
}
function esc(s) {
  return String(s ?? '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;');
}

function leerArchivo(file) {
  return new Promise((ok, err) => {
    const fr = new FileReader();
    fr.onload = () => ok(fr.result);
    fr.onerror = () => err(new Error('No pudimos leer el archivo'));
    fr.readAsDataURL(file);
  });
}

// ============================================================
// Login / logout
// ============================================================
async function entrarConToken() {
  try {
    const { usuario } = await api('/api/auth/yo');
    estado.usuario = usuario;
    mostrarApp();
  } catch (err) {
    mostrarLogin();
  }
}

function mostrarLogin() {
  $('#login').classList.remove('hidden');
  $('#app').classList.add('hidden');
}
function mostrarApp() {
  $('#login').classList.add('hidden');
  $('#app').classList.remove('hidden');
  $('#user-nombre').textContent = estado.usuario.nombre || 'Sin nombre';
  $('#user-email').textContent  = estado.usuario.email;
  cargarVista();
}
function logout() {
  localStorage.removeItem(TOKEN_KEY);
  estado.token = null;
  estado.usuario = null;
  mostrarLogin();
}

$('#login-form').addEventListener('submit', async e => {
  e.preventDefault();
  const email    = e.target.email.value.trim();
  const password = e.target.password.value;
  $('#login-err').textContent = '';
  try {
    const r = await api('/api/auth/login', { method: 'POST', body: { email, password } });
    estado.token = r.token;
    estado.usuario = r.usuario;
    localStorage.setItem(TOKEN_KEY, r.token);
    mostrarApp();
  } catch (err) {
    $('#login-err').textContent = err.message;
  }
});

$('#logout').addEventListener('click', logout);

// ============================================================
// Router
// ============================================================
$$('.side-nav a').forEach(a => {
  a.addEventListener('click', e => {
    e.preventDefault();
    const v = a.dataset.vista;
    location.hash = v;
    cambiarVista(v);
  });
});
window.addEventListener('hashchange', () => {
  const v = (location.hash || '#resumen').slice(1);
  cambiarVista(v);
});

function cambiarVista(v) {
  estado.vista = v;
  $$('.side-nav a').forEach(a => a.classList.toggle('active', a.dataset.vista === v));
  cargarVista();
}

function cargarVista() {
  const v = estado.vista;
  $('#acciones').innerHTML = '';
  const titulos = {
    resumen: 'Resumen', productos: 'Productos', pedidos: 'Pedidos',
    contactos: 'Consultas', newsletter: 'Newsletter', categorias: 'Categorías',
    ajustes: 'Ajustes', cuenta: 'Mi cuenta'
  };
  $('#titulo').textContent = titulos[v] || 'Panel';
  $('#contenido').innerHTML = '<div class="empty">Cargando…</div>';

  const vistas = {
    resumen: vistaResumen, productos: vistaProductos, pedidos: vistaPedidos,
    contactos: vistaContactos, newsletter: vistaNewsletter,
    categorias: vistaCategorias, ajustes: vistaAjustes, cuenta: vistaCuenta
  };
  (vistas[v] || vistaResumen)();
}

// ============================================================
// VISTA · Resumen
// ============================================================
async function vistaResumen() {
  try {
    const d = await api('/api/admin/resumen');
    const bajo = d.stock_bajo.length
      ? d.stock_bajo.map(p => `
          <tr><td class="nombre">${esc(p.nombre)}</td>
          <td><span class="badge ${p.stock === 0 ? 'badge-err' : 'badge-warn'}">${p.stock} unid.</span></td>
          <td><a href="#productos" data-prod="${p.id}" class="btn btn-ghost btn-sm">Reponer</a></td></tr>`).join('')
      : `<tr><td colspan="3" class="empty" style="padding:20px">Todo bien con el stock</td></tr>`;

    $('#contenido').innerHTML = `
      <div class="stats-grid">
        <div class="stat"><div class="stat-label">Productos activos</div><div class="stat-value">${d.productos}</div></div>
        <div class="stat"><div class="stat-label">Pedidos abiertos</div><div class="stat-value">${d.pedidos_abiertos}</div></div>
        <div class="stat"><div class="stat-label">Consultas sin leer</div><div class="stat-value">${d.contactos_sin_leer}</div></div>
        <div class="stat"><div class="stat-label">Suscriptos</div><div class="stat-value">${d.newsletter}</div></div>
      </div>
      <div class="card">
        <h2 style="font-family:var(--serif);font-weight:400;font-size:22px;margin:0 0 16px">Stock bajo</h2>
        <table class="data"><thead><tr>
          <th>Producto</th><th>Stock</th><th></th>
        </tr></thead><tbody>${bajo}</tbody></table>
      </div>`;
  } catch (err) {
    $('#contenido').innerHTML = `<div class="empty">${esc(err.message)}</div>`;
  }
}

// ============================================================
// VISTA · Productos
// ============================================================
async function vistaProductos() {
  $('#acciones').innerHTML = `<button class="btn btn-primary" id="nuevo-prod">+ Nuevo producto</button>`;
  $('#nuevo-prod').onclick = () => editarProducto();

  try {
    const [{ productos }, { categorias }] = await Promise.all([
      api('/api/admin/productos'),
      api('/api/admin/categorias')
    ]);
    estado.cache.categorias = categorias;

    if (!productos.length) {
      $('#contenido').innerHTML = `<div class="empty">Todavía no cargaste productos</div>`;
      return;
    }

    const filas = productos.map(p => {
      const cat = categorias.find(c => c.id === p.categoria_id);
      return `<tr>
        <td><img class="thumb" src="${esc(p.portada || '/img/placeholder.png')}" onerror="this.style.background='var(--panel)'"></td>
        <td>
          <div class="nombre">${esc(p.nombre)}</div>
          <div style="color:var(--mute);font-size:12px">${esc(p.slug)}</div>
        </td>
        <td>${esc(cat?.nombre || '—')}</td>
        <td>${precio(p.precio)}</td>
        <td><span class="badge ${p.stock === 0 ? 'badge-err' : p.stock <= 2 ? 'badge-warn' : 'badge-ok'}">${p.stock}</span></td>
        <td>${p.destacado ? '<span class="badge badge-gold">Destacado</span>' : ''} ${!p.activo ? '<span class="badge badge-err">Oculto</span>' : ''}</td>
        <td style="text-align:right">
          <button class="btn btn-ghost btn-sm" data-edit="${p.id}">Editar</button>
        </td>
      </tr>`;
    }).join('');

    $('#contenido').innerHTML = `
      <table class="data"><thead><tr>
        <th></th><th>Producto</th><th>Categoría</th><th>Precio</th><th>Stock</th><th></th><th></th>
      </tr></thead><tbody>${filas}</tbody></table>`;

    $$('[data-edit]').forEach(b => b.onclick = () => editarProducto(b.dataset.edit));
  } catch (err) {
    $('#contenido').innerHTML = `<div class="empty">${esc(err.message)}</div>`;
  }
}

async function editarProducto(id) {
  const cats = estado.cache.categorias || (await api('/api/admin/categorias')).categorias;
  let p = { nombre: '', slug: '', precio: 0, stock: 1, activo: true, destacado: false, imagenes: [] };
  if (id) {
    const r = await api(`/api/admin/productos/${id}`);
    p = r.producto;
    estado.cache.productoSlug = p.slug;
  }

  const opcionesCat = cats.map(c =>
    `<option value="${c.id}" ${p.categoria_id === c.id ? 'selected' : ''}>${esc(c.nombre)}</option>`).join('');

  const imagenes = (p.imagenes || []).map(i => `
    <div class="im">
      <img src="${esc(i.url)}">
      <button class="x" data-del-img="${i.id}" type="button">×</button>
    </div>`).join('');

  modal(`
    <h2>${id ? 'Editar producto' : 'Nuevo producto'}</h2>
    <form class="form" id="form-prod">
      <div class="row">
        <div>
          <label>Nombre</label>
          <input type="text" name="nombre" value="${esc(p.nombre)}" required>
        </div>
        <div>
          <label>Slug (URL)</label>
          <input type="text" name="slug" value="${esc(p.slug)}" placeholder="se genera del nombre">
        </div>
      </div>
      <div class="row-3">
        <div>
          <label>Precio ($)</label>
          <input type="number" name="precio" value="${p.precio || ''}" required>
        </div>
        <div>
          <label>Precio antes (oferta)</label>
          <input type="number" name="precio_antes" value="${p.precio_antes || ''}">
        </div>
        <div>
          <label>Stock</label>
          <input type="number" name="stock" value="${p.stock ?? 1}" required>
        </div>
      </div>
      <label>Categoría</label>
      <select name="categoria_id">
        <option value="">— Sin categoría —</option>
        ${opcionesCat}
      </select>
      <label>Descripción</label>
      <textarea name="descripcion">${esc(p.descripcion)}</textarea>
      <div class="row">
        <div>
          <label>Materiales</label>
          <input type="text" name="materiales" value="${esc(p.materiales)}" placeholder="latón, esmalte, baño de oro">
        </div>
        <div>
          <label>Medidas</label>
          <input type="text" name="medidas" value="${esc(p.medidas)}" placeholder="2.5 cm">
        </div>
      </div>
      <label class="check">
        <input type="checkbox" name="destacado" ${p.destacado ? 'checked' : ''}>
        <span>Destacado en la portada</span>
      </label>
      <label class="check">
        <input type="checkbox" name="activo" ${p.activo ? 'checked' : ''}>
        <span>Visible en la tienda</span>
      </label>

      ${id ? `
        <label style="margin-top:28px">Imágenes</label>
        <div class="img-grid" id="imagenes">${imagenes}</div>
        <div class="upload-box">
          <input type="file" id="nueva-img-file" accept="image/jpeg,image/png,image/webp,image/avif" style="display:none">
          <button type="button" class="btn btn-ghost btn-sm" id="btn-subir-img">+ Subir foto</button>
          <span id="upload-status" style="color:var(--mute);font-size:12px;margin-left:10px"></span>
        </div>
        <details style="margin-top:14px">
          <summary style="cursor:pointer;color:var(--mute);font-size:12px">Pegar URL manual</summary>
          <div style="display:flex;gap:8px;margin-top:10px">
            <input type="url" id="nueva-img-url" placeholder="https://..." style="flex:1">
            <button type="button" class="btn btn-ghost btn-sm" id="agregar-img-url">Agregar</button>
          </div>
          <small style="color:var(--mute);display:block;margin-top:6px">
            Útil si ya subiste la imagen a otro lado.
          </small>
        </details>
      ` : ''}

      <div class="actions">
        ${id ? `<button type="button" class="btn btn-danger" id="borrar-prod">Borrar</button>` : ''}
        <button type="button" class="btn btn-ghost" data-cerrar>Cancelar</button>
        <button type="submit" class="btn btn-primary">Guardar</button>
      </div>
    </form>
  `, true);

  $('#form-prod').onsubmit = async e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const datos = {
      nombre:        fd.get('nombre'),
      slug:          fd.get('slug') || null,
      precio:        Number(fd.get('precio')),
      precio_antes:  fd.get('precio_antes') ? Number(fd.get('precio_antes')) : null,
      stock:         Number(fd.get('stock')),
      categoria_id:  fd.get('categoria_id') || null,
      descripcion:   fd.get('descripcion'),
      materiales:    fd.get('materiales'),
      medidas:       fd.get('medidas'),
      destacado:     !!fd.get('destacado'),
      activo:        !!fd.get('activo')
    };
    try {
      if (id) await api(`/api/admin/productos/${id}`, { method: 'PUT',  body: datos });
      else    await api(`/api/admin/productos`,       { method: 'POST', body: datos });
      toast('Guardado', 'ok');
      cerrarModal();
      vistaProductos();
    } catch (err) { toast(err.message, 'err'); }
  };

  if (id) {
    $('#borrar-prod').onclick = async () => {
      if (!confirm('¿Borrar este producto? No se puede deshacer.')) return;
      try {
        await api(`/api/admin/productos/${id}`, { method: 'DELETE' });
        toast('Producto borrado', 'ok');
        cerrarModal();
        vistaProductos();
      } catch (err) { toast(err.message, 'err'); }
    };

    // Pegar URL manual
    $('#agregar-img-url').onclick = async () => {
      const url = $('#nueva-img-url').value.trim();
      if (!url) return;
      try {
        await api(`/api/admin/productos/${id}/imagenes`, {
          method: 'POST',
          body: { url, orden: ($$('#imagenes .im')).length }
        });
        editarProducto(id);
      } catch (err) { toast(err.message, 'err'); }
    };

    // Subida a R2
    $('#btn-subir-img').onclick = () => $('#nueva-img-file').click();
    $('#nueva-img-file').onchange = async e => {
      const file = e.target.files?.[0];
      if (!file) return;
      const status = $('#upload-status');
      status.textContent = 'Subiendo...';
      try {
        const datos = await leerArchivo(file);
        const prodSlug = estado.cache.productoSlug || 'producto';
        const { url } = await api('/api/admin/imagenes', {
          method: 'POST',
          body: {
            nombre: file.name,
            datos,
            carpeta: `productos/${prodSlug}`
          }
        });
        await api(`/api/admin/productos/${id}/imagenes`, {
          method: 'POST',
          body: { url, orden: ($$('#imagenes .im')).length }
        });
        status.textContent = '';
        toast('Imagen subida', 'ok');
        editarProducto(id);
      } catch (err) {
        status.textContent = '';
        toast(err.message, 'err');
      }
    };
    $$('[data-del-img]').forEach(b => {
      b.onclick = async () => {
        try {
          await api(`/api/admin/imagenes/${b.dataset.delImg}`, { method: 'DELETE' });
          editarProducto(id);
        } catch (err) { toast(err.message, 'err'); }
      };
    });
  }
}

// ============================================================
// VISTA · Pedidos
// ============================================================
async function vistaPedidos() {
  $('#acciones').innerHTML = `<button class="btn btn-primary" id="nuevo-pedido">+ Pedido manual</button>`;
  $('#nuevo-pedido').onclick = () => nuevoPedidoManual();

  let filtro = '';
  async function cargar() {
    try {
      const url = filtro ? `/api/admin/pedidos?estado=${filtro}` : '/api/admin/pedidos';
      const { pedidos } = await api(url);
      const filas = pedidos.length ? pedidos.map(p => {
        const est = ESTADOS_PEDIDO[p.estado] || ESTADOS_PEDIDO.consulta;
        return `<tr data-ped="${p.id}" style="cursor:pointer">
          <td><strong>#${p.numero}</strong></td>
          <td class="nombre">${esc(p.nombre)} ${esc(p.apellido || '')}</td>
          <td>${esc(p.email || p.telefono)}</td>
          <td>${precio(p.total)}</td>
          <td><span class="${est.cls}">${est.txt}</span></td>
          <td>${fecha(p.creado_en)}</td>
        </tr>`;
      }).join('') : `<tr><td colspan="6" class="empty" style="padding:30px">Sin pedidos</td></tr>`;

      $('#contenido').innerHTML = `
        <div class="pills">
          <button class="pill ${filtro === '' ? 'active' : ''}" data-f="">Todos</button>
          ${Object.entries(ESTADOS_PEDIDO).map(([k, v]) =>
            `<button class="pill ${filtro === k ? 'active' : ''}" data-f="${k}">${v.txt}</button>`).join('')}
        </div>
        <table class="data"><thead><tr>
          <th>Nº</th><th>Cliente</th><th>Contacto</th><th>Total</th><th>Estado</th><th>Fecha</th>
        </tr></thead><tbody>${filas}</tbody></table>`;

      $$('.pill').forEach(b => b.onclick = () => { filtro = b.dataset.f; cargar(); });
      $$('[data-ped]').forEach(tr => tr.onclick = () => verPedido(tr.dataset.ped));
    } catch (err) {
      $('#contenido').innerHTML = `<div class="empty">${esc(err.message)}</div>`;
    }
  }
  cargar();
}

async function verPedido(id) {
  try {
    const { pedido } = await api(`/api/admin/pedidos/${id}`);
    const items = pedido.items.map(it => `
      <tr>
        <td>${esc(it.nombre)}</td>
        <td>×${it.cantidad}</td>
        <td style="text-align:right">${precio(it.precio_unit * it.cantidad)}</td>
      </tr>`).join('');
    const estadosOpts = Object.entries(ESTADOS_PEDIDO).map(([k, v]) =>
      `<option value="${k}" ${pedido.estado === k ? 'selected' : ''}>${v.txt}</option>`).join('');

    modal(`
      <h2>Pedido #${pedido.numero}</h2>
      <div class="row" style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px">
        <div>
          <div style="color:var(--mute);font-size:11px;letter-spacing:.2em;text-transform:uppercase">Cliente</div>
          <div style="font-family:var(--serif);font-size:20px;color:var(--dark)">${esc(pedido.nombre)} ${esc(pedido.apellido || '')}</div>
          <div>${esc(pedido.email || '')}</div>
          <div>${esc(pedido.telefono)}</div>
          ${pedido.documento ? `<div>CI: ${esc(pedido.documento)}</div>` : ''}
        </div>
        <div>
          <div style="color:var(--mute);font-size:11px;letter-spacing:.2em;text-transform:uppercase">Envío</div>
          <div>${esc(pedido.envio_tipo || '—')}</div>
          ${pedido.direccion ? `<div style="font-size:12px;color:var(--text-soft);margin-top:6px">${esc(JSON.stringify(pedido.direccion))}</div>` : ''}
          ${pedido.nota ? `<div style="margin-top:8px;font-style:italic">${esc(pedido.nota)}</div>` : ''}
        </div>
      </div>

      <table class="data"><tbody>
        ${items}
        <tr><td colspan="2" style="text-align:right">Subtotal</td><td style="text-align:right">${precio(pedido.subtotal)}</td></tr>
        <tr><td colspan="2" style="text-align:right">Envío</td><td style="text-align:right">${precio(pedido.envio_costo)}</td></tr>
        <tr><td colspan="2" style="text-align:right"><strong>Total</strong></td><td style="text-align:right"><strong>${precio(pedido.total)}</strong></td></tr>
      </tbody></table>

      <form class="form" id="form-pedido">
        <div class="row">
          <div>
            <label>Estado</label>
            <select name="estado">${estadosOpts}</select>
          </div>
          <div>
            <label>Canal</label>
            <input type="text" value="${esc(pedido.canal)}" disabled>
          </div>
        </div>
        <label>Notas internas</label>
        <textarea name="notas_internas">${esc(pedido.notas_internas)}</textarea>

        <div class="actions">
          <button type="button" class="btn btn-danger" id="borrar-ped">Borrar</button>
          <button type="button" class="btn btn-ghost" data-cerrar>Cerrar</button>
          <button type="submit" class="btn btn-primary">Guardar</button>
        </div>
      </form>
    `, true);

    $('#form-pedido').onsubmit = async e => {
      e.preventDefault();
      const fd = new FormData(e.target);
      try {
        await api(`/api/admin/pedidos/${id}`, {
          method: 'PUT',
          body: { estado: fd.get('estado'), notas_internas: fd.get('notas_internas') }
        });
        toast('Pedido actualizado', 'ok');
        cerrarModal();
        vistaPedidos();
      } catch (err) { toast(err.message, 'err'); }
    };

    $('#borrar-ped').onclick = async () => {
      if (!confirm('¿Borrar este pedido? No se puede deshacer.')) return;
      await api(`/api/admin/pedidos/${id}`, { method: 'DELETE' });
      toast('Pedido borrado', 'ok');
      cerrarModal();
      vistaPedidos();
    };
  } catch (err) { toast(err.message, 'err'); }
}

async function nuevoPedidoManual() {
  modal(`
    <h2>Pedido manual</h2>
    <p style="color:var(--text-soft);margin:0 0 20px">Por WhatsApp, Instagram o presencial.</p>
    <form class="form" id="form-ped-m">
      <div class="row">
        <div>
          <label>Nombre</label>
          <input type="text" name="nombre" required>
        </div>
        <div>
          <label>Apellido</label>
          <input type="text" name="apellido">
        </div>
      </div>
      <div class="row">
        <div>
          <label>Teléfono</label>
          <input type="text" name="telefono" required>
        </div>
        <div>
          <label>Email</label>
          <input type="email" name="email">
        </div>
      </div>
      <label>Producto / descripción</label>
      <input type="text" name="producto_nombre" placeholder="Cubre botones camelias azules" required>
      <div class="row-3">
        <div>
          <label>Precio unitario</label>
          <input type="number" name="precio_unit" required>
        </div>
        <div>
          <label>Cantidad</label>
          <input type="number" name="cantidad" value="1" required>
        </div>
        <div>
          <label>Costo envío</label>
          <input type="number" name="envio_costo" value="0">
        </div>
      </div>
      <label>Canal</label>
      <select name="canal">
        <option value="whatsapp">WhatsApp</option>
        <option value="instagram">Instagram</option>
        <option value="presencial">Presencial</option>
        <option value="otro">Otro</option>
      </select>
      <label>Notas</label>
      <textarea name="notas_internas"></textarea>
      <div class="actions">
        <button type="button" class="btn btn-ghost" data-cerrar>Cancelar</button>
        <button type="submit" class="btn btn-primary">Crear pedido</button>
      </div>
    </form>
  `);

  $('#form-ped-m').onsubmit = async e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      await api(`/api/admin/pedidos`, {
        method: 'POST',
        body: {
          nombre: fd.get('nombre'), apellido: fd.get('apellido'),
          telefono: fd.get('telefono'), email: fd.get('email'),
          canal: fd.get('canal'), notas_internas: fd.get('notas_internas'),
          envio_costo: Number(fd.get('envio_costo') || 0),
          estado: 'confirmado',
          items: [{
            nombre: fd.get('producto_nombre'),
            precio_unit: Number(fd.get('precio_unit')),
            cantidad: Number(fd.get('cantidad'))
          }]
        }
      });
      toast('Pedido creado', 'ok');
      cerrarModal();
      vistaPedidos();
    } catch (err) { toast(err.message, 'err'); }
  };
}

// ============================================================
// VISTA · Contactos
// ============================================================
async function vistaContactos() {
  try {
    const { contactos } = await api('/api/admin/contactos');
    if (!contactos.length) {
      $('#contenido').innerHTML = `<div class="empty">Sin consultas</div>`;
      return;
    }
    const filas = contactos.map(c => `
      <tr data-ctt="${c.id}" style="cursor:pointer">
        <td>${c.leido ? '' : '<span class="badge badge-gold">Nuevo</span>'}</td>
        <td class="nombre">${esc(c.nombre)}</td>
        <td>${esc(c.email)}</td>
        <td style="color:var(--text-soft);max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(c.mensaje)}</td>
        <td>${fecha(c.creado_en)}</td>
      </tr>`).join('');

    $('#contenido').innerHTML = `
      <table class="data"><thead><tr>
        <th></th><th>Nombre</th><th>Correo</th><th>Mensaje</th><th>Fecha</th>
      </tr></thead><tbody>${filas}</tbody></table>`;

    $$('[data-ctt]').forEach(tr => tr.onclick = () => verContacto(tr.dataset.ctt, contactos.find(c => c.id === tr.dataset.ctt)));
  } catch (err) {
    $('#contenido').innerHTML = `<div class="empty">${esc(err.message)}</div>`;
  }
}

async function verContacto(id, c) {
  modal(`
    <h2>Consulta de ${esc(c.nombre)}</h2>
    <div style="display:grid;gap:10px;margin-bottom:20px">
      <div><strong>Correo:</strong> <a href="mailto:${esc(c.email)}">${esc(c.email)}</a></div>
      ${c.telefono ? `<div><strong>Teléfono:</strong> ${esc(c.telefono)}</div>` : ''}
      ${c.asunto ? `<div><strong>Asunto:</strong> ${esc(c.asunto)}</div>` : ''}
      <div style="color:var(--text-soft)">${fecha(c.creado_en)}</div>
    </div>
    <div style="background:var(--panel);padding:20px;border-radius:2px;white-space:pre-wrap;font-family:var(--serif);font-size:16px;line-height:1.6">${esc(c.mensaje)}</div>
    <div class="actions">
      <button type="button" class="btn btn-danger" id="borrar-ctt">Borrar</button>
      <button type="button" class="btn btn-ghost" data-cerrar>Cerrar</button>
      ${c.leido ? '' : '<button type="button" class="btn btn-primary" id="marcar-leido">Marcar leído</button>'}
    </div>
  `);

  if (!c.leido) {
    $('#marcar-leido').onclick = async () => {
      await api(`/api/admin/contactos/${id}`, { method: 'PUT', body: { leido: true } });
      cerrarModal(); vistaContactos();
    };
  }
  $('#borrar-ctt').onclick = async () => {
    if (!confirm('¿Borrar esta consulta?')) return;
    await api(`/api/admin/contactos/${id}`, { method: 'DELETE' });
    cerrarModal(); vistaContactos();
  };
}

// ============================================================
// VISTA · Newsletter
// ============================================================
async function vistaNewsletter() {
  $('#acciones').innerHTML = `<a href="/api/admin/newsletter.csv" class="btn btn-ghost">Descargar CSV</a>`;
  try {
    const { suscriptos } = await api('/api/admin/newsletter');
    if (!suscriptos.length) {
      $('#contenido').innerHTML = `<div class="empty">Sin suscriptos aún</div>`;
      return;
    }
    const filas = suscriptos.map(s => `
      <tr>
        <td>${esc(s.email)}</td>
        <td><span class="badge ${s.activo ? 'badge-ok' : 'badge-err'}">${s.activo ? 'Activo' : 'Baja'}</span></td>
        <td>${esc(s.origen || '')}</td>
        <td>${fecha(s.creado_en)}</td>
        <td style="text-align:right"><button class="btn btn-ghost btn-sm" data-del-nws="${s.id}">Borrar</button></td>
      </tr>`).join('');
    $('#contenido').innerHTML = `
      <table class="data"><thead><tr>
        <th>Correo</th><th>Estado</th><th>Origen</th><th>Alta</th><th></th>
      </tr></thead><tbody>${filas}</tbody></table>`;
    $$('[data-del-nws]').forEach(b => b.onclick = async () => {
      if (!confirm('¿Borrar este suscripto?')) return;
      await api(`/api/admin/newsletter/${b.dataset.delNws}`, { method: 'DELETE' });
      vistaNewsletter();
    });
  } catch (err) {
    $('#contenido').innerHTML = `<div class="empty">${esc(err.message)}</div>`;
  }
}

// ============================================================
// VISTA · Categorías
// ============================================================
async function vistaCategorias() {
  $('#acciones').innerHTML = `<button class="btn btn-primary" id="nueva-cat">+ Nueva categoría</button>`;
  $('#nueva-cat').onclick = () => editarCategoria();

  try {
    const { categorias } = await api('/api/admin/categorias');
    if (!categorias.length) {
      $('#contenido').innerHTML = `<div class="empty">Sin categorías</div>`;
      return;
    }
    const filas = categorias.map(c => `
      <tr>
        <td class="nombre">${esc(c.nombre)}</td>
        <td style="color:var(--mute);font-size:12px">${esc(c.id)}</td>
        <td>${c.productos}</td>
        <td>${c.orden}</td>
        <td><span class="badge ${c.activa ? 'badge-ok' : 'badge-err'}">${c.activa ? 'Activa' : 'Oculta'}</span></td>
        <td style="text-align:right"><button class="btn btn-ghost btn-sm" data-edit-cat="${c.id}">Editar</button></td>
      </tr>`).join('');
    $('#contenido').innerHTML = `
      <table class="data"><thead><tr>
        <th>Nombre</th><th>ID</th><th>Productos</th><th>Orden</th><th>Estado</th><th></th>
      </tr></thead><tbody>${filas}</tbody></table>`;
    $$('[data-edit-cat]').forEach(b => b.onclick = () => editarCategoria(b.dataset.editCat, categorias.find(c => c.id === b.dataset.editCat)));
  } catch (err) {
    $('#contenido').innerHTML = `<div class="empty">${esc(err.message)}</div>`;
  }
}

async function editarCategoria(id, c) {
  c = c || { id: '', nombre: '', descripcion: '', orden: 0, activa: true };
  modal(`
    <h2>${id ? 'Editar categoría' : 'Nueva categoría'}</h2>
    <form class="form" id="form-cat">
      <div class="row">
        <div>
          <label>ID (slug)</label>
          <input type="text" name="id" value="${esc(c.id)}" ${id ? 'readonly' : 'required'}>
        </div>
        <div>
          <label>Nombre</label>
          <input type="text" name="nombre" value="${esc(c.nombre)}" required>
        </div>
      </div>
      <label>Descripción</label>
      <textarea name="descripcion">${esc(c.descripcion)}</textarea>
      <div class="row">
        <div>
          <label>Imagen (URL)</label>
          <input type="url" name="imagen" value="${esc(c.imagen)}">
        </div>
        <div>
          <label>Orden</label>
          <input type="number" name="orden" value="${c.orden}">
        </div>
      </div>
      <label class="check">
        <input type="checkbox" name="activa" ${c.activa ? 'checked' : ''}>
        <span>Visible en la tienda</span>
      </label>
      <div class="actions">
        ${id ? `<button type="button" class="btn btn-danger" id="borrar-cat">Borrar</button>` : ''}
        <button type="button" class="btn btn-ghost" data-cerrar>Cancelar</button>
        <button type="submit" class="btn btn-primary">Guardar</button>
      </div>
    </form>
  `);

  $('#form-cat').onsubmit = async e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const datos = {
      id: fd.get('id'),
      nombre: fd.get('nombre'),
      descripcion: fd.get('descripcion'),
      imagen: fd.get('imagen'),
      orden: Number(fd.get('orden') || 0),
      activa: !!fd.get('activa')
    };
    try {
      if (id) await api(`/api/admin/categorias/${id}`, { method: 'PUT', body: datos });
      else    await api(`/api/admin/categorias`,       { method: 'POST', body: datos });
      toast('Guardado', 'ok');
      cerrarModal();
      vistaCategorias();
    } catch (err) { toast(err.message, 'err'); }
  };
  if (id) $('#borrar-cat').onclick = async () => {
    if (!confirm('¿Borrar la categoría? Los productos quedarán sin categoría.')) return;
    await api(`/api/admin/categorias/${id}`, { method: 'DELETE' });
    cerrarModal(); vistaCategorias();
  };
}

// ============================================================
// VISTA · Ajustes
// ============================================================
async function vistaAjustes() {
  try {
    const { ajustes } = await api('/api/admin/ajustes');
    const campos = [
      ['whatsapp', 'WhatsApp (URL completa)'],
      ['telefono', 'Teléfono (visible)'],
      ['email', 'Correo de contacto'],
      ['instagram', 'Instagram (URL)'],
      ['envio_montevideo', 'Costo envío Montevideo'],
      ['envio_interior', 'Costo envío interior'],
      ['envio_gratis_desde', 'Envío gratis desde ($)']
    ];
    const campoHtml = campos.map(([k, l]) =>
      `<div><label>${l}</label><input type="text" name="${k}" value="${esc(ajustes[k] ?? '')}"></div>`).join('');

    $('#contenido').innerHTML = `
      <form class="form card" id="form-ajustes">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">${campoHtml}</div>
        <div class="actions"><button type="submit" class="btn btn-primary">Guardar</button></div>
      </form>`;

    $('#form-ajustes').onsubmit = async e => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const obj = {};
      campos.forEach(([k]) => { obj[k] = fd.get(k); });
      try {
        await api('/api/admin/ajustes', { method: 'PUT', body: { ajustes: obj } });
        toast('Ajustes guardados', 'ok');
      } catch (err) { toast(err.message, 'err'); }
    };
  } catch (err) {
    $('#contenido').innerHTML = `<div class="empty">${esc(err.message)}</div>`;
  }
}

// ============================================================
// VISTA · Mi cuenta
// ============================================================
async function vistaCuenta() {
  const u = estado.usuario;
  $('#contenido').innerHTML = `
    <div class="card">
      <h2 style="font-family:var(--serif);font-weight:400;font-size:22px;margin:0 0 20px">Mis datos</h2>
      <form class="form" id="form-nombre">
        <label>Nombre</label>
        <input type="text" name="nombre" value="${esc(u.nombre || '')}" required>
        <label>Correo</label>
        <input type="email" value="${esc(u.email)}" disabled>
        <div class="actions"><button type="submit" class="btn btn-primary">Guardar</button></div>
      </form>
    </div>
    <div class="card">
      <h2 style="font-family:var(--serif);font-weight:400;font-size:22px;margin:0 0 20px">Cambiar contraseña</h2>
      <form class="form" id="form-pass">
        <label>Contraseña actual</label>
        <input type="password" name="actual" required>
        <label>Contraseña nueva (mínimo 10 caracteres)</label>
        <input type="password" name="nueva" required minlength="10">
        <div class="actions"><button type="submit" class="btn btn-primary">Cambiar</button></div>
      </form>
    </div>`;

  $('#form-nombre').onsubmit = async e => {
    e.preventDefault();
    try {
      const r = await api('/api/auth/mi-cuenta', { method: 'PUT',
        body: { nombre: e.target.nombre.value.trim() } });
      estado.usuario = r.usuario;
      $('#user-nombre').textContent = r.usuario.nombre;
      toast('Guardado', 'ok');
    } catch (err) { toast(err.message, 'err'); }
  };
  $('#form-pass').onsubmit = async e => {
    e.preventDefault();
    try {
      await api('/api/auth/contrasena', { method: 'PUT',
        body: { actual: e.target.actual.value, nueva: e.target.nueva.value } });
      toast('Contraseña actualizada', 'ok');
      e.target.reset();
    } catch (err) { toast(err.message, 'err'); }
  };
}

// ============================================================
// Inicio
// ============================================================
if (location.hash) estado.vista = location.hash.slice(1);
if (estado.token) entrarConToken();
else mostrarLogin();
