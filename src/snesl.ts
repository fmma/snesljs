import { readFileSync } from 'fs';

import { parseProgram } from './parser-alt';
import { programChecker } from './checker';
import { programInterp } from './interpreter';

import { programCompiler } from './svcode/compiler';
import { reifyResult, svcodeInterp } from './svcode/interpreter';

import { inspect } from 'util'
import { svcodePretty, valuePretty } from './svcode/pretty-printer';
import { desugarProgram } from './desugar';

const f = readFileSync(process.argv[2]).toString();
const p = parseProgram(f);

function log(...xs: any[]) {
    console.log(...xs.map(x => {
        const tmp = inspect(x, { depth: 100, colors: true });
        const N = 5000;
        if (tmp.length > N)
            return '<VALUE TO BIG TO PRINT>'
        return tmp;
    }));
}

async function main() {
    if (p) {
        try {
            programChecker(p.v);
            desugarProgram(p.v);
            console.log('checked ok');
            console.log(inspect(p.v, { depth: 100, colors: true }));

            const compiled = programCompiler(p.v);
            console.log('SVCODE:')
            console.log(svcodePretty(compiled.code, compiled.value));
            console.log('EXEC')
            console.time('svcode');
            const llResult = await svcodeInterp(compiled.code, compiled.value);
            console.timeEnd('svcode');
            console.log(valuePretty(llResult, xs => xs.map(x => x == null ? '.' : String(x)).join(' ')));
            const reified = reifyResult(llResult);
            log('Result is', reified[0]);

            console.time('high-level');
            const hlResult = programInterp(p.v);
            console.timeEnd('high-level');
            log('Result is', hlResult);
            if (JSON.stringify(reified) === JSON.stringify([hlResult])) {
                console.log('OK RESULTS MATCH!')
            }
            else {
                console.log('ERROR RESULTS DO NOT MATCH!')
            }
        }
        catch (e) {
            console.error(e);
        }
    }
    else {
        console.log('no parse');
    }
}

main();