/* ============================================================
   MERFINA · Bolsa (carrito) + Favoritos tooltip
   Carga en todas las páginas. Guarda el carrito en localStorage.
   ============================================================ */
(function () {
  const CART_KEY = 'merfina_cart';
  const FAV_KEY  = 'merfina_fav';

  // ---------- Inyecta HTML del drawer y tooltip (una sola vez) ----------
  if (!document.querySelector('.bolsa-drawer')) {
    const wrap = document.createElement('div');
    wrap.innerHTML = `
      <div class="bolsa-back" data-bolsa-close></div>
      <aside class="bolsa-drawer" aria-label="Tu bolsa">
        <div class="bolsa-head">
          <h3>Tu bolsa</h3>
          <button class="bolsa-close" data-bolsa-close aria-label="Cerrar">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M6 6l12 12M18 6L6 18"/>
            </svg>
          </button>
        </div>
        <div class="bolsa-body" id="bolsa-body"></div>
      </aside>
      <div class="fav-toast">Tocá el corazón de una pieza para guardarla</div>
    `;
    document.body.appendChild(wrap);
  }

  // ---------- Estado ----------
  function getCart() {
    try { return JSON.parse(localStorage.getItem(CART_KEY) || '[]'); }
    catch { return []; }
  }
  function setCart(c) {
    localStorage.setItem(CART_KEY, JSON.stringify(c));
    actualizarContador();
    if (document.body.classList.contains('bolsa-open')) renderBolsa();
  }
  window.merfinaBolsa = {
    agregar(item) {
      const c = getCart();
      const existe = c.find(x => x.slug === item.slug);
      if (existe) existe.cantidad = (existe.cantidad || 1) + 1;
      else c.push({ ...item, cantidad: 1 });
      setCart(c);
      abrir();
    },
    quitar(slug) {
      setCart(getCart().filter(x => x.slug !== slug));
    }
  };

  // ---------- Render ----------
  function esc(s) {
    return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function precio(n) {
    if (!n) return '—';
    return '$ ' + Number(n).toLocaleString('es-UY');
  }

  function renderBolsa() {
    const body = document.getElementById('bolsa-body');
    const c = getCart();
    if (!c.length) {
      body.innerHTML = `
        <div class="bolsa-empty">
          <div class="star">✦</div>
          <h4>Tu bolsa está vacía</h4>
          <p>Elegí una pieza para empezar.</p>
        </div>`;
      // Quitamos el pie si existía
      document.querySelector('.bolsa-foot')?.remove();
      return;
    }

    const items = c.map(i => `
      <div class="bolsa-item">
        <img src="${esc(i.imagen || '/img/placeholder.png')}" alt="${esc(i.nombre)}">
        <div>
          <div class="bi-nombre">${esc(i.nombre)}</div>
          <div class="bi-cat">${esc(i.categoria || '')}</div>
          <div class="bi-precio">${precio(i.precio)} ${i.cantidad > 1 ? `× ${i.cantidad}` : ''}</div>
        </div>
        <button class="bi-del" data-del="${esc(i.slug)}" aria-label="Quitar">×</button>
      </div>
    `).join('');

    body.innerHTML = `<div class="bolsa-items">${items}</div>`;

    // Pie con total + CTA
    const total = c.reduce((s, i) => s + (i.precio || 0) * (i.cantidad || 1), 0);
    const mensajeWA = encodeURIComponent(
      'Hola Merfina, me interesan estas piezas:\n' +
      c.map(i => `· ${i.nombre} (${precio(i.precio)}${i.cantidad > 1 ? ' × ' + i.cantidad : ''})`).join('\n') +
      `\n\nTotal: ${precio(total)}`
    );
    let foot = document.querySelector('.bolsa-foot');
    if (!foot) {
      foot = document.createElement('div');
      foot.className = 'bolsa-foot';
      document.querySelector('.bolsa-drawer').appendChild(foot);
    }
    foot.innerHTML = `
      <div class="bolsa-tot"><span>Total</span><span>${precio(total)}</span></div>
      <a href="https://wa.me/59891900341?text=${mensajeWA}" target="_blank" rel="noopener" class="bolsa-cta">
        Consultar por WhatsApp
      </a>
    `;

    // Eventos de borrar
    body.querySelectorAll('[data-del]').forEach(b => {
      b.onclick = () => window.merfinaBolsa.quitar(b.dataset.del);
    });
  }

  function abrir() {
    renderBolsa();
    document.body.classList.add('bolsa-open');
  }
  function cerrar() {
    document.body.classList.remove('bolsa-open');
  }

  // ---------- Contador (burbuja en el ícono de bolsa) ----------
  function actualizarContador() {
    const n = getCart().reduce((s, i) => s + (i.cantidad || 1), 0);
    document.querySelectorAll('.bag-count').forEach(el => {
      el.textContent = n > 0 ? n : '';
      el.style.display = n > 0 ? '' : 'none';
    });
  }

  // ---------- Tooltip favoritos ----------
  let favTimer = null;
  function mostrarFavToast() {
    document.body.classList.add('fav-toast-on');
    clearTimeout(favTimer);
    favTimer = setTimeout(() => {
      document.body.classList.remove('fav-toast-on');
    }, 2800);
  }

  // ---------- Delegación de clicks ----------
  document.addEventListener('click', e => {
    const bag = e.target.closest('.bag-btn, .icon-btn[title="Bolsa"], .icon-btn[title="Tienda"]');
    const fav = e.target.closest('.fav-btn, .icon-btn[title="Favoritos"], .icon-btn[title="Contacto"]');
    const cerrarBtn = e.target.closest('[data-bolsa-close]');

    if (cerrarBtn) { cerrar(); return; }

    // El ícono de bolsa en el nav ahora abre el drawer
    if (bag && bag.classList.contains('bag-btn')) {
      e.preventDefault();
      abrir();
      return;
    }

    // El corazón abre el tooltip
    if (fav && fav.classList.contains('fav-btn')) {
      e.preventDefault();
      mostrarFavToast();
      return;
    }
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') cerrar();
  });

  actualizarContador();
})();
