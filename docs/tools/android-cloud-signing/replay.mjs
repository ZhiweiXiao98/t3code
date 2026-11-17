import fs from 'node:fs';import assert from 'node:assert/strict';import {verifyPartitions} from './partition-contract.mjs';
const input=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));const result=verifyPartitions(input.context,input.receipts);assert.deepEqual(result,input.union);console.log(JSON.stringify(result));
