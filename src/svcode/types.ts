/**
 * ssd = stream segment descriptor (impl. spec.: possible end/start flags or segment lengths ).
 * ssa = array segment descriptor (int cursor, int length).
 * ctrl = control stream (no elements, only length).
 */
export type PrimType = 'num' | 'bool' | 'char' | 'ssd' | 'ssa' | 'ctrl'

export type Type
    = { kind: 'stream', t: PrimType }
    | { kind: 'tup', ts: Type[] }

/**
 * ss = segmented sequence
 * sa = segmented array
 */
export type Value = StreamTree<string>

export type Result = StreamTree<any[]>

export function mapStreamTree<T, U>(t: StreamTree<T>, f: (x: T) => U): StreamTree<U> {
    switch (t.kind) {
        case 'sid': return { kind: 'sid', sid: f(t.sid), t: t.t };
        case 'tup': return { kind: 'tup', sts: t.sts.map(t0 => mapStreamTree(t0, f)) }
        case 'ss': return { kind: 'ss', ssd: f(t.ssd), v: mapStreamTree(t.v, f) }
        case 'sa': return { kind: 'sa', asd: f(t.asd), v: mapStreamTree(t.v, f) }
    }
}

export type StreamTree<T>
    = { kind: 'sid', sid: T, t: PrimType }
    | { kind: 'tup', sts: StreamTree<T>[] }
    | { kind: 'ss', v: StreamTree<T>, ssd: T }
    | { kind: 'sa', v: StreamTree<T>, asd: T }

export function mkValue(v: Value): Value {
    return v;
}

export type MapOp
    = { name: 'plus' | 'minus' | 'uminus' | 'times' | 'div' | 'mod' | 'not' | 'pow' | 'and' | 'or' | 'log' | 'sqrt' | 'cos' | 'sin' }
    | { name: 'eq' | 'neq' | 'lt' | 'gt' | 'leq' | 'geq', t?: PrimType }

export type ReduceOp
    = { name: 'sum' | 'prod' | 'every' | 'some' }
    | { name: 'max' | 'min', t?: PrimType };
// ssd = stream segment descriptor
// asd = array segment descriptor
export type Op
    = { name: 'rep', t: PrimType, value: any } // replicate value to control
    | { name: 'iotas' }
    | { name: 'ssd_to_ctrl' } // ssd to units
    | { name: 'dist', t: PrimType } // dist prim to ssd
    | { name: 'map', op: MapOp }
    | { name: 'pack', t: PrimType } // pack prim using booleans
    | { name: 'ssd_pack' } // pack ssd's using booleans
    | { name: 'bool_to_ssd' } // convert bools to ssd's (length 0 or 1).
    | { name: 'num_to_ssd' } // convert numbers to ssd's.
    | { name: 'reduce', op: ReduceOp }
    | { name: 'scan', op: ReduceOp }

export function returnType(op: Op): PrimType {
    switch (op.name) {
        case 'rep': case 'pack': return op.t;
        case 'iotas': return 'num';
        case 'ssd_to_ctrl': return 'ctrl';
        case 'ssd_pack': case 'dist': case 'bool_to_ssd': case 'num_to_ssd': return 'ssd';
        case 'map':
            switch (op.op.name) {
                case 'plus': case 'minus': case 'uminus': case 'times': case 'div': case 'mod': case 'pow': case 'log': case 'sqrt': case 'cos': case 'sin': return 'num'
                case 'not': case 'and': case 'or': case 'eq': case 'neq': case 'lt': case 'gt': case 'leq': case 'geq': return 'bool'
            }
        case 'reduce': case 'scan': {
            switch (op.op.name) {
                case 'sum': case 'prod': return 'num';
                case 'every': case 'some': return 'bool';
                case 'min': case 'max': return op.op.t!
            }
        }
    }
}

export interface Instruction {
    op: Op,
    args: string[]
}

export interface NamedInstruction {
    name: string;
    t: PrimType,
    op: Op,
    args: string[]
}

export interface Svcode {
    code: NamedInstruction[]
}