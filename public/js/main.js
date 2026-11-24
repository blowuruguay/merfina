// FAQ accordion
document.querySelectorAll('.faq-q').forEach(btn => {
  btn.addEventListener('click', () => {
    const item = btn.parentElement;
    const isOpen = item.classList.contains('open');
    document.querySelectorAll('.faq-item.open').forEach(i => i.classList.remove('open'));
    if (!isOpen) item.classList.add('open');
  });
});

// Shop tabs
document.querySelectorAll('.shop-tabs button').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.shop-tabs button').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  });
});

// Newsletter
const newsForm = document.getElementById('newsForm');
if (newsForm) {
  newsForm.addEventListener('submit', e => {
    e.preventDefault();
    alert('Gracias, te vamos a avisar.');
    newsForm.reset();
  });
}

// Nav scrolled state - transparent sobre hero, sticky cream al scrollear
const nav = document.querySelector('.nav');
const hero = document.querySelector('.hero');
if (nav && hero) {
  const update = () => {
    // Umbral: cuando el hero deja de verse (80% del alto del hero)
    const threshold = hero.offsetHeight * 0.75;
    if (window.scrollY > threshold) {
      nav.classList.add('scrolled');
    } else {
      nav.classList.remove('scrolled');
    }
  };
  window.addEventListener('scroll', update, { passive: true });
  update();
}

// Mobile menu toggle
const mburger = document.querySelector('.nav-burger');
const mpanel  = document.querySelector('.nav-mobile');
if (mburger && mpanel) {
  const closeMenu = () => {
    document.body.classList.remove('menu-open');
    mburger.setAttribute('aria-expanded', 'false');
  };
  const openMenu = () => {
    document.body.classList.add('menu-open');
    mburger.setAttribute('aria-expanded', 'true');
  };
  mburger.addEventListener('click', () => {
    document.body.classList.contains('menu-open') ? closeMenu() : openMenu();
  });
  mpanel.querySelectorAll('a').forEach(a => a.addEventListener('click', closeMenu));
  document.querySelector('.nav-mobile-back')?.addEventListener('click', closeMenu);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeMenu(); });
}

// === Grid de productos en la home (sección La colección) ===
(async function cargarShopHome() {
  const grid = document.getElementById('shop-grid');
  const tabs = document.getElementById('shop-tabs');
  if (!grid || !tabs) return;

  const CATS = { 'cubre-botones': 'Cubre botones', 'corbatas': 'Corbatas' };
  const PERMITIDAS = ['cubre-botones', 'corbatas'];
  let filtro = '';
  let productos = [];

  function esc(s) {
    return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function render() {
    const lista = (filtro
      ? productos.filter(p => p.categoria_id === filtro)
      : productos.filter(p => PERMITIDAS.includes(p.categoria_id))
    ).slice(0, 8); // máx 8 en la home

    if (!lista.length) {
      grid.innerHTML = `<div class="shop-vacio">Pronto vamos a sumar nuevas piezas.</div>`;
      return;
    }
    grid.innerHTML = lista.map(p => {
      const img = p.imagenes?.[0]?.url || '/img/placeholder.png';
      const agotado = p.stock <= 0;
      const precio = !p.precio ? 'A consultar' : '$ ' + Number(p.precio).toLocaleString('es-UY');
      return `
        <a href="/producto/${esc(p.slug)}" class="shop-card">
          <div class="img"><img src="${esc(img)}" alt="${esc(p.nombre)}" loading="lazy"></div>
          <div class="body">
            <div class="cat">${esc(CATS[p.categoria_id] || '')}</div>
            <h3>${esc(p.nombre)}</h3>
            <div class="precio">${agotado ? '<span class="agotado">Agotado</span>' : precio}</div>
          </div>
        </a>`;
    }).join('');
  }

  try {
    const r = await fetch('/api/catalogo');
    const data = await r.json();
    productos = (data.productos || []).filter(p => PERMITIDAS.includes(p.categoria_id));

    tabs.querySelectorAll('button').forEach(b => {
      b.onclick = () => {
        filtro = b.dataset.cat || '';
        tabs.querySelectorAll('button').forEach(x => x.classList.toggle('active', x === b));
        render();
      };
    });

    render();
  } catch (err) {
    grid.innerHTML = `<div class="shop-vacio">No pudimos cargar el catálogo. Volvé en un rato.</div>`;
  }
})();
