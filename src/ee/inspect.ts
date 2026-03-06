import { EEAuth } from './auth';
import { EEState } from './state';

// Queries pixel values at a point for all visible
// layers with EE objects.

export interface InspectResult {
  layerName: string;
  values: Record<string, unknown>;
}

export async function inspectPoint(
  lat: number,
  lng: number,
  state: EEState,
  auth: EEAuth
): Promise<InspectResult[]> {
  const headers = await auth.getHeaders();
  const results: InspectResult[] = [];

  const layers = state.layers.filter(
    (l) => l.visible && l.eeObject
  );

  // Query each layer in parallel.
  const promises = layers.map(async (layer) => {
    try {
      const url =
        'https://earthengine.googleapis.com/v1/' +
        `projects/${auth.projectId || 'earthengine-legacy'}` +
        '/value:compute';

      const body = {
        expression: {
          functionInvocationValue: {
            functionName: 'Image.sample',
            arguments: {
              image: layer.eeObject,
              region: {
                functionInvocationValue: {
                  functionName: 'GeometryConstructors.Point',
                  arguments: {
                    coordinates: {
                      constantValue: [lng, lat],
                    },
                  },
                },
              },
              scale: { constantValue: 30 },
              numPixels: { constantValue: 1 },
            },
          },
        },
      };

      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          ...headers,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (resp.ok) {
        const data = (await resp.json()) as {
          result?: {
            features?: Array<{
              properties?: Record<string, unknown>;
            }>;
          };
        };
        const props =
          data.result?.features?.[0]?.properties || {};
        return {
          layerName: layer.name,
          values: props,
        };
      }
    } catch {
      // Skip layers that fail to inspect.
    }
    return { layerName: layer.name, values: {} };
  });

  const settled = await Promise.all(promises);
  results.push(...settled);

  return results;
}
