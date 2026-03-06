import * as vscode from 'vscode';
import { searchCatalog } from '../ee/catalog';

// EE-aware completion provider. Provides completions
// for ee.* methods, dataset IDs, and band names.

const EE_TYPES: Record<string, string[]> = {
  ee: [
    'Image', 'ImageCollection', 'Feature',
    'FeatureCollection', 'Geometry', 'Filter',
    'Reducer', 'Date', 'Number', 'String', 'List',
    'Dictionary', 'Terrain', 'Algorithms',
  ],
  'ee.Image': [
    'select', 'addBands', 'rename', 'clip',
    'updateMask', 'mask', 'unmask',
    'visualize', 'getInfo', 'getMapId',
    'reduceRegion', 'reduceRegions',
    'reduceNeighborhood', 'sample',
    'expression', 'normalizedDifference',
    'multiply', 'add', 'subtract', 'divide',
    'pow', 'sqrt', 'log', 'abs',
    'gt', 'gte', 'lt', 'lte', 'eq', 'neq',
    'and', 'or', 'not',
    'focal_mean', 'focal_median', 'focal_max',
    'focal_min', 'convolve', 'entropy',
    'glcmTexture', 'gradient',
    'reproject', 'resample', 'projection',
    'bandNames', 'bandTypes',
    'set', 'get', 'toDictionary', 'toFloat',
    'toInt', 'toByte', 'toDouble',
  ],
  'ee.ImageCollection': [
    'filter', 'filterDate', 'filterBounds',
    'filterMetadata', 'map', 'iterate',
    'merge', 'mosaic', 'median', 'mean',
    'min', 'max', 'sum', 'count',
    'reduce', 'select', 'first', 'sort',
    'limit', 'size', 'toList',
    'distinct', 'aggregate_array',
    'aggregate_histogram',
  ],
  'ee.Feature': [
    'geometry', 'get', 'set', 'buffer',
    'centroid', 'area', 'length',
    'intersection', 'union', 'difference',
    'toDictionary', 'getInfo',
  ],
  'ee.FeatureCollection': [
    'filter', 'filterBounds', 'filterDate',
    'map', 'iterate', 'merge', 'size',
    'first', 'sort', 'limit', 'toList',
    'select', 'distinct',
    'aggregate_array', 'aggregate_histogram',
    'aggregate_stats', 'reduceColumns',
    'style', 'getInfo',
  ],
  'ee.Reducer': [
    'mean', 'median', 'min', 'max', 'sum',
    'count', 'stdDev', 'variance',
    'first', 'last', 'histogram',
    'percentile', 'minMax',
    'linearFit', 'linearRegression',
    'combine', 'group', 'unweighted',
  ],
  'ee.Filter': [
    'eq', 'neq', 'lt', 'lte', 'gt', 'gte',
    'date', 'bounds', 'inList',
    'and', 'or', 'not',
    'calendarRange', 'dayOfYear',
    'stringContains', 'stringStartsWith',
  ],
  Map: [
    'addLayer', 'setCenter', 'centerObject',
    'setZoom', 'getBounds', 'getCenter',
    'getZoom',
  ],
  Export: ['image', 'table', 'video', 'map'],
  'Export.image': [
    'toDrive', 'toAsset', 'toCloudStorage',
  ],
  'Export.table': [
    'toDrive', 'toAsset', 'toCloudStorage',
    'toBigQuery',
  ],
};


export class EECompletionProvider
  implements vscode.CompletionItemProvider
{
  async provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position
  ): Promise<vscode.CompletionItem[] | undefined> {
    const lineText = document.lineAt(position).text;
    const linePrefix = lineText.substring(
      0,
      position.character
    );

    // Dataset completions inside ee.Image('...')
    // or ee.ImageCollection('...').
    const datasetMatch = linePrefix.match(
      /ee\.(?:Image|ImageCollection)\(\s*['"]([^'"]*)?$/
    );
    if (datasetMatch) {
      const query = datasetMatch[1] || '';
      const results = await searchCatalog(query);
      return results.map((ds) => {
        const item = new vscode.CompletionItem(
          ds.id,
          vscode.CompletionItemKind.Value
        );
        item.detail = ds.title;
        item.insertText = ds.id;
        item.sortText = ds.id;
        return item;
      });
    }

    // Dot-completion for ee types.
    for (const [prefix, methods] of Object.entries(
      EE_TYPES
    )) {
      if (linePrefix.endsWith(prefix + '.')) {
        return methods.map((m) => {
          const item = new vscode.CompletionItem(
            m,
            prefix === 'ee'
              ? vscode.CompletionItemKind.Class
              : vscode.CompletionItemKind.Method
          );
          return item;
        });
      }
    }

    return undefined;
  }
}
