const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const fsUtils = require('../../services/fsUtils');
const actions = require('../../services/actions');

describe('3-Tier Clean Move Architecture Suite', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agy-move-test-'));
  });

  afterEach(() => {
    try {
      if (tmpDir && fs.existsSync(tmpDir)) {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    } catch (_) {}
  });

  test('getMoveDestinations rejects built-in components', () => {
    const res = fsUtils.getMoveDestinations({
      itemId: 'builtin-skill',
      category: 'skill',
      physicalPath: path.join(fsUtils.getBuiltinPath(), 'skills', 'test')
    }, [], 'en');

    assert.strictEqual(res.success, false);
    assert.strictEqual(res.isProtected, true);
  });

  test('getMoveDestinations resolves destinations for skill', () => {
    const ws1 = path.join(tmpDir, 'project-a');
    fs.mkdirSync(ws1, { recursive: true });

    const skillPath = path.join(tmpDir, 'my-skill');
    fs.mkdirSync(skillPath, { recursive: true });
    fs.writeFileSync(path.join(skillPath, 'SKILL.md'), '---\nname: my-skill\n---');

    const res = fsUtils.getMoveDestinations({
      itemId: 'my-skill',
      category: 'skill',
      physicalPath: skillPath
    }, [ws1], 'en');

    assert.strictEqual(res.success, true);
    assert(Array.isArray(res.destinations));
    assert(res.destinations.length > 0);
    const hasWorkspace = res.destinations.some(d => d.type === 'workspace');
    assert.strictEqual(hasWorkspace, true);
  });

  test('actions.moveItem moves skill and detects conflict', async () => {
    const srcDir = path.join(tmpDir, 'source');
    const destDir = path.join(tmpDir, 'target');
    fs.mkdirSync(srcDir, { recursive: true });
    fs.mkdirSync(destDir, { recursive: true });

    const skillFolder = path.join(srcDir, 'demo-skill');
    fs.mkdirSync(skillFolder, { recursive: true });
    fs.writeFileSync(path.join(skillFolder, 'SKILL.md'), 'test skill');

    // First move: should succeed
    const res1 = await actions.moveItem(skillFolder, destDir, { overwrite: false });
    assert.strictEqual(res1.success, true);
    assert.strictEqual(fs.existsSync(path.join(destDir, 'demo-skill', 'SKILL.md')), true);
    assert.strictEqual(fs.existsSync(skillFolder), false);

    // Recreate source to test collision
    fs.mkdirSync(skillFolder, { recursive: true });
    fs.writeFileSync(path.join(skillFolder, 'SKILL.md'), 'test skill v2');

    // Move without overwrite: conflict
    const resConflict = await actions.moveItem(skillFolder, destDir, { overwrite: false });
    assert.strictEqual(resConflict.success, false);
    assert.strictEqual(resConflict.conflict, true);

    // Move with overwrite: success
    const resOverwrite = await actions.moveItem(skillFolder, destDir, { overwrite: true });
    assert.strictEqual(resOverwrite.success, true);
    assert.strictEqual(fs.readFileSync(path.join(destDir, 'demo-skill', 'SKILL.md'), 'utf8'), 'test skill v2');
  });

  test('actions.moveItem moves MCP server between configs', async () => {
    const srcJson = path.join(tmpDir, 'src_mcp.json');
    const tgtJson = path.join(tmpDir, 'tgt_mcp.json');

    fs.writeFileSync(srcJson, JSON.stringify({
      mcpServers: {
        'test-mcp': { command: 'node', args: ['index.js'] }
      }
    }, null, 2));

    fs.writeFileSync(tgtJson, JSON.stringify({
      mcpServers: {}
    }, null, 2));

    const res = await actions.moveItem(srcJson, tgtJson, {
      category: 'mcp',
      itemId: 'test-mcp'
    });

    assert.strictEqual(res.success, true);
    const srcData = JSON.parse(fs.readFileSync(srcJson, 'utf8'));
    const tgtData = JSON.parse(fs.readFileSync(tgtJson, 'utf8'));

    assert.strictEqual(srcData.mcpServers['test-mcp'], undefined);
    assert.deepStrictEqual(tgtData.mcpServers['test-mcp'], { command: 'node', args: ['index.js'] });
  });

  test('actions.moveItem moves Hook between configs', async () => {
    const srcJson = path.join(tmpDir, 'src_hooks.json');
    const tgtJson = path.join(tmpDir, 'tgt_hooks.json');

    fs.writeFileSync(srcJson, JSON.stringify({
      'test-hook': { command: 'echo test', event: 'post-commit' }
    }, null, 2));

    fs.writeFileSync(tgtJson, JSON.stringify({}, null, 2));

    const res = await actions.moveItem(srcJson, tgtJson, {
      category: 'hook',
      itemId: 'test-hook'
    });

    assert.strictEqual(res.success, true);
    const srcData = JSON.parse(fs.readFileSync(srcJson, 'utf8'));
    const tgtData = JSON.parse(fs.readFileSync(tgtJson, 'utf8'));

    assert.strictEqual(srcData['test-hook'], undefined);
    assert.deepStrictEqual(tgtData['test-hook'], { command: 'echo test', event: 'post-commit' });
  });
});
