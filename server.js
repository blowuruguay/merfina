/**
 * MERFINA — servidor
 *
 * Dominios:
 *   merfina.uy             → la tienda
 *   admin.merfina.uy       → el panel (sin tener que escribir /admin)
 *   www.merfina.uy         → redirige 301 a merfina.uy
 *   *.railway.app          → se deja pasar para probar antes del dominio
 *
 * DOMINIO_PRINCIPAL define a dónde se redirige; si no está, no redirige
 * nada, así el dominio de Railway sigue funcionando mientras se prueba.
 */
const express = require('express');
const compression = require('compression');
const path = require('path');

const app = express();
const PUERTO = process.env.PORT || 3000;

app.use(compression());
// La subida de imágenes necesita hasta 12 MB (base64 infla el tamaño);
// se registra ANTES del límite general para que solo esa ruta tenga ese tamaño.
app.use('/api/admin/imagenes', express.json({ limit: '12mb' }));
app.use(express.json({ limit: '200kb' }));

app.use((err, req, res, next) => {
  if (err && (err.type === 'entity.too.large' || err.status === 413)) {
    return res.status(413).json({ error: 'El contenido que mandaste es demasiado grande' });
  }
  next(err);
});

// -------------------- Seguridad base --------------------
app.use((req, res, next) => {
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
  }
  next();
});

// -------------------- HTTPS + dominios --------------------
const PRINCIPAL = (process.env.DOMINIO_PRINCIPAL || '').replace(/^https?:\/\//, '').replace(/\/$/, '');

app.set('trust proxy', true);

app.use((req, res, next) => {
  const protocolo = req.headers['x-forwarded-proto'];
  const host = (req.headers.host || '').split(':')[0].toLowerCase();
  const esLocal = host === 'localhost' || host === '127.0.0.1';
  if (protocolo && protocolo !== 'https' && !esLocal) {
    return res.redirect(301, `https://${req.headers.host}${req.originalUrl}`);
  }
  next();
});

app.use((req, res, next) => {
  const host = (req.headers.host || '').split(':')[0].toLowerCase();

  // Redirige www o dominios viejos al dominio principal
  if (PRINCIPAL && host && host !== PRINCIPAL &&
      !host.startsWith('admin.') && !host.endsWith('.railway.app') &&
      host !== 'localhost' && host !== '127.0.0.1') {
    return res.redirect(301, `https://${PRINCIPAL}${req.originalUrl}`);
  }

  // admin.merfina.uy entra al panel
  req.esPanel = host.startsWith('admin.');
  next();
});

// -------------------- Log mínimo --------------------
app.use((req, res, next) => {
  const t0 = Date.now();
  res.on('finish', () => {
    if (req.path.startsWith('/api')) {
      console.log(`${req.method} ${req.path} ${res.statusCode} ${Date.now() - t0}ms`);
    }
  });
  next();
});

// -------------------- API --------------------
app.use('/api/catalogo',         require('./routes/catalogo'));
app.use('/api/contacto',         require('./routes/contacto'));
app.use('/api/newsletter',       require('./routes/newsletter'));
app.get('/baja-correos',         require('./routes/newsletter').bajaCorreos);
app.use('/api/auth',             require('./routes/auth'));
app.use('/api/admin/imagenes',   require('./routes/imagenes'));
app.use('/api/admin',            require('./routes/admin'));

// -------------------- Salud --------------------
app.get('/api/salud', (req, res) => {
  const arranque = require('./services/arranque').estado;
  const avisos = [];
  if (arranque.ok === false) avisos.push('El arranque falló: ' + arranque.error);
  if (arranque.ok === null)  avisos.push('El arranque todavía no terminó');
  if (!process.env.JWT_SECRET) avisos.push('Falta JWT_SECRET');
  if (!process.env.ADMIN_EMAIL) avisos.push('Falta ADMIN_EMAIL (usuario inicial del panel)');
  res.json({
    ok: avisos.length === 0,
    version: require('./package.json').version,
    arranque: { ok: arranque.ok, terminado: arranque.terminado },
    avisos
  });
});

app.get('/health', (_, res) => res.status(200).send('ok'));

// -------------------- Estáticos --------------------
app.use(express.static(path.join(__dirname, 'public'), {
  index: false,
  redirect: false,
  setHeaders(res, ruta) {
    res.setHeader('Cache-Control',
      ruta.endsWith('.html') ? 'no-cache'
      :                        'public, max-age=3600');
  }
}));

// -------------------- Rutas por host --------------------
// El panel: cualquier ruta bajo /admin o cualquier ruta en admin.merfina.uy
app.get('/admin',     (req, res) => res.sendFile(path.join(__dirname, 'public/admin/index.html')));
app.get('/admin/*',   (req, res) => res.sendFile(path.join(__dirname, 'public/admin/index.html')));

app.get('*', (req, res) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ error: 'No existe esa ruta' });
  }
  if (req.esPanel) {
    return res.sendFile(path.join(__dirname, 'public/admin/index.html'));
  }

  // Páginas conocidas de la tienda
  const paginas = ['tienda', 'producto', 'contacto', 'carrito', 'nosotros', 'cambios', 'envios'];
  const primera = req.path.split('/')[1];
  if (paginas.includes(primera)) {
    const archivo = path.join(__dirname, 'public', `${primera}.html`);
    return res.sendFile(archivo, err => {
      if (err) res.sendFile(path.join(__dirname, 'public/index.html'));
    });
  }

  res.sendFile(path.join(__dirname, 'public/index.html'));
});

// -------------------- Errores --------------------
app.use((err, req, res, next) => {
  console.error('Error no controlado:', err);
  res.status(500).json({ error: 'Error interno' });
});

// -------------------- Arranque --------------------
require('./services/arranque').preparar().then(() => {
  app.listen(PUERTO, () => {
    console.log(`Merfina v${require('./package.json').version} escuchando en :${PUERTO}`);
  });
});
