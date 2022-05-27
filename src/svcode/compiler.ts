import { FunDef, Expr, ConcreteType, UsingName, Type, Program } from '../types';
import { Value, PrimType, mkValue, MapOp, ReduceOp } from './types';
import { Gen, ret, bind, emit, seq } from './gen-monad';

export type Context = Record<string, { kind: 'fun', def: FunDef } | { kind: 'val', val: Value } | undefined>

export function programCompiler(prog: Program) {
    const ctx: Context = {};
    for (const def of prog.defs) {
        ctx[def.name] = { kind: 'fun', def };
    }

    return exprCompiler(prog.main, ctx, "ctrl")(0);
}

function _unreachable(...xs: any[]): never {
    throw new Error(`${xs.map(x => String(x)).join(' ')} error (unreachable for well-typed expr)`);
}

function bindPat(pat: string, val: Value): Context {
    return { [pat]: { kind: 'val', val } };
}

function iotas(ssd: string) {
    return emit({
        op: { name: 'iotas' },
        args: [ssd]
    });
}

function reduce(ssd: string, s: string, op: ReduceOp) {
    return emit({
        op: { name: 'reduce', op },
        args: [ssd, s]
    });
}

function scan(ssd: string, s: string, op: ReduceOp) {
    return emit({
        op: { name: 'scan', op },
        args: [ssd, s]
    });
}

function rep(ctrl: string, value: any, t: PrimType) {
    return emit({
        op: { name: 'rep', value, t },
        args: [ctrl]
    });
}

function map(op: MapOp, ...ss: string[]) {
    return emit({
        op: { name: 'map', op },
        args: ss
    });
}

function ssd_to_ctrl(s: string) {
    return emit({
        op: { name: 'ssd_to_ctrl' },
        args: [s]
    });
}

function dist(ssd: string, s: string, t: PrimType) {
    return emit({
        op: { name: 'dist', t },
        args: [ssd, s]
    });
}

function pack(flags: string, s: string, t: PrimType) {
    return emit({
        op: { name: 'pack', t },
        args: [flags, s]
    });
}

function ssd_pack(flags: string, ssd: string) {
    return emit({
        op: { name: 'ssd_pack' },
        args: [flags, ssd]
    });
}

function bool_to_ssd(flags: string) {
    return emit({
        op: { name: 'bool_to_ssd' },
        args: [flags]
    });
}

function num_to_ssd(nums: string) {
    return emit({
        op: { name: 'num_to_ssd' },
        args: [nums]
    });
}

function distCompiler(t: ConcreteType, v: Value, ssd: string): Gen<Value> {
    switch (t.kind) {
        case 'prim': if (v.kind !== 'sid') _unreachable('distCompiler');
            return bind(dist(ssd, v.sid, t.t), sid => ret(mkValue({ kind: 'sid', sid, t: t.t })));

        case 'tup': if (v.kind !== 'tup') _unreachable('distCompiler');
            return bind(
                seq(t.ts.map((t0, i) => distCompiler(t0, v.sts[i], ssd))),
                sts => ret(mkValue({ kind: 'tup', sts }))
            )

        case 'arr': if (v.kind !== 'sa') _unreachable('distCompiler');
            return bind(
                dist(ssd, v.asd, 'ssa'),
                sid => ret(mkValue({ kind: 'sa', asd: sid, v: mkValue({ kind: 'sid', sid, t: 'ssa' }) }))
            );
    }
}

function packCompiler(t: Type, v: Value, flags: string): Gen<Value> {
    switch (t.kind) {
        case 'prim': if (v.kind !== 'sid') _unreachable('packCompiler');
            return bind(pack(flags, v.sid, t.t), sid => ret(mkValue({ kind: 'sid', sid, t: t.t })));

        case 'tup': if (v.kind !== 'tup') _unreachable('packCompiler');
            return bind(
                seq(t.ts.map((t0, i) => packCompiler(t0, v.sts[i], flags))),
                sts => ret(mkValue({ kind: 'tup', sts }))
            );

        case 'arr': if (v.kind !== 'sa') _unreachable('packCompiler');
            return bind(
                pack(flags, v.asd, 'ssa'),
                sid => ret(mkValue({ kind: 'sa', asd: sid, v: mkValue({ kind: 'sid', sid, t: 'ssa' }) }))
            );

        case 'seq': if (v.kind !== 'ss') _unreachable('packCompiler');
            return bind(
                dist(v.ssd, flags, "bool"),
                flags0 => bind(
                    packCompiler(t.t, v.v, flags0),
                    v0 => bind(
                        ssd_pack(flags, v.ssd),
                        ssd0 => ret(mkValue({ kind: 'ss', ssd: ssd0, v: v0 }))
                    )
                )
            )
    }
}

export function exprCompiler(e: Expr, ctx: Context, ctrl: string): Gen<Value> {
    switch (e.kind) {
        case 'name':
            const x = ctx[e.value];
            if (x?.kind !== 'val') _unreachable('name', e.value, '=', x);

            return ret(x.val);
        case 'cst': return bind(rep(ctrl, e.value, e.t!), sid => ret(mkValue({ kind: 'sid', sid, t: e.t! })));
        case 'tup':
            return bind(
                seq(e.es.map(e0 => exprCompiler(e0, ctx, ctrl))),
                sts => {
                    return ret({ kind: 'tup', sts })
                }
            );
        case 'proj':
            return bind(
                exprCompiler(e.e, ctx, ctrl),
                st => {
                    if (st.kind !== 'tup') _unreachable('proj');

                    return ret(st.sts[e.i]);
                }
            );
        case 'let':
            return bind(
                exprCompiler(e.e0, ctx, ctrl),
                st => exprCompiler(e.e1, { ...ctx, ...bindPat(e.pat, st) }, ctrl)
            );
        case 'compr':
            return bind(
                exprCompiler(e.e1, ctx, ctrl),
                v1 => {
                    if (v1.kind !== 'ss') _unreachable('compr');;

                    return bind(
                        ssd_to_ctrl(v1.ssd),
                        ctrl0 => bind(
                            usingDistCompiler(ctx, e.using, v1.ssd, e.x, v1.v),
                            ctx0 => bind(
                                exprCompiler(e.e0, ctx0, ctrl0),
                                v0 => ret(mkValue({ kind: 'ss', ssd: v1.ssd, v: v0 }))
                            )
                        )
                    )
                }
            );
        case 'cond':
            return bind(
                exprCompiler(e.e1, ctx, ctrl),
                v1 => {
                    if (v1.kind !== 'sid') _unreachable('cond');

                    return bind(
                        bool_to_ssd(v1.sid),
                        ssd => bind(
                            ssd_to_ctrl(ssd),
                            ctrl0 => bind(
                                usingPackCompiler(ctx, e.using, v1.sid),
                                ctx0 => bind(
                                    exprCompiler(e.e0, ctx0, ctrl0),
                                    v0 => ret(mkValue({ kind: 'ss', ssd: ssd, v: v0 }))
                                )
                            )
                        )
                    )
                }
            );
        case 'app':
            const def = ctx[e.f];
            if (def?.kind !== 'fun') _unreachable('app', e.f, '=', def);

            return bind(
                seq(e.e0.map(ei => exprCompiler(ei, ctx, ctrl))),
                sts => {
                    const ctx0: Context = { ...ctx, ...Object.fromEntries(sts.map((st, i) => [def.def.args[i].name, { kind: 'val', val: st }])) }
                    console.log(ctx0);
                    return exprCompiler(def.def.expr, ctx0, ctrl);
                }
            )
        case 'op': {
            return bind(
                exprCompiler(e.e0, ctx, ctrl),
                st0 => {
                    switch (e.op.name) {
                        case 'plus': case 'minus': case 'times': case 'div': case 'mod': case 'and': case 'or': case 'pow': {
                            if (st0.kind !== 'tup' || st0.sts[0].kind !== 'sid' || st0.sts[1].kind !== 'sid') _unreachable(e.op.name)
                            const s0 = st0.sts[0];
                            const s1 = st0.sts[1];
                            return bind(map({ name: e.op.name }, s0.sid, s1.sid), sid => ret(mkValue({ kind: 'sid', sid, t: s0.t })));
                        }

                        case 'log': case 'sqrt': case 'sin': case 'cos': case 'uminus': case 'not':
                            if (st0.kind !== 'sid') _unreachable(e.op.name)

                            return bind(map({ name: e.op.name }, st0.sid), sid => ret(mkValue({ kind: 'sid', sid, t: st0.t })));

                        case 'eq': case 'neq': case 'lt': case 'gt': case 'leq': case 'geq':
                            if (st0.kind !== 'tup' || st0.sts[0].kind !== 'sid' || st0.sts[1].kind !== 'sid') _unreachable(e.op.name)

                            return bind(map({ name: e.op.name, t: e.op.t }, st0.sts[0].sid, st0.sts[1].sid), sid => ret(mkValue({ kind: 'sid', sid, t: 'bool' })));

                        case 'iota':
                            if (st0.kind !== 'sid') _unreachable('iota');

                            return bind(
                                num_to_ssd(st0.sid),
                                ssd => bind(
                                    iotas(ssd),
                                    sid => ret(mkValue({ kind: 'ss', ssd, v: { kind: 'sid', sid, t: 'num' } }))
                                )
                            );

                        case 'reduce': {
                            const op = e.op.o;

                            if (st0.kind !== 'ss' || st0.v.kind !== 'sid') _unreachable(op.name);

                            const { ssd, v: { sid } } = st0;

                            switch (op.name) {
                                case 'sum': case 'prod': case 'every': case 'some':
                                    return bind(reduce(ssd, sid, { name: op.name }), sid => ret(mkValue({ kind: 'sid', sid, t: 'num' })));

                                case 'max': case 'min':
                                    if (st0.kind !== 'ss' || st0.v.kind !== 'sid') _unreachable(op.name);

                                    return bind(reduce(ssd, sid, { name: op.name, t: op.t }), sid => ret(mkValue({ kind: 'sid', sid, t: 'bool' })));


                            }
                        }

                        case 'scan': {
                            const op = e.op.o;

                            if (st0.kind !== 'ss' || st0.v.kind !== 'sid') _unreachable(op.name);

                            const { ssd, v: { sid } } = st0;

                            switch (op.name) {
                                case 'sum': case 'prod': case 'every': case 'some':
                                    return bind(scan(ssd, sid, { name: op.name }), sid => ret(mkValue({ kind: 'ss', ssd, v: { kind: 'sid', sid, t: 'num' } })));

                                case 'max': case 'min':
                                    if (st0.kind !== 'ss' || st0.v.kind !== 'sid') _unreachable(op.name);

                                    return bind(scan(ssd, sid, { name: op.name, t: op.t }), sid => ret(mkValue({ kind: 'ss', ssd, v: { kind: 'sid', sid, t: 'bool' } })));

                            }
                        }
                    }
                    throw new Error('Not implemented yet ' + e.op.name);
                }
            );
        }
    }
}

function usingDistCompiler(ctx: Context, using: UsingName<ConcreteType>[], ssd: string, x: string, val: Value): Gen<Context> {
    const ctx0: Context = { [x]: { kind: 'val', val } }
    const gens = using.map(x => {
        const v0 = ctx[x.name];
        if (v0?.kind !== 'val') _unreachable('usingDistCompiler');

        return distCompiler(x.t!, v0.val, ssd)
    });
    return bind(
        seq(gens),
        v => {
            for (let i = 0; i < v.length; ++i) {
                const x = using[i];
                ctx0[x.name] = { kind: 'val', val: v[i] };
            }
            return ret({ ...ctx0, ...Object.fromEntries(Object.entries(ctx).filter(([x, v]) => v?.kind === 'fun')) });
        }
    );
}
function usingPackCompiler(ctx: Context, using: UsingName<Type>[], flags: string): Gen<Context> {
    const ctx0: Context = {}
    const gens = using.map(x => {
        const v0 = ctx[x.name];
        if (v0?.kind !== 'val') _unreachable('usingPackCompiler');

        return packCompiler(x.t!, v0.val, flags)
    });
    return bind(
        seq(gens),
        v => {
            for (let i = 0; i < v.length; ++i) {
                const x = using[i];
                ctx0[x.name] = { kind: 'val', val: v[i] };
            }
            return ret({ ...ctx0, ...Object.fromEntries(Object.entries(ctx).filter(([x, v]) => v?.kind === 'fun')) });
        }
    );
}