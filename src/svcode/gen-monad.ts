import { Instruction, NamedInstruction, Svcode, returnType } from './types';

export type Gen<T> = (i: number) => { value: T, code: Svcode, j: number }

export function ret<T>(value: T): Gen<T> {
    return i => ({
        value,
        code: {
            code: []
        },
        j: i
    });
}

export function bind<T, U>(f: Gen<T>, g: (x: T) => Gen<U>): Gen<U> {
    return i => {
        const { value: x, code: c1, j: i1 } = f(i);
        const { value: y, code: c2, j: i2 } = g(x)(i1);
        return {
            value: y,
            code: { code: c1.code.concat(c2.code) },
            j: i2
        };
    }
}

export function seq<T>(xs: Gen<T>[]): Gen<T[]> {
    return i => {
        let j = i;
        const value: T[] = [];
        let ts: NamedInstruction[] = [];
        for (const g of xs) {
            const { value: value0, code: code0, j: j0 } = g(j);
            value.push(value0);
            j = j0;
            ts.push(...code0.code);
        }
        return {
            value,
            j,
            code: {
                code: ts
            }
        };
    }
}

export function emit(instr: Instruction): Gen<string> {
    return i => {
        const sid = `s${i}`
        return ({
            value: sid,
            j: i + 1,
            code: {
                code: [
                    {
                        name: sid,
                        t: returnType(instr.op),
                        ...instr
                    }
                ]
            }
        })
    };
}
