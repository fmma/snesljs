import { isPrimitive, Type, Expr, FunDef, mkType, isConcrete, FunDefType, Program, mkConcreteType, PrimType } from './types';

export type Context = Record<string, { kind: 'fun', def: FunDef } | { kind: 'typ', t: Type } | undefined>

export const numType = mkConcreteType({ kind: 'prim', t: 'num' });
export const boolType = mkConcreteType({ kind: 'prim', t: 'bool' });
export const charType = mkConcreteType({ kind: 'prim', t: 'char' });

export function funDefChecker(def: FunDef, ctx: Context) {
    const ctx0: Context = {
        ...ctx,
        ...Object.fromEntries(def.args.map(x => [x.name, { kind: 'typ', t: x.type }]))
    };
    const t = exprChecker(def.expr, ctx0);
    typeEquals([def.outType], [t]);
}

export function programChecker(prog: Program) {
    const ctx: Context = {};
    for (const def of prog.defs) {
        funDefChecker(def, ctx);
        ctx[def.name] = { kind: 'fun', def };
    }
    exprChecker(prog.main, ctx);
}

export function exprChecker(e: Expr, ctx: Context): Type {
    switch (e.kind) {
        case 'let': {
            const t0 = exprChecker(e.e0, ctx);
            return exprChecker(e.e1, { ...ctx, ...bindPat(e.pat, t0) });
        }
        case 'name': {
            const t0 = ctx[e.value];
            if (t0?.kind === 'typ') {
                e.t = t0.t;
                return t0.t;
            }
            throw new Error("Name error " + e.value + ' = ' + t0);
        }
        case 'cst': {
            const t = cstType(e.value);
            e.t = t;
            return mkType({ kind: 'prim', t });
        }
        case 'app': {
            const t0 = ctx[e.f];
            if (t0?.kind === 'fun') {
                const ts0 = t0.def.args.map(x => x.type);
                const ts1 = e.e0.map(x => exprChecker(x, ctx));
                typeEquals(ts0, ts1);
                return t0.def.outType;
            }
            throw new Error('App error ' + t0);
        }
        case 'tup': {
            const ts = e.es.map(e0 => exprChecker(e0, ctx));
            return mkType({ kind: 'tup', ts });
        }
        case 'proj': {
            const t0 = exprChecker(e.e, ctx);
            if (t0.kind === 'tup' && e.i >= 0 && e.i < t0.ts.length) {
                return t0.ts[e.i];
            }
            throw new Error('Projection error ' + e);
        }
        case 'compr': {
            const ts = e.using.map(x => {
                const t0 = ctx[x.name];
                if (t0?.kind === 'typ' && isConcrete(t0.t)) {
                    x.t = t0.t;
                    return [x.name, { kind: 'typ', t: t0.t }];
                }
                throw new Error('Non-concrete type in using ' + e);
            });
            const ctx0: Context = Object.fromEntries([...ts, ...Object.entries(ctx).filter(([x, v]) => v?.kind === 'fun')]);
            console.log(ctx0);
            const t1 = exprChecker(e.e1, ctx);
            if (t1.kind === 'seq') {
                ctx0[e.x] = { kind: 'typ', t: t1.t };
                const t0 = exprChecker(e.e0, ctx0);
                return mkType({ kind: 'seq', t: t0 });
            }
            throw new Error('Comprehension error (not sequence) ' + e)
        }
        case 'cond': {
            const ts = e.using.map(x => {
                const t0 = ctx[x.name];
                if (t0?.kind === 'typ') {
                    x.t = t0.t;
                    return [x.name, { kind: 'typ', t: t0.t }];
                }
                throw new Error('Non-concrete type in using ' + e);
            });
            const ctx0 = Object.fromEntries([...ts, ...Object.entries(ctx).filter(([x, v]) => v?.kind === 'fun')]);
            const t1 = exprChecker(e.e1, ctx);
            typeEquals([t1], [boolType]);
            const t0 = exprChecker(e.e0, ctx0);
            return mkType({ kind: 'seq', t: t0 });
        }
        case 'op': {
            const tArg = exprChecker(e.e0, ctx);
            const ts = tArg.kind === 'tup' ? tArg.ts : [tArg];
            const t0 = ts[0];
            switch (e.op.name) {
                case 'and': case 'or':
                    typeEquals(ts, [boolType, boolType]);
                    return boolType;
                case 'plus': case 'minus': case 'times': case 'div': case 'mod': case 'pow':
                    typeEquals(ts, [numType, numType]);
                    return numType;
                case 'log': case 'sqrt': case 'sin': case 'cos':
                    typeEquals(ts, [numType]);
                    return numType;
                case 'not':
                    typeEquals(ts, [boolType]);
                    return boolType;
                case 'uminus':
                    typeEquals(ts, [numType]);
                    return numType;
                case 'eq': case 'neq': case 'lt': case 'gt': case 'leq': case 'geq':
                    typeEquals(ts, [t0, t0]);
                    if (isPrimitive(t0)) {
                        e.op.t = t0.t;
                        return t0;
                    }
                    throw new Error('Comparison error ' + t0);
                case 'iota':
                    typeEquals(ts, [numType]);
                    return mkType({ kind: 'seq', t: t0 });
                case 'mkseq':
                    {
                        const n = ts.length;
                        const t = t0 ?? e.op.t;
                        if (t == null)
                            throw new Error('mkseq error (no type)');
                        typeEquals(ts, Array(n).fill(t));
                        e.op.n = n;
                        e.op.t = t;
                        return mkType({ kind: 'seq', t });
                    }
                case 'empty':
                    {
                        if (t0?.kind === 'seq') {
                            typeEquals(ts, [t0]);
                            e.op.t = t0.t;
                            return boolType;
                        }
                        throw new Error('empty error (not sequence)');
                    }
                case 'the':
                    {
                        if (t0?.kind === 'seq') {
                            typeEquals(ts, [t0]);
                            e.op.t = t0.t;
                            return t0.t;
                        }
                        throw new Error('empty error (not sequence)');
                    }
                case 'append':
                    {
                        if (t0?.kind === 'seq') {
                            typeEquals(ts, [t0, t0]);
                            e.op.t = t0.t;
                            return t0;
                        }
                        throw new Error('append error (not sequence)');
                    }
                case 'zip':
                    {
                        const n = ts.length;
                        const ts0 = ts.map(x => {
                            if (x.kind === 'seq')
                                return x.t;
                            throw new Error('zip error (not sequence)');
                        })
                        e.op.ts = ts0;
                        return mkType({ kind: 'tup', ts: ts0 });
                    }
                case 'split':
                    {
                        if (t0?.kind === 'seq') {
                            typeEquals(ts, [t0, t0.t]);
                            e.op.t = t0.t;
                            return mkType({ kind: 'seq', t: t0 });
                        }
                    }
                case 'concat':
                    {
                        if (t0?.kind === 'seq' && t0.t.kind === 'seq') {
                            typeEquals(ts, [t0]);
                            e.op.t = t0.t.t;
                            return t0.t;
                        }
                        throw new Error('concat error (not sequence)');
                    }
                case 'tab':
                    {
                        if (t0?.kind === 'seq' && isConcrete(t0.t)) {
                            typeEquals(ts, [t0]);
                            e.op.t = t0.t;
                            return mkType({ kind: 'arr', t: t0.t });
                        }
                        throw new Error('tab error (not sequence)');
                    }
                case 'seq':
                    {
                        if (t0?.kind === 'arr' && isConcrete(t0.t)) {
                            typeEquals(ts, [t0]);
                            e.op.t = t0.t;
                            return mkType({ kind: 'seq', t: t0.t });
                        }
                        throw new Error('seq error (not array)');
                    }
                case 'len':
                    {
                        if (t0?.kind === 'arr' && isConcrete(t0.t)) {
                            typeEquals(ts, [t0]);
                            e.op.t = t0.t;
                            return numType;
                        }
                        throw new Error('len error (not array)');
                    }
                case 'elt':
                    {
                        if (t0?.kind === 'arr' && isConcrete(t0.t)) {
                            typeEquals(ts, [t0, numType]);
                            e.op.t = t0.t;
                            return t0.t;
                        }
                        throw new Error('elt error (not array)');
                    }
                case 'reduce':
                    {
                        if (t0?.kind === 'seq' && isPrimitive(t0.t)) {
                            switch (e.op.o.name) {
                                case 'max': case 'min':
                                    typeEquals(ts, [t0]);
                                    e.op.o.t = t0.t.t;
                                    return t0.t;
                                case 'sum': case 'prod':
                                    typeEquals(ts, [mkType({ kind: 'seq', t: numType })]);
                                    return numType;
                                case 'every': case 'some':
                                    typeEquals(ts, [mkType({ kind: 'seq', t: boolType })]);
                                    return boolType;
                            }
                        }
                        throw new Error('reduce error (not sequence) ' + JSON.stringify(t0));
                    }
                case 'scan':
                    {
                        if (t0?.kind === 'seq' && isPrimitive(t0.t)) {
                            switch (e.op.o.name) {
                                case 'max': case 'min':
                                    typeEquals(ts, [t0]);
                                    e.op.o.t = t0.t.t;
                                    return t0;
                                case 'sum': case 'prod':
                                    typeEquals(ts, [mkType({ kind: 'seq', t: numType })]);
                                    return t0;
                                case 'every': case 'some':
                                    typeEquals(ts, [mkType({ kind: 'seq', t: boolType })]);
                                    return t0;
                            }
                        }
                        throw new Error('reduce error (not sequence)');
                    }
            }
        }
    }
}

function cstType(val: any): PrimType {
    switch (typeof val) {
        case 'number': return 'num';
        case 'boolean': return 'bool';
        case 'string': return 'char';
        default: throw new Error("Constant error " + val);
    }
}

function bindPat(pat: string, t0: Type): Context {
    return { [pat]: { kind: 'typ', t: t0 } };
}

function typeEquals(ts0: Type[], ts1: Type[]) {
    const json0 = JSON.stringify(ts0);
    const json1 = JSON.stringify(ts1);
    if (json0 !== json1)
        throw new Error(`Type equality check failed ${json0} != ${json1}`);
}

