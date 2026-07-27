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
