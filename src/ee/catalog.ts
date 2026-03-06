// EE dataset catalog for autocomplete.
//
// Fetches the STAC catalog from the EE REST API and
// caches it for fast autocomplete lookups.

export interface CatalogEntry {
  id: string;
  title: string;
  type: 'IMAGE' | 'IMAGE_COLLECTION' | 'TABLE';
}

const CATALOG_URL =
  'https://earthengine-stac.storage.googleapis.com/catalog/catalog.json';

let _cache: CatalogEntry[] | undefined;
let _cacheTime = 0;
const CACHE_TTL = 3600000; // 1 hour

export async function searchCatalog(
  query: string
): Promise<CatalogEntry[]> {
  const entries = await getCatalog();
  if (!query) return entries.slice(0, 20);

  const q = query.toLowerCase();
  const matches = entries.filter(
    (e) =>
      e.id.toLowerCase().includes(q) ||
      e.title.toLowerCase().includes(q)
  );
  return matches.slice(0, 20);
}

async function getCatalog(): Promise<CatalogEntry[]> {
  if (_cache && Date.now() - _cacheTime < CACHE_TTL) {
    return _cache;
  }

  try {
    const resp = await fetch(CATALOG_URL);
    if (!resp.ok) return FALLBACK_DATASETS;

    const data = (await resp.json()) as {
      links?: Array<{
        href: string;
        title?: string;
        rel: string;
      }>;
    };

    const entries: CatalogEntry[] = [];
    for (const link of data.links || []) {
      if (link.rel !== 'child') continue;

      // Extract dataset ID from href.
      const match = link.href.match(
        /\/([A-Z][A-Z0-9_/]+)\/[^/]+\.json$/
      );
      if (match) {
        entries.push({
          id: match[1],
          title: link.title || match[1],
          type: 'IMAGE_COLLECTION',
        });
      }
    }

    _cache = entries.length > 0
      ? entries
      : FALLBACK_DATASETS;
    _cacheTime = Date.now();
    return _cache;
  } catch {
    return FALLBACK_DATASETS;
  }
}

const FALLBACK_DATASETS: CatalogEntry[] = [
  {
    id: 'USGS/SRTMGL1_003',
    title: 'SRTM 30m DEM',
    type: 'IMAGE',
  },
  {
    id: 'LANDSAT/LC08/C02/T1_TOA',
    title: 'Landsat 8 TOA',
    type: 'IMAGE_COLLECTION',
  },
  {
    id: 'LANDSAT/LC09/C02/T1_L2',
    title: 'Landsat 9 L2',
    type: 'IMAGE_COLLECTION',
  },
  {
    id: 'COPERNICUS/S2_SR_HARMONIZED',
    title: 'Sentinel-2 SR Harmonized',
    type: 'IMAGE_COLLECTION',
  },
  {
    id: 'COPERNICUS/S1_GRD',
    title: 'Sentinel-1 GRD',
    type: 'IMAGE_COLLECTION',
  },
  {
    id: 'MODIS/061/MOD13A2',
    title: 'MODIS NDVI 16-day',
    type: 'IMAGE_COLLECTION',
  },
  {
    id: 'NASA/NASADEM_HGT/001',
    title: 'NASADEM 30m',
    type: 'IMAGE',
  },
  {
    id: 'GOOGLE/DYNAMICWORLD/V1',
    title: 'Dynamic World',
    type: 'IMAGE_COLLECTION',
  },
  {
    id: 'ESA/WorldCover/v200',
    title: 'ESA WorldCover 2021',
    type: 'IMAGE_COLLECTION',
  },
  {
    id: 'JAXA/ALOS/AW3D30/V3_2',
    title: 'ALOS World 3D 30m',
    type: 'IMAGE',
  },
  {
    id: 'USGS/NLCD_RELEASES/2021_REL/NLCD',
    title: 'NLCD 2021',
    type: 'IMAGE_COLLECTION',
  },
  {
    id: 'JRC/GSW1_4/GlobalSurfaceWater',
    title: 'Global Surface Water',
    type: 'IMAGE',
  },
  {
    id: 'WORLDCLIM/V1/BIO',
    title: 'WorldClim Bioclimatic',
    type: 'IMAGE',
  },
  {
    id: 'CGIAR/SRTM90_V4',
    title: 'SRTM 90m',
    type: 'IMAGE',
  },
  {
    id: 'FAO/GAUL/2015/level0',
    title: 'FAO Country Boundaries',
    type: 'TABLE',
  },
  {
    id: 'TIGER/2018/States',
    title: 'US Census States',
    type: 'TABLE',
  },
  {
    id: 'NOAA/VIIRS/001/VNP46A2',
    title: 'VIIRS Nighttime Lights',
    type: 'IMAGE_COLLECTION',
  },
  {
    id: 'Oxford/MAP/EVI_5km_Monthly',
    title: 'Oxford MAP EVI',
    type: 'IMAGE_COLLECTION',
  },
  {
    id: 'COPERNICUS/DEM/GLO30',
    title: 'Copernicus DEM 30m',
    type: 'IMAGE_COLLECTION',
  },
  {
    id: 'NASA/GPM_L3/IMERG_V07',
    title: 'GPM IMERG Precipitation',
    type: 'IMAGE_COLLECTION',
  },
];
