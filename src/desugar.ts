import { freevars } from "./freevars";
import { Expr, isConcrete, mkExpr, mkType, Program } from "./types";

export function desugarProgram(p: Program) {
    for(const def of p.defs) {
        desugar0(def.expr);
    }
    desugar0(p.main);
}

export function desugar0(e: Expr) {
    switch(e.kind) {
        case 'app': for(const e0 of e.e0) desugar0(e0); break;
        case 'cond': desugar0(e.e0); desugar0(e.e1); break;
        case 'cst': break;
        case 'let': desugar0(e.e0); desugar0(e.e1); break;
        case 'name': break;
        case 'op': desugar0(e.e0); break;
        case 'proj': desugar0(e.e); break;
        case 'tup': for(const e0 of e.es) desugar0(e0); break;
        case 'compr': {
            desugar0(e.e0);
            desugar0(e.e1);
            if(e.e2 == null) break;

            // x in e1 ? e2 : e0 ~> x in concat(x in e1 : (x | e2)) : e0
            desugar0(e.e2);
            const t = e.t!;
            const seqT = mkType({kind: 'seq', t});
            const x = mkExpr({kind: 'name', value: e.x, t: e.t!});
            const cond = mkExpr({kind: 'cond', e0: x, e1: e.e2, using: [{name: e.x, t: e.t}, ...freevars(e.e2)]});
            const compr = mkExpr({kind: 'compr', e1: e.e1, e0: cond, using: freevars(e.e2).filter(x => isConcrete(x.t!)) as any, x: e.x, t: seqT });
            e.e1 = mkExpr({kind: 'op', op: {name: 'concat', t}, e0: compr});
            e.e2 = undefined;
        }
    }
}