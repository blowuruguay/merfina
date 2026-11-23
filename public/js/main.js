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
