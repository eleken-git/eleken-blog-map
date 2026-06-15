import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const COLL_ID = '6368f41dd433865719aa82cd';
const TOKEN = process.env.WEBFLOW_TOKEN;

if (!TOKEN) {
  console.error('ERROR: WEBFLOW_TOKEN environment variable is not set.');
  process.exit(1);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function parseDate(raw) {
  if (!raw) return { year: 0, date: '', iso: '' };
  const d = new Date(raw);
  const year = d.getUTCFullYear();
  const month = MONTHS[d.getUTCMonth()];
  const day = String(d.getUTCDate()).padStart(2, '0');
  const isoMonth = String(d.getUTCMonth() + 1).padStart(2, '0');
  const isoDay = String(d.getUTCDate()).padStart(2, '0');
  return {
    year,
    date: `${month} ${day}, ${year}`,
    iso: `${year}-${isoMonth}-${isoDay}`,
  };
}

async function fetchAllItems() {
  const items = [];
  let offset = 0;
  let total = null;

  do {
    const url = `https://api.webflow.com/v2/collections/${COLL_ID}/items?limit=100&offset=${offset}`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        'accept-version': '1.0.0',
      },
    });

    if (!res.ok) {
      const body = await res.text();
      console.error(`ERROR: Webflow API returned ${res.status}: ${body}`);
      process.exit(1);
    }

    const json = await res.json();
    total = json.pagination.total;
    items.push(...json.items);
    offset += json.items.length;
    console.log(`Fetched ${items.length}/${total} items…`);
  } while (offset < total);

  return items;
}

async function build() {
  console.log('Fetching blog posts from Webflow…');
  const rawItems = await fetchAllItems();

  const nodes = rawItems.map((item) => {
    const fd = item.fieldData;
    const slug = fd.slug;
    const name = fd.name;
    const { year, date, iso } = parseDate(fd['original-publish-date']);
    const url = `https://www.eleken.co/blog-posts/${slug}`;
    return { slug, name, year, date, iso, url };
  });

  console.log(`Built ${nodes.length} nodes.`);

  const template = readFileSync(join(ROOT, 'src', 'eleken-blog-map.js'), 'utf8');
  const output = template.replace('/*NODES_PLACEHOLDER*/[]', JSON.stringify(nodes));
  writeFileSync(join(ROOT, 'eleken-blog-map.js'), output);

  console.log('Build complete → eleken-blog-map.js');
}

build();
