function timeAgo(iso) {
  if (!iso) return '';
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

function renderVitals(s) {
  const totalCouncil = s.projects.reduce((a, p) => a + p.council_count, 0);
  const totalContent = s.projects.reduce((a, p) => a + p.content_count, 0);
  const totalLeads = s.projects.reduce((a, p) => a + p.leads_count, 0);
  const totalResearch = s.projects.reduce((a, p) => a + p.research_count, 0);
  const tiles = [
    ['Projects', s.projects.length, s.projects.length ? s.projects.map(p => p.name.replace(/\s*\(.*\)$/, '')).join(', ') : 'none yet'],
    ['Council sessions', totalCouncil, 'across all projects'],
    ['Content batches', totalContent, 'across all projects'],
    ['Leads captured', totalLeads, 'across all projects'],
    ['Research notes', totalResearch, 'across all projects'],
    ['Skills installed', s.skills_installed.length, 'in ~/.claude/skills'],
    ['Agents installed', s.agents_installed.length, 'in ~/.claude/agents'],
  ];
  document.getElementById('vitals').innerHTML = tiles.map(([label, value, sub]) => `
    <div class="tile">
      <div class="label">${label}</div>
      <div class="value">${value}</div>
      <div class="sub">${sub}</div>
    </div>
  `).join('');
}

function renderRoster(roster) {
  document.getElementById('roster-list').innerHTML = roster.map(a => `
    <div class="agent"><span class="agent-name">${a.name}</span><span class="agent-role">${a.role}</span></div>
  `).join('');
}

function renderProjects(projects) {
  const el = document.getElementById('projects-list');
  if (!projects.length) {
    el.innerHTML = '<div class="empty">No projects yet — create one under "1 - Projects" in the vault.</div>';
    return;
  }
  el.innerHTML = projects.map(p => `
    <div class="project-item">
      <div class="title">${p.name}</div>
      <div class="meta">Council ${p.council_count} · Content ${p.content_count} · Leads ${p.leads_count} · Research ${p.research_count}</div>
      <div class="meta">${p.queue.length ? `${p.queue.length} waiting on you` : 'nothing pending'} · last active ${timeAgo(p.last_active)}</div>
    </div>
  `).join('');
}

function renderQueue(queue) {
  const targets = ['queue-list', 'queue-list-front'].map((id) => document.getElementById(id)).filter(Boolean);
  const html = !queue.length
    ? '<div class="empty">Nothing waiting on you right now.</div>'
    : queue.map(item => `
      <div class="queue-item" data-id="${item.id}">
        <div class="title">${item.title}</div>
        <div class="meta">${item.project} · ${item.kind}${item.location ? ` · ${item.location}` : ''}</div>
        ${item.web_status ? `<div class="meta">${item.web_status}</div>` : ''}
        <div class="actions">
          <button class="approve" data-id="${item.id}">${item.kind === 'prospect' ? 'Approve to pursue' : 'Approve'}</button>
          <button class="hold" data-id="${item.id}">Hold</button>
        </div>
      </div>
    `).join('');

  for (const el of targets) {
    el.innerHTML = html;

    el.querySelectorAll('button.approve').forEach(btn => {
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        btn.textContent = 'Approving...';
        try {
          const res = await fetch('/api/approve', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: btn.dataset.id }),
          });
          if (!res.ok) throw new Error();
          document.querySelectorAll(`.queue-item[data-id="${CSS.escape(btn.dataset.id)}"] .actions`).forEach(actions => {
            actions.innerHTML = '<span class="approved-tag">Approved ✓ (written to vault)</span>';
          });
        } catch {
          btn.disabled = false;
          btn.textContent = 'Approve';
          alert('Approve failed — check the server is running.');
        }
      });
    });

    el.querySelectorAll('button.hold').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll(`.queue-item[data-id="${CSS.escape(btn.dataset.id)}"]`).forEach(item => {
          item.style.opacity = '0.5';
        });
      });
    });
  }
}

function renderActivity(activity) {
  const el = document.getElementById('activity-list');
  if (!activity.length) {
    el.innerHTML = '<div class="empty">No activity yet.</div>';
    return;
  }
  el.innerHTML = activity.map(a => `
    <div class="activity-item">
      <div>${a.text} <span class="proj-tag">${a.project}</span></div>
      <div class="when">${timeAgo(a.when)}</div>
    </div>
  `).join('');
}

function wireTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
    });
  });
}

async function loadFilePreview(el, path) {
  if (el.dataset.loaded) { el.remove(); return; }
  el.textContent = 'Loading...';
  try {
    const res = await fetch(`/api/file?path=${encodeURIComponent(path)}`);
    const data = await res.json();
    el.textContent = data.content || '(empty)';
    el.dataset.loaded = '1';
  } catch {
    el.textContent = 'Failed to load.';
  }
}

function renderLinks(links) {
  const html = links.map(l =>
    `<a class="quick-link" href="${l.url}" target="_blank" rel="noopener">${l.label}</a>`
  ).join('');
  ['content-links', 'money-links'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = html;
  });
}

function renderPosted(posted) {
  const el = document.getElementById('posted-list');
  if (!posted || !posted.length) {
    el.innerHTML = '<div class="empty">Nothing marked as posted yet.</div>';
    return;
  }
  el.innerHTML = posted.map(p => `
    <div class="posted-item">
      <div class="who">${p.platform || '(platform?)'} → <span class="account">${p.account || '(account?)'}</span></div>
      <div class="meta">${p.batch || ''} ${p.project ? '· ' + p.project : ''} · ${timeAgo(p.when)}</div>
    </div>
  `).join('');
}

function renderContent(projects) {
  const el = document.getElementById('content-list');
  const withContent = projects.filter(p => p.content_index && p.content_index.length);
  if (!withContent.length) {
    el.innerHTML = '<div class="empty">No content batches drafted yet. Run /content-pipeline for a project to generate one.</div>';
    return;
  }
  el.innerHTML = withContent.map(p => `
    <div class="content-project-group">
      <h3>${p.name}</h3>
      ${p.content_index.map(c => `
        <div class="content-item" data-path="${c.id}">
          <div class="title">${c.title} <span class="badge ${c.approved ? 'approved' : 'pending'}">${c.approved ? 'Approved' : 'Draft — pending'}</span></div>
          <div class="post-row">
            <input class="post-platform" placeholder="Platform (e.g. Instagram)">
            <input class="post-account" placeholder="Account (e.g. @thepitroom)">
            <button class="mark-posted">Mark as posted</button>
          </div>
        </div>
      `).join('')}
    </div>
  `).join('');

  el.querySelectorAll('.content-item').forEach(item => {
    item.addEventListener('click', (e) => {
      if (e.target.closest('.post-row')) return;
      let preview = item.querySelector('.content-preview');
      if (preview) { preview.remove(); return; }
      preview = document.createElement('div');
      preview.className = 'content-preview';
      item.appendChild(preview);
      loadFilePreview(preview, item.dataset.path);
    });
  });

  el.querySelectorAll('.mark-posted').forEach(btn => {
    btn.addEventListener('click', async () => {
      const item = btn.closest('.content-item');
      const platform = item.querySelector('.post-platform').value.trim();
      const account = item.querySelector('.post-account').value.trim();
      if (!platform) { alert('Which platform did you post it to?'); return; }
      btn.disabled = true; btn.textContent = 'Logging...';
      try {
        const res = await fetch('/api/posted', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: item.dataset.path, platform, account }),
        });
        if (!res.ok) throw new Error();
        btn.textContent = 'Logged ✓';
        refresh();
      } catch {
        btn.disabled = false; btn.textContent = 'Mark as posted';
        alert('Failed to log — is the server running?');
      }
    });
  });
}

function renderRevenue(projects) {
  const el = document.getElementById('revenue-list');
  if (!el) return;
  const totalLeads = projects.reduce((a, p) => a + p.leads_count, 0);
  el.innerHTML = `
    <div class="revenue-item">
      <div class="who">Lead capture (site forms) <span class="badge approved">live</span></div>
      <div class="meta">${totalLeads} lead${totalLeads === 1 ? '' : 's'} captured · real, from the demo site</div>
    </div>
    <div class="revenue-item dim">
      <div class="who">Payment processor <span class="badge pending">not connected</span></div>
      <div class="meta">Stripe / PayPal / Square — connect one to see real revenue here</div>
    </div>
    <div class="revenue-item dim">
      <div class="who">Accounting <span class="badge pending">not connected</span></div>
      <div class="meta">QuickBooks — connect for P&amp;L and expense tracking</div>
    </div>
    <div class="revenue-item dim">
      <div class="who">Ad platforms <span class="badge pending">not connected</span></div>
      <div class="meta">Meta Ads / Google Ads — connect to track ad spend and ROAS</div>
    </div>`;
}

function renderLeadsTable(projects) {
  const tbody = document.getElementById('leads-table-body');
  if (!tbody) return;

  const rows = [];
  projects.forEach((p) => {
    (p.all_prospects || []).forEach((pr) => {
      rows.push({
        business: pr.business_name, project: p.name, location: pr.location,
        status: pr.status, detail: pr.web_status, source: pr.source, when: pr.found_at,
      });
    });
    (p.leads || []).forEach((l) => {
      rows.push({
        business: l.name, project: p.name, location: l.neighborhood || l.location || '',
        status: 'inbound', detail: l.notes || l.message || '', source: 'Site form', when: l.when,
      });
    });
  });

  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty">No leads yet — lead-scout hasn\'t found any, and no inbound form submissions.</td></tr>';
    return;
  }

  rows.sort((a, b) => (b.when || '').localeCompare(a.when || ''));
  tbody.innerHTML = rows.map(r => `
    <tr>
      <td><strong>${r.business}</strong></td>
      <td>${r.project}</td>
      <td>${r.location}</td>
      <td><span class="status-pill ${r.status}">${r.status}</span></td>
      <td>${r.detail}</td>
      <td>${r.source && r.source.startsWith('http') ? `<a href="${r.source}" target="_blank" rel="noopener">source</a>` : (r.source || '')}</td>
    </tr>
  `).join('');
}

function renderMoney(projects) {
  const notice = document.getElementById('money-notice');
  if (!notice) return;
  notice.innerHTML = 'No revenue or payment source is connected (no Stripe/QuickBooks/PayPal) — there is no real "money made" figure to show yet. What you see below is real: leads captured through the site forms.';
}

async function refresh() {
  try {
    const res = await fetch('/api/status');
    const s = await res.json();
    document.getElementById('agent-status').innerHTML = `Agent core: <span class="dot"></span> vault ${s.vault_found ? 'connected' : 'not found'} · ${s.projects.length} project${s.projects.length === 1 ? '' : 's'}`;
    renderVitals(s);
    renderRoster(s.roster);
    renderProjects(s.projects);
    renderQueue(s.queue);
    renderActivity(s.activity);
    renderContent(s.projects);
    renderMoney(s.projects);
    renderLinks(s.links || []);
    renderPosted(s.posted);
    renderRevenue(s.projects);
    renderLeadsTable(s.projects);
  } catch (err) {
    document.getElementById('agent-status').textContent = 'Agent core: offline (server not reachable)';
  }
}

function wireInstructBar() {
  const form = document.getElementById('instruct-bar');
  const input = document.getElementById('instruct-input');
  const status = document.getElementById('instruct-status');
  if (!form) return;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    try {
      const res = await fetch('/api/instruct', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) throw new Error();
      input.value = '';
      status.hidden = false;
      status.textContent = 'Saved to the inbox. For it to run now, ask Claude in chat — otherwise it runs within 24h via the daily routine.';
      clearTimeout(status._t);
      status._t = setTimeout(() => { status.hidden = true; }, 5000);
    } catch {
      status.hidden = false;
      status.textContent = 'Failed to save — is the server running?';
    }
  });
}

wireTabs();
wireInstructBar();
refresh();
setInterval(refresh, 15000);
