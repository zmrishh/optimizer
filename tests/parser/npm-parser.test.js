import { parseNpmLockfile } from '../../src/parser/npm-parser.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('npm-parser', () => {
  it('should parse a v2/v3 package-lock.json correctly', async () => {
    const fixtureDir = path.join(__dirname, 'fixtures', 'mock-project');
    const result = await parseNpmLockfile(fixtureDir);

    expect(result.has('lodash')).toBe(true);
    
    const lodashData = result.get('lodash');
    expect(lodashData.versions.has('4.17.21')).toBe(true);
    expect(lodashData.versions.has('4.17.19')).toBe(true);
    
    // Total instances should be 2
    expect(lodashData.instances.length).toBe(2);
  });
});
