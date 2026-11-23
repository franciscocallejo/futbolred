import { load } from 'cheerio';

const base = 'https://www.ffcm.es/pnfg/NPcd/';
const headers = {
  'Netlify-CDN-Cache-Control': 'public, s-maxage=300, stale-while-revalidate=60',
  'Netlify-Vary': 'query=competicion|grupo',
};
const clean = text => text.replace(/\s+/g, ' ').trim();

function federacion(path, params = {}) {
  const url = new URL(path, base);
  url.search = new URLSearchParams({ cod_primaria: '1000120', ...params });
  return url;
}

async function read(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(7000) });
  if (!response.ok) throw new Error('FFCM HTTP ' + response.status);
  const buffer = await response.arrayBuffer();
  const charset = /charset\s*=\s*([^;\s]+)/i.exec(response.headers.get('content-type') ?? '')?.[1];
  return load(new TextDecoder(charset || 'utf-8').decode(buffer));
}

function options($, id) {
  return $(id + ' option').toArray().flatMap(option => {
    const value = $(option).val();
    return /^[1-9]\d*$/.test(value) ? [{ id: value, name: clean($(option).text()) }] : [];
  });
}

export function parseRounds($) {
  return $('table.table-striped').toArray().flatMap(table => {
    const rows = $(table).find('tr').toArray();
    const title = clean($(rows[0]).text());
    if (!/^Jornada\s+\d+/i.test(title)) return [];
    const matches = rows.slice(1).flatMap(row => {
      const cells = $(row).children('td');
      if (cells.length !== 3 || !cells.eq(1).hasClass('anchogoles')) return [];
      const home = clean(cells.eq(0).text());
      const away = clean(cells.eq(2).text());
      const goals = cells.eq(1).find('strong').toArray().map(item => clean($(item).text()));
      const score = goals.length === 2 && goals.every(goal => /^\d+$/.test(goal)) ? goals.join(' – ') : null;
      return home && away ? [{ home, away, score }] : [];
    });
    return matches.length ? [{ title, matches }] : [];
  });
}

export default async function handler(request) {
  if (request.method !== 'GET') return new Response(null, { status: 405, headers: { Allow: 'GET' } });
  const query = new URL(request.url).searchParams;
  const competition = query.get('competicion');
  const group = query.get('grupo');
  if ([competition, group].some(value => value !== null && !/^[1-9]\d{0,9}$/.test(value)) || (group && !competition)) {
    return Response.json({ error: 'Consulta inválida' }, { status: 400 });
  }

  const params = { CodTemporada: '22' };
  if (competition) params.CodCompeticion = competition;
  try {
    if (!group) {
      const $ = await read(federacion('NFG_CmpJornada', params));
      if (!$('#competicion').length) throw new Error('Catálogo no disponible');
      if (!competition) return Response.json({ competitions: options($, '#competicion') }, { headers });
      if ($('#competicion').val() !== competition) return Response.json({ error: 'Competición no disponible' }, { status: 404 });
      return Response.json({ groups: options($, '#grupo') }, { headers });
    }

    const url = federacion('NFG_VisCalendario_Vis', { codtemporada: '22', codcompeticion: competition, codgrupo: group, CodJornada: '1' });
    const $ = await read(url);
    const rounds = parseRounds($);
    if (!rounds.length) throw new Error('Calendario no disponible');
    return Response.json({
      rounds,
      source: federacion('NFG_CmpJornada', { ...params, CodGrupo: group }).href,
      standings: federacion('NFG_VisClasificacion', { codcompeticion: competition, codgrupo: group }).href,
    }, { headers });
  } catch (error) {
    console.error('FFCM:', error.message);
    return Response.json({ error: 'La Federación no ha devuelto los datos. Puedes consultarlos en el portal oficial.' }, { status: 502 });
  }
}
