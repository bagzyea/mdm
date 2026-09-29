/**
 * Cross-language command contract.
 *
 * The backend queued commands the agent had never implemented — WIPE_DEVICE,
 * INSTALL_APP, GRANT_PERMISSIONS, ENFORCE_ENCRYPTION, DETECT_ROOT_STATUS — and each one
 * failed on the tablet as "Unknown command type" after the operator had been told it
 * was sent. The compiler cannot see across the TypeScript/Kotlin boundary, so this test
 * reads the agent's dispatch table directly and compares it with AGENT_COMMANDS.
 */

import * as fs from 'fs';
import * as path from 'path';

import { AGENT_COMMANDS } from '@mdm/shared-types';
import { COMMAND_TYPES } from '../schemas/commandSchemas';

const COMMAND_EXECUTOR = path.resolve(
  __dirname,
  '../../../android-app/app/src/main/java/com/mdm/app/services/CommandExecutor.kt'
);

/** The string labels of the `when (commandType.uppercase())` branches in execute(). */
function agentDispatchLabels(source: string): string[] {
  const start = source.indexOf('when (commandType.uppercase())');
  if (start === -1) {
    throw new Error('CommandExecutor.execute() dispatch not found — has it moved?');
  }
  const body = source.slice(start, source.indexOf('else ->', start));
  const labels: string[] = [];
  for (const branch of body.matchAll(/^\s*((?:"[A-Z_]+"\s*,?\s*)+)->/gm)) {
    labels.push(...[...branch[1]!.matchAll(/"([A-Z_]+)"/g)].map((m) => m[1] as string));
  }
  return labels;
}

describe('command wire contract', () => {
  let labels: string[];

  beforeAll(() => {
    expect(fs.existsSync(COMMAND_EXECUTOR)).toBe(true);
    labels = agentDispatchLabels(fs.readFileSync(COMMAND_EXECUTOR, 'utf8'));
  });

  it('parses a non-trivial dispatch table', () => {
    expect(labels.length).toBeGreaterThan(5);
  });

  it('lists exactly the commands the agent executes', () => {
    expect([...AGENT_COMMANDS].sort()).toEqual([...labels].sort());
  });

  it('accepts at the API edge only commands the agent executes', () => {
    expect([...COMMAND_TYPES].sort()).toEqual([...AGENT_COMMANDS].sort());
  });
});
