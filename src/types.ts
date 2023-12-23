export interface Qualifier {
    name: string,
    expr: Expr
}

export type PrimType = 'num' | 'bool' | 'char'

export type ConcreteType
    = { kind: 'prim', t: PrimType }
    | { kind: 'tup', ts: ConcreteType[] }
    | { kind: 'arr', t: ConcreteType }

export type Type
    = { kind: 'prim', t: PrimType }
    | { kind: 'tup', ts: Type[] }
    | { kind: 'arr', t: ConcreteType }
    | { kind: 'seq', t: Type }


export function wellFormed(t: Type): boolean {
    switch (t.kind) {
        case 'prim': return true;
        case 'tup': return t.ts.every(wellFormed);
        case 'arr': return isConcrete(t.t);
        case 'seq': return wellFormed(t.t);
    }
}

export function isConcrete(t: Type): t is ConcreteType {
    switch (t.kind) {
        case 'prim': return true;
        case 'tup': return t.ts.every(isConcrete);
        case 'arr': return wellFormed(t.t);
        case 'seq': return false;
    }
}

export function isPrimitive(t: Type): t is { kind: 'prim', t: PrimType } {
    return t.kind === 'prim';
}

export function mkConcreteType(t: ConcreteType): ConcreteType {
    return t;
}
export function mkType(t: Type): Type {
    return t;
}

export type ReduceOp
    = { name: 'sum' | 'prod' | 'every' | 'some' }
    | { name: 'max' | 'min', t?: PrimType };

export function mkReduceOp(op: ReduceOp) {
    return op;
}

export type Op
    = { name: 'mkseq', n?: number, t?: Type }
    | { name: 'empty' | 'the' | 'append' | 'split' | 'concat' , t?: Type }
    | { name: 'tab' | 'seq' | 'len' | 'elt', t?: ConcreteType }
    | { name: 'zip', ts?: Type[] }
    | { name: 'iota' | 'plus' | 'minus' | 'uminus' | 'times' | 'div' | 'mod' | 'not' | 'pow' | 'and' | 'or' }
    | { name: 'log' | 'sqrt' | 'cos' | 'sin'}
    | { name: 'eq' | 'neq' | 'lt' | 'gt' | 'leq' | 'geq', t?: PrimType }
    | { name: 'scan' | 'reduce', o: ReduceOp }

export function mkOp(op: Op): Op {
    return op;
}

export type Pattern = string;

export interface UsingName<T> {
    name: string;
    t?: T
}

export type Expr
    = { kind: 'op', op: Op, e0: Expr }
    | { kind: 'app', f: string, e0: Expr[] }
    | { kind: 'name', value: string, t?: Type }
    | { kind: 'cst', value: any, t?: PrimType }
    | { kind: 'compr', e0: Expr, x: string, t?: Type, e1: Expr, e2?: Expr, using: UsingName<ConcreteType>[] }
    | { kind: 'cond', e0: Expr, e1: Expr, using: UsingName<Type>[] }
    | { kind: 'let', pat: Pattern, e0: Expr, e1: Expr }
    | { kind: 'tup', es: Expr[] }
    | { kind: 'proj', e: Expr, i: number }


export function mkExpr(e: Expr): Expr {
    for(const key of Object.keys(e)) {
        if(key.startsWith('_'))
        delete (e as any)[key];
    }
    return e;
}

export interface FunDefType {
    args: Type[];
    outType: Type;
}

export type FunDef = {
    name: string;
    args: {
        type: Type,
        name: string
    }[];
    outType: Type;
    expr: Expr
};

export interface Program {
    defs: FunDef[];
    main: Expr;
}

