import { readFileSync } from 'fs';

import { parseProgram } from './parser';
import { programChecker } from './checker';
import { programInterp } from './interpreter';

import { programCompiler } from './svcode/compiler';
import { svcodeInterp } from './svcode/interpreter';

import { inspect } from 'util'

const f = readFileSync(process.argv[2]).toString();
const p = parseProgram(f);
if (p) {
    try {
        programChecker(p.v);
        console.log('checked ok');
        console.log(inspect(p.v, { depth: 100, colors: true }));

        const compiled = programCompiler(p.v);
        console.log('SVCODE:')
        console.log(inspect(compiled, { depth: 100, colors: true }));
        console.log('EXEC')
        console.time('svcode');
        svcodeInterp(compiled.code, compiled.value).then(ctx => {
            console.timeEnd('svcode');
            console.log(inspect(ctx, { depth: 100, colors: true }));

            console.time('high-level');
            const result = programInterp(p.v);
            console.timeEnd('high-level');
            console.log('Result is', result);

        });
    }
    catch (e) {
        console.error(e);
    }
}
else {
    console.log('no parse');
}