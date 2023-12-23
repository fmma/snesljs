import { Expr, Type, UsingName } from "./types";

export function freevars(e: Expr): UsingName<Type>[] {

    const ret: UsingName<Type>[] = [];
    const seen = new Set<string>();

    for(const fv of freevars0(e)) {
        if(seen.has(fv.name))
            continue;

        ret.push(fv);
        seen.add(fv.name);
    }

    return ret;
}

function freevars0(e: Expr): UsingName<Type>[] {
    switch (e.kind) {
        case 'app': return e.e0.flatMap(freevars0);
        case 'compr': return [...freevars0(e.e1), ...freevars0(e.e0).filter(x => x.name !== e.x)];
        case 'cond': return [...freevars0(e.e0), ...freevars0(e.e1)];
        case 'cst': return [];
        case 'let': return [...freevars0(e.e0), ...freevars0(e.e1).filter(x => x.name !== e.pat)];
        case 'name': return [{name: e.value, t: e.t}];
        case 'op': return freevars0(e.e0);
        case 'proj': return freevars0(e.e);
        case 'tup': return e.es.flatMap(freevars0);
    }
}
