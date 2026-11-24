// Menú mobile: hamburguesa + overlay. Independiente de main.js.
(function(){
  const mburger = document.querySelector('.nav-burger');
  const mpanel  = document.querySelector('.nav-mobile');
  if (!mburger || !mpanel) return;
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
})();
