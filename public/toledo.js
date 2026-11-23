(() => {
  const group = document.getElementById('toledo-group');
  const view = document.getElementById('toledo-view');
  const round = document.getElementById('toledo-round');
  const status = document.getElementById('toledo-status');
  const results = document.getElementById('toledo-data');
  const retry = document.getElementById('toledo-retry');
  const endpoint = '/.netlify/functions/toledo';
  const headings = {
    calendario: ['Local', 'Visitante', 'Fecha y hora', 'Campo'],
    resultados: ['Local', 'Marcador', 'Visitante', 'Fecha', 'Notas'],
    clasificacion: ['Pos.', 'Equipo', 'Pts.', 'PJ', 'PG', 'PE', 'PP', 'GF', 'GC', 'DG'],
  };
  let inFlight;
  let groupsLoaded = false;

  async function read(params, signal) {
    const response = await fetch(endpoint + '?' + new URLSearchParams(params), { signal });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    return data;
  }

  function renderTable(rows) {
    const table = document.createElement('table');
    table.className = 'w-full text-sm text-left';
    const header = table.createTHead().insertRow();
    for (const label of headings[view.value]) {
      const cell = document.createElement('th');
      cell.scope = 'col';
      cell.className = 'p-2 whitespace-nowrap text-slate-400';
      cell.textContent = label;
      header.append(cell);
    }
    const body = table.createTBody();
    for (const values of rows) {
      const row = body.insertRow();
      row.className = 'border-t border-slate-800';
      for (const value of values) {
        const cell = row.insertCell();
        cell.className = 'p-2';
        cell.textContent = value || '—';
      }
    }
    results.replaceChildren(table);
  }

  async function refresh(includeRound = false) {
    inFlight?.abort();
    const attempt = new AbortController();
    inFlight = attempt;
    status.textContent = 'Consultando la Diputación de Toledo…';
    try {
      if (!groupsLoaded) {
        const list = await read({}, attempt.signal);
        for (const item of list.groups) {
          group.add(new Option(item.category + ' · ' + item.name, item.code));
        }
        group.value = list.groups.some(item => item.code === 'CM-01')
          ? 'CM-01' : list.groups[0].code;
        groupsLoaded = true;
        group.disabled = false;
        view.disabled = false;
      }
      const params = { grupo: group.value, vista: view.value };
      if (includeRound && round.value) params.jornada = round.value;
      const data = await read(params, attempt.signal);
      if (attempt.signal.aborted) return;

      round.replaceChildren(...data.rounds.map(item => new Option(item.label, item.number)));
      if (data.round) round.value = data.round;
      round.parentElement.hidden = data.rounds.length === 0;
      if (data.rows.length) renderTable(data.rows);
      else results.textContent = 'La Diputación todavía no muestra datos para esta consulta.';
      status.textContent = data.group + ' · Consulta oficial del ' +
        new Intl.DateTimeFormat('es-ES', {
          dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Madrid',
        }).format(new Date(data.checkedAt));
    } catch (error) {
      if (attempt.signal.aborted) return;
      status.textContent = 'No se pudo consultar el portal oficial. Puedes reintentar o abrir la fuente.';
      results.replaceChildren();
    }
  }

  function changeFilter() {
    results.replaceChildren();
    round.replaceChildren();
    round.parentElement.hidden = true;
    refresh();
  }
  group.addEventListener('change', changeFilter);
  view.addEventListener('change', changeFilter);
  round.addEventListener('change', () => {
    results.replaceChildren();
    refresh(true);
  });
  retry.addEventListener('click', () => refresh(true));
  document.getElementById('nav-btn-scores').addEventListener('click', () => refresh(true));
  document.getElementById('mobile-nav-scores').addEventListener('click', () => refresh(true));
})();
