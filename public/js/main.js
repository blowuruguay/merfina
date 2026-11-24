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
