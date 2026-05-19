const menuToggle = document.querySelector('.menu-toggle');
const nav = document.querySelector('.nav');

menuToggle?.addEventListener('click', () => {
  nav?.classList.toggle('active');
});

document.querySelectorAll('.nav-links a').forEach((link) => {
  link.addEventListener('click', () => {
    nav?.classList.remove('active');
  });
});

document.addEventListener('click', (e) => {
  const chip = e.target.closest('.chips button.chip');
  if (!chip) return;
  const group = chip.closest('.chips');
  if (!group) return;
  const single = group.getAttribute('data-single') === 'true';
  if (single) {
    group.querySelectorAll('.chip').forEach((c) => c.classList.remove('chip--active'));
  }
  chip.classList.toggle('chip--active');
});
