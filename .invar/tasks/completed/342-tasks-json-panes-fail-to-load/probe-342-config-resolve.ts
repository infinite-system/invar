// probe-tasks-config.ts — what does TaskConfiguration.resolve return for THIS repo's
// .invar/tasks.json right now? Run: bun tmp/probe-tasks-config.ts
import { TaskConfiguration } from '../src/modules/tasks/TaskConfiguration';
const result = TaskConfiguration.Class.resolve(
  '/home/parallels/dev/invar',
  null,
);
console.log(JSON.stringify(result, null, 2));
