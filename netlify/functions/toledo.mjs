import { load } from 'cheerio';

const origin = 'https://deportes.diputoledo.es';
const season = '2026/2027';
const categories = {
  PBM: 'Prebenjamín masculino',
  BJM: 'Benjamín masculino',
  AM: 'Alevín masculino',
  CM: 'Cadete masculino',
  IM: 'Infantil masculino',
  AIF: 'Alevín–Infantil femenino',
  ICF: 'Infantil–Cadete femenino',
};
const views = {
  calendario: ['cal', 'CALENDARIO'],
  resultados: ['res', 'RESULTADOS'],
  clasificacion: ['cla', 'CLASIFICACIÓN'],
};

function clean(text) {
  return text.replace(/\s+/g, ' ').trim();
}

function fields(form) {
  return new URLSearchParams(
    form.find('input[type=hidden][name]').toArray().map(input => [
      input.attribs.name, input.attribs.value ?? '',
    ]),
  );
}

async function page(path, body, cookie) {
  const response = await fetch(new URL(path, origin), {
    method: body ? 'POST' : 'GET',
    body,
    headers: cookie ? { Cookie: cookie } : {},
    redirect: 'error',
    signal: AbortSignal.timeout(6000),
  });
  if (!response.ok) throw new Error('El portal devolvió HTTP ' + response.status);
  const cookies = new Map(cookie ? cookie.split('; ').map(pair => {
    const index = pair.indexOf('=');
    return [pair.slice(0, index), pair.slice(index + 1)];
  }) : []);
  for (const header of response.headers.getSetCookie()) {
    const [pair] = header.split(';', 1);
    const index = pair.indexOf('=');
    if (index > 0) cookies.set(pair.slice(0, index), pair.slice(index + 1));
  }
  return {
    $: load(await response.text()),
    cookie: Array.from(cookies, ([name, value]) => name + '=' + value).join('; '),
  };
}

export function parseGroups($) {
  return $('form#comp').toArray().flatMap(element => {
    const form = $(element);
    const code = clean(form.find('.fw-bold').first().text());
    const group = /^([A-Z]+)-\d{2}$/.exec(code);
    if (!group || !Object.hasOwn(categories, group[1])) return [];
    return [{
      code,
      name: clean(form.find('.fw-bold').first().parent().text()),
      category: categories[group[1]],
      fields: fields(form),
    }];
  });
}

export function parseView($, group, title, view) {
  if (!clean($('h3').text()).startsWith(group + ' ') ||
      !$('h4').toArray().some(h => clean($(h).text()).includes(title))) {
    throw new Error('El portal no devolvió la ficha esperada');
  }
  const rounds = $('select[name=num_jornada] option').toArray().map(element => ({
    number: element.attribs.value,
    label: clean($(element).text()),
  })).filter(item => /^\d+$/.test(item.number));
  const round = $('select[name=num_jornada]').val() ?? null;
  const rows = [];
  if (view === 'clasificacion') {
    $('table tr').each((_, element) => {
      const cells = $(element).children('td').toArray().map(td => clean($(td).text()));
      const position = cells.findIndex(cell => /^\d+[ºª.]?$/.test(cell));
      if (position < 0 || cells.length < position + 10) return;
      const [place, team, points, played, won, drawn, lost, gf, ga, gd] = cells.slice(position);
      rows.push([place, team, points, played, won, drawn, lost, gf, ga, gd]);
    });
  } else {
    $('.twelve.columns.p-10').each((_, element) => {
      const children = $(element).children();
      if (view === 'calendario' && children.length === 3) {
        const teams = children.eq(0).find('p').toArray().map(p => clean($(p).text()));
        if (teams.length !== 2 || !teams.every(Boolean)) return;
        const details = [1, 2].map(index => children.eq(index).find('p').toArray().map(p => clean($(p).text())).filter(Boolean).join(' · '));
        rows.push([...teams, ...details]);
      }
      if (view === 'resultados' && children.length === 5 &&
          children.eq(0).hasClass('text-right') && children.eq(2).hasClass('text-left')) {
        rows.push(children.toArray().map(cell => clean($(cell).text())));
      }
    });
  }
  return { group, round, rounds, rows };
}

async function listGroups(championship) {
  const home = await page('/');
  const form = home.$('form#filtrado');
  const id = form.find('select[name=id_temporada] option').toArray()
    .find(option => clean(home.$(option).text()) === season)?.attribs.value;
  if (!id) throw new Error('Temporada no disponible');
  const filter = fields(form);
  const checked = form.find('input[name=tipo][checked]').val() ?? 'fase_grupos';
  for (const [key, value] of Object.entries({
    id_temporada: id, id_temporada_old: id, tipo: checked, tipo_old: checked,
    id_campeonato: championship, id_campeonato_old: championship, id_deporte: '1', id_deporte_old: '1',
    id_categoria: 'todas', id_genero: 'todos', filtrar: 'si',
  })) filter.set(key, value);

  const listing = await page('/', filter, home.cookie);
  return parseGroups(listing.$).map(group => ({ ...group, cookie: listing.cookie }));
}

export default async function handler(request) {
  if (request.method !== 'GET') return new Response(null, { status: 405, headers: { Allow: 'GET' } });
  const params = new URL(request.url).searchParams;
  const code = params.get('grupo');
  const view = params.get('vista');
  const round = params.get('jornada');
  if ((code && (!/^(PBM|BJM|AM|CM|IM|AIF|ICF)-\d{2}$/.test(code) || !Object.hasOwn(views, view))) ||
      (round !== null && !/^[1-9]\d?$/.test(round))) {
    return Response.json({ error: 'Consulta inválida' }, { status: 400 });
  }

  const headers = {
    'Netlify-CDN-Cache-Control': 'public, s-maxage=900, stale-while-revalidate=120',
    'Netlify-Vary': 'query=grupo|vista|jornada',
  };
  try {
    const championship = code?.startsWith('PBM-') ? '3' : code?.startsWith('BJM-') ? '2' : '1';
    const groups = code
      ? await listGroups(championship)
      : (await Promise.all(['1', '2', '3'].map(listGroups))).flat();
    if (!groups.length) throw new Error('El portal no devolvió los grupos');
    if (!code) {
      return Response.json({ season, groups: groups.map(({ code, name, category }) =>
        ({ code, name, category })) }, { headers });
    }
    const group = groups.find(item => item.code === code);
    if (!group) return Response.json({ error: 'Grupo no disponible' }, { status: 404 });

    const [operation, title] = views[view];
    const path = '/competiciones/' + operation;
    let detail = await page(path, group.fields, group.cookie);
    if (round && view !== 'clasificacion') {
      const report = detail.$('form#informe');
      if (!report.find('select[name=num_jornada] option[value="' + round + '"]').length) {
        return Response.json({ error: 'Jornada no disponible' }, { status: 404 });
      }
      if (report.find('select[name=num_jornada]').val() !== round) {
        const form = fields(report);
        form.set('num_jornada', round);
        detail = await page(path, form, detail.cookie);
      }
    }
    return Response.json({
      ...parseView(detail.$, code, title, view),
      checkedAt: new Date().toISOString(),
    }, { headers });
  } catch (error) {
    console.error('Toledo:', error.message);
    return Response.json({ error: 'La consulta oficial no está disponible ahora.' }, { status: 502 });
  }
}
