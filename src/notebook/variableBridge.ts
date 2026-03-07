// Cross-language variable bridge for EE notebooks.
//
// EE computations are language-agnostic — both JS and
// Python APIs serialize to the same computation graph
// JSON. This module bridges variables across cells by:
//
// 1. After a JS cell runs, serializing all ee.* variables
//    via ee.Serializer.toJSON()
// 2. Before a Python cell runs, deserializing those
//    variables via ee.Deserializer.fromJSON()
// 3. And vice versa.
//
// Non-EE values (strings, numbers, arrays) are passed
// as plain JSON.

export interface SerializedVar {
  name: string;
  type: 'ee' | 'plain';
  value: string; // JSON string
}

// JS code to serialize variables after cell execution.
export function jsSerializeVars(
  varNames: string[]
): string {
  return `
// Serialize variables for cross-cell bridge.
__bridge_vars = [];
${varNames
  .map(
    (v) => `
try {
  if (typeof ${v} !== 'undefined') {
    if (${v} && typeof ${v}.serialize === 'function') {
      __bridge_vars.push({
        name: '${v}',
        type: 'ee',
        value: ee.Serializer.toJSON(${v})
      });
    } else {
      __bridge_vars.push({
        name: '${v}',
        type: 'plain',
        value: JSON.stringify(${v})
      });
    }
  }
} catch(e) {}
`
  )
  .join('')}
`;
}

// JS code to deserialize variables before cell execution.
export function jsDeserializeVars(
  vars: SerializedVar[]
): string {
  return vars
    .map((v) => {
      if (v.type === 'ee') {
        return `var ${v.name} = ee.Deserializer.fromJSON(${JSON.stringify(v.value)});`;
      }
      return `var ${v.name} = ${v.value};`;
    })
    .join('\n');
}

// Python code to deserialize variables before execution.
export function pyDeserializeVars(
  vars: SerializedVar[]
): string {
  return vars
    .map((v) => {
      if (v.type === 'ee') {
        return `${v.name} = ee.deserializer.fromJSON(${JSON.stringify(v.value)})`;
      }
      return `${v.name} = json.loads(${JSON.stringify(v.value)})`;
    })
    .join('\n');
}

// Python code to serialize variables after execution.
export function pySerializeVars(
  varNames: string[]
): string {
  return `
__bridge_vars = []
${varNames
  .map(
    (v) => `
try:
    if '${v}' in dir():
        obj = eval('${v}')
        if hasattr(obj, 'serialize'):
            __bridge_vars.append({
                'name': '${v}',
                'type': 'ee',
                'value': ee.serializer.toJSON(obj)
            })
        else:
            __bridge_vars.append({
                'name': '${v}',
                'type': 'plain',
                'value': json.dumps(obj)
            })
except:
    pass
`
  )
  .join('')}
`;
}

// Extract variable names from JS source (simple heuristic).
export function extractJSVarNames(
  source: string
): string[] {
  const names = new Set<string>();
  const patterns = [
    /\bvar\s+(\w+)\s*=/g,
    /\blet\s+(\w+)\s*=/g,
    /\bconst\s+(\w+)\s*=/g,
  ];
  for (const pat of patterns) {
    let m;
    while ((m = pat.exec(source)) !== null) {
      if (!m[1].startsWith('_')) {
        names.add(m[1]);
      }
    }
  }
  return [...names];
}

// Extract variable names from Python source.
export function extractPyVarNames(
  source: string
): string[] {
  const names = new Set<string>();
  const pat = /^(\w+)\s*=/gm;
  let m;
  while ((m = pat.exec(source)) !== null) {
    if (
      !m[1].startsWith('_') &&
      m[1] !== 'Map' &&
      m[1] !== 'Export'
    ) {
      names.add(m[1]);
    }
  }
  return [...names];
}
