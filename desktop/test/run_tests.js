/**
 * run_tests.js — Standalone E2E CLI Test Runner
 *
 * Runs test suites across Tiers 1-4 with support for:
 *   --tier=<1|2|3|4>     Run specific tier
 *   --filter=<pattern>   Filter tests by substring or regex
 *   --verbose            Detailed per-test output
 *   --json               Output JSON test report
 */

const path = require('path');
const fs = require('fs');

// ANSI escape codes for clean terminal output
const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m'
};

// Global test registry
const registry = {
  suites: [],
  currentSuite: null
};

function describe(suiteName, fn) {
  const suite = {
    name: suiteName,
    tests: [],
    beforeEachHooks: [],
    afterEachHooks: []
  };
  registry.suites.push(suite);
  registry.currentSuite = suite;
  fn();
  registry.currentSuite = null;
}

function test(testName, fn) {
  if (!registry.currentSuite) {
    throw new Error(`test("${testName}") must be defined inside a describe() block`);
  }
  registry.currentSuite.tests.push({
    name: testName,
    fn
  });
}

function it(testName, fn) {
  test(testName, fn);
}

function beforeEach(fn) {
  if (!registry.currentSuite) {
    throw new Error('beforeEach must be inside describe()');
  }
  registry.currentSuite.beforeEachHooks.push(fn);
}

function afterEach(fn) {
  if (!registry.currentSuite) {
    throw new Error('afterEach must be inside describe()');
  }
  registry.currentSuite.afterEachHooks.push(fn);
}

// Expose globals for test suites
global.describe = describe;
global.test = test;
global.it = it;
global.beforeEach = beforeEach;
global.afterEach = afterEach;

// Parse CLI arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    tier: null,
    filter: null,
    verbose: false,
    json: false
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--tier=')) {
      options.tier = arg.split('=')[1];
    } else if (arg === '--tier' && i + 1 < args.length) {
      options.tier = args[++i];
    } else if (arg.startsWith('--filter=')) {
      options.filter = arg.split('=')[1];
    } else if (arg === '--filter' && i + 1 < args.length) {
      options.filter = args[++i];
    } else if (arg === '--verbose' || arg === '-v') {
      options.verbose = true;
    } else if (arg === '--json') {
      options.json = true;
    }
  }

  return options;
}

async function run() {
  const options = parseArgs();

  // Determine suite files to load
  const testDir = __dirname;
  const suiteFiles = [
    { tier: '1', file: 'tier1_features.test.js' },
    { tier: '2', file: 'tier2_boundary.test.js' },
    { tier: '3', file: 'tier3_combinations.test.js' },
    { tier: '4', file: 'tier4_scenarios.test.js' }
  ];

  const targetFiles = suiteFiles.filter((s) => {
    if (options.tier && s.tier !== String(options.tier)) {
      return false;
    }
    return true;
  });

  if (!options.json) {
    console.log(`\n${colors.bold}${colors.cyan}============================================================${colors.reset}`);
    console.log(`${colors.bold}${colors.cyan}   Antigravity Plugin Manager Desktop — E2E Test Runner    ${colors.reset}`);
    console.log(`${colors.cyan}============================================================${colors.reset}\n`);
    if (options.tier) {
      console.log(`${colors.yellow}Targeting Tier ${options.tier} only${colors.reset}`);
    }
    if (options.filter) {
      console.log(`${colors.yellow}Filtering tests matching: "${options.filter}"${colors.reset}`);
    }
  }

  // Load target suite files
  for (const item of targetFiles) {
    const fullPath = path.join(testDir, item.file);
    if (fs.existsSync(fullPath)) {
      require(fullPath);
    } else if (!options.json) {
      console.log(`${colors.yellow}Warning: Test file not found: ${item.file}${colors.reset}`);
    }
  }

  const results = {
    totalSuites: registry.suites.length,
    totalTests: 0,
    passed: 0,
    failed: 0,
    skipped: 0,
    startTime: Date.now(),
    durationMs: 0,
    suiteResults: []
  };

  const filterRegex = options.filter ? new RegExp(options.filter, 'i') : null;

  for (const suite of registry.suites) {
    const suiteResult = {
      name: suite.name,
      passed: 0,
      failed: 0,
      skipped: 0,
      tests: []
    };

    if (!options.json) {
      console.log(`${colors.bold}${colors.blue}▶ Suite: ${suite.name}${colors.reset}`);
    }

    for (const testCase of suite.tests) {
      if (filterRegex && !filterRegex.test(testCase.name) && !filterRegex.test(suite.name)) {
        suiteResult.skipped++;
        results.skipped++;
        continue;
      }

      results.totalTests++;
      const testStart = Date.now();
      let testPassed = false;
      let error = null;

      try {
        // Run beforeEach hooks
        for (const hook of suite.beforeEachHooks) {
          await hook();
        }

        // Run test function
        await testCase.fn();
        testPassed = true;
      } catch (err) {
        testPassed = false;
        error = err;
      } finally {
        // Run afterEach hooks
        for (const hook of suite.afterEachHooks) {
          try {
            await hook();
          } catch (hookErr) {
            if (testPassed) {
              testPassed = false;
              error = hookErr;
            }
          }
        }
      }

      const testDuration = Date.now() - testStart;

      if (testPassed) {
        suiteResult.passed++;
        results.passed++;
        if (!options.json) {
          if (options.verbose) {
            console.log(`  ${colors.green}✓${colors.reset} ${testCase.name} ${colors.dim}(${testDuration}ms)${colors.reset}`);
          } else {
            process.stdout.write(`${colors.green}.${colors.reset}`);
          }
        }
      } else {
        suiteResult.failed++;
        results.failed++;
        if (!options.json) {
          if (!options.verbose) {
            process.stdout.write('\n');
          }
          console.log(`  ${colors.red}✗ ${testCase.name}${colors.reset} ${colors.dim}(${testDuration}ms)${colors.reset}`);
          console.log(`    ${colors.red}Error: ${error.message}${colors.reset}`);
          if (error.stack) {
            const stackLines = error.stack.split('\n').slice(1, 4).join('\n');
            console.log(`    ${colors.gray}${stackLines}${colors.reset}`);
          }
        }
      }

      suiteResult.tests.push({
        name: testCase.name,
        passed: testPassed,
        durationMs: testDuration,
        error: error ? error.message : null
      });
    }

    if (!options.json && !options.verbose) {
      process.stdout.write('\n');
    }

    results.suiteResults.push(suiteResult);
  }

  results.durationMs = Date.now() - results.startTime;

  if (options.json) {
    console.log(JSON.stringify(results, null, 2));
  } else {
    console.log(`\n${colors.cyan}------------------------------------------------------------${colors.reset}`);
    console.log(`${colors.bold}Execution Summary:${colors.reset}`);
    console.log(`  Suites:   ${results.totalSuites}`);
    console.log(`  Total:    ${results.totalTests}`);
    console.log(`  Passed:   ${colors.green}${results.passed}${colors.reset}`);
    console.log(`  Failed:   ${results.failed > 0 ? colors.red : colors.reset}${results.failed}${colors.reset}`);
    console.log(`  Skipped:  ${results.skipped}`);
    console.log(`  Duration: ${(results.durationMs / 1000).toFixed(2)}s`);
    console.log(`${colors.cyan}------------------------------------------------------------${colors.reset}`);

    if (results.failed === 0 && results.totalTests > 0) {
      console.log(`\n${colors.bold}${colors.green}✓ ALL TESTS PASSED SUCCESSFULLY!${colors.reset}\n`);
    } else if (results.totalTests === 0) {
      console.log(`\n${colors.bold}${colors.yellow}⚠ NO TESTS EXECUTED${colors.reset}\n`);
    } else {
      console.log(`\n${colors.bold}${colors.red}✗ SOME TESTS FAILED (${results.failed})${colors.reset}\n`);
    }
  }

  process.exit(results.failed > 0 ? 1 : 0);
}

if (require.main === module) {
  run().catch((err) => {
    console.error('Fatal test runner error:', err);
    process.exit(1);
  });
}

module.exports = {
  describe,
  test,
  it,
  run
};
