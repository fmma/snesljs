import { NamedInstruction, Op, StreamTree, Svcode, Value } from "./types";

export function svcodePretty(code: Svcode, value: Value): string {
    return [
        ...code.code.map(instructionPretty),
        "###",
        valuePretty(value, String),
        "###"
    ].join('\n');
}

export function valuePretty<T>(value: StreamTree<T>, f: (x: T) => string): string {
    switch (value.kind) {
        case 'sid': return f(value.sid);
        case 'tup': return `(\n${value.sts.map(v => valuePretty(v, f)).join('\n')}\n)`
        case 'ss': return `{${f(value.ssd)}}\n${valuePretty(value.v, f)}`;
        case 'sa': return `[${f(value.asd)}]\n${valuePretty(value.v, f)}`;
    }
}

export function instructionPretty(instr: NamedInstruction) {
    return `${instr.t} ${instr.name} = ${opPretty(instr.op)}(${instr.args.join(', ')})`
}

export function opPretty(op: Op) {
    switch (op.name) {
        case 'map':
            switch (op.op.name) {
                case 'eq': case 'neq': case 'lt': case 'gt': case 'leq': case 'geq': return `map_${op.op.name}_${op.op.t}`;
                default: return `map_${op.op.name}`;
            }
        case 'rep': return `rep_${op.t}_${op.value}`;
        case 'dist': case 'pack': return `${op.name}_${op.t}`;
        case 'reduce':
            switch (op.op.name) {
                case 'min': case 'max': return `${op.op.name}_${op.op.t}`;
                default: return `${op.op.name}`;
            }
        case 'scan':
            switch (op.op.name) {
                case 'min': case 'max': return `${op.op.name}_scan_${op.op.t}`;
                default: return `${op.op.name}_scan`;
            }
        default: return op.name;
    }
}