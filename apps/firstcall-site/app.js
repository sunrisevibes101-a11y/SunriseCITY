const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) {
      entry.target.classList.add('visible');
      revealObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.15 });
document.querySelectorAll('.reveal').forEach((el) => revealObserver.observe(el));

const checkoutParam = new URLSearchParams(window.location.search).get('checkout');
if (checkoutParam) {
  const banner = document.getElementById('checkout-banner');
  banner.hidden = false;
  if (checkoutParam === 'success') {
    banner.textContent = "Payment received (test mode) — we'll be in touch to kick off your build.";
    banner.className = 'checkout-banner success';
  } else {
    banner.textContent = 'Checkout cancelled — no charge was made.';
    banner.className = 'checkout-banner cancelled';
  }
  window.history.replaceState({}, '', window.location.pathname);
}

const payBtn = document.getElementById('pay-now-btn');
if (payBtn) {
  payBtn.addEventListener('click', async () => {
    payBtn.disabled = true;
    payBtn.textContent = 'Redirecting to secure checkout…';
    try {
      const res = await fetch('/api/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item: 'build' }),
      });
      const data = await res.json();
      if (!res.ok || !data.url) throw new Error(data.error || 'Checkout unavailable');
      window.location.href = data.url;
    } catch (err) {
      payBtn.disabled = false;
      payBtn.textContent = 'Or pay $999 now →';
      alert("Checkout isn't available right now. Use \"Get started\" below instead.");
    }
  });
}

document.getElementById('lead-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const status = document.getElementById('form-status');
  const data = Object.fromEntries(new FormData(form).entries());

  status.textContent = 'Sending...';
  status.className = 'form-status';

  try {
    const res = await fetch('/api/leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error('Server error');
    status.textContent = "Got it — we'll follow up with a real quote soon.";
    status.className = 'form-status success';
    form.reset();
  } catch (err) {
    status.textContent = 'Something went wrong. Please try again.';
    status.className = 'form-status error';
  }
});
