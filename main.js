// LeadSap главный JS — мобильное меню, плавная прокрутка, FAQ
document.addEventListener('DOMContentLoaded', function() {
  // Плавная прокрутка по якорям
  document.querySelectorAll('a[href^="#"]').forEach(link => {
    link.addEventListener('click', function(e) {
      const targetId = this.getAttribute('href');
      if (targetId === '#') return;
      const target = document.querySelector(targetId);
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });

  // Анимация чисел в статистике при появлении на экране
  const statNums = document.querySelectorAll('.stat-num');
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        animateNumber(entry.target);
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.5 });
  statNums.forEach(el => observer.observe(el));

  function animateNumber(el) {
    const text = el.textContent;
    const match = text.match(/(\d+)/);
    if (!match) return;
    const target = parseInt(match[1]);
    const suffix = text.replace(/\d+/, '');
    let current = 0;
    const step = Math.max(1, Math.floor(target / 30));
    const timer = setInterval(() => {
      current += step;
      if (current >= target) {
        current = target;
        clearInterval(timer);
      }
      el.textContent = current + suffix;
    }, 40);
  }

  // Открытие/закрытие FAQ
  document.querySelectorAll('details').forEach(d => {
    d.addEventListener('toggle', () => {
      if (d.open) {
        document.querySelectorAll('details').forEach(other => {
          if (other !== d) other.open = false;
        });
      }
    });
  });

  console.log('🌱 LeadSap landing loaded');
});
