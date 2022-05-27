import { Expr, FunDef, Program } from './types';

export type Context = Record<string, { kind: 'fun', def: FunDef } | { kind: 'val', value: any } | undefined>

export function programInterp(prog: Program) {
    const ctx: Context = {};
    for (const def of prog.defs) {
        ctx[def.name] = { kind: 'fun', def };
    }
    return interp(prog.main, ctx);
}

function bindPat(pat: string, value: any): Context {
    return { [pat]: { kind: 'val', value } };
}

function interp(e: Expr, ctx: Context): any {
    const v = exprInterp(e, ctx);
    // console.log('step', e);
    // console.log('evaluates to ', v);
    return v;
}

export function exprInterp(e: Expr, ctx: Context): any {
    switch (e.kind) {
        case 'let': {
            const v0 = interp(e.e0, ctx);
            return interp(e.e1, { ...ctx, ...bindPat(e.pat, v0) });
        }
        case 'name': {
            const v = ctx[e.value];
            if (v?.kind === 'val') {
                return v.value;
            }
            throw new Error("Name error " + e.value + ' = ' + v);
        }
        case 'cst':
            return e.value;
        case 'app': {
            const def = ctx[e.f];
            if (def?.kind === 'fun') {
                const vs = e.e0.map((x, i) => [def.def.args[i].name, {kind: 'val', value: interp(x, ctx)}]);
                const ctx0: Context = { ...ctx, ...Object.fromEntries(vs) }
                return interp(def.def.expr, ctx0);
            }
            throw new Error('App error ' + def);
        }
        case 'tup': {
            return e.es.map(e0 => interp(e0, ctx));
        }
        case 'proj': {
            const v0 = interp(e.e, ctx);
            return v0.ts[e.i];
        }
        case 'compr': {
            const v1: any[] = interp(e.e1, ctx);
            return v1.map(v => interp(e.e0, { ...ctx, [e.x]: {kind: 'val', value: v} }));
        }
        case 'cond': {
            const v1: boolean = interp(e.e1, ctx);
            return v1 ? [interp(e.e0, ctx)] : [];
        }
        case 'op': {
            const vArg = interp(e.e0, ctx);
            const v0 = vArg[0];
            const v1 = vArg[1];
            switch (e.op.name) {
                case 'and': return v0 && v1;
                case 'or': return v0 || v1;
                case 'plus': return v0 + v1;
                case 'minus': return v0 - v1;
                case 'times': return v0 * v1;
                case 'div': return v0 / v1;
                case 'mod': return v0 % v1;
                case 'pow': return Math.pow(v0, v1);
                case 'log': return Math.log(vArg);
                case 'sqrt': return Math.sqrt(vArg);
                case 'sin': return Math.sin(vArg);
                case 'cos': return Math.cos(vArg);
                case 'not': return !vArg;
                case 'uminus': return -vArg;
                case 'eq': return v0 === v1;
                case 'neq': return v0 !== v1;
                case 'lt': return v0 < v1;
                case 'gt': return v0 > v1;
                case 'leq': return v0 <= v1;
                case 'geq': return v0 >= v1;
                case 'iota':
                    if(vArg < 0 || !Number.isInteger(vArg))
                        throw new Error('iota error ' + vArg);
                    return [...Array(vArg).keys()];
                case 'mkseq': return vArg;
                case 'empty': return vArg.length === 0;
                case 'the':
                    if (vArg.length === 1)
                        return vArg[0];
                    throw new Error('the error (not unit length) ' + JSON.stringify(vArg));
                case 'append': return v0.concat(v1);
                case 'zip': return v0.map((_: any, i: number) => vArg.map((v: any[]) => v[i]));
                case 'split': split(v0, v1);
                case 'concat': return vArg.flatMap((x: any) => x);
                case 'tab': return vArg;
                case 'seq': return vArg;
                case 'len': return vArg.length;
                case 'elt':
                    if(v1 >= 0 && v1 < v0.length)
                        return v0[v1];
                    throw new Error('elt error (index out of bounds) ' + v0.length + " " + v1);
                case 'reduce':
                    switch (e.op.o.name) {
                        case 'max': return vArg.reduce((a: number, b: number) => a > b ? a : b)
                        case 'min': return vArg.reduce((a: number, b: number) => a < b ? a : b)
                        case 'sum': return vArg.reduce((a: number, b: number) => a + b, 0)
                        case 'prod': return vArg.reduce((a: number, b: number) => a * b, 1)
                        case 'every': return vArg.every((x: boolean) => x)
                        case 'some': return vArg.some((x: boolean) => x)
                    }
                case 'scan':
                    switch (e.op.o.name) {
                        case 'max': return vArg.reduce((a: number, b: number) => a > b ? a : b, 0)
                        case 'min': return vArg.reduce((a: number, b: number) => a < b ? a : b, 0)
                        case 'sum': return vArg.reduce((a: number, b: number) => a + b, 0)
                        case 'prod': return vArg.reduce((a: number, b: number) => a * b, 0)
                        case 'every': return vArg.every((x: boolean) => x)
                        case 'some': return vArg.some((x: boolean) => x)
                    }
            }
        }
    }
}

function split<T>(xs: T[], sep: T): T[][] {
    const result: T[][] = [];
    let tmp: T[] = [];
    for(const x of xs) {
        if(x === sep) {
            result.push(tmp);
            tmp = [];
        }
        else
            tmp.push(x);
    }
    if(xs.length)
        result.push(tmp);

    return result;
}