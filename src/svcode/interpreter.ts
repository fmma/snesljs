import { NamedInstruction, Op, Svcode, Value, mapStreamTree, Result } from './types';

export interface ReadCursor {
    stream: Stream<unknown>;
    read: boolean;
}

export class Stream<T> implements AsyncIterable<T> {
    done = false;
    it: AsyncIterator<T>;
    buf?: T;
    hasValue = false;
    readers: boolean[] = [];
    waitingForValue: (() => void)[] = [];
    result: any[] = [];

    constructor(kernel: AsyncIterable<T> | Iterable<T>, readonly force: boolean) {
        const isSync = typeof (kernel as Iterable<T>)[Symbol.iterator] === 'function';
        if (isSync) {
            this.it = (kernel as Iterable<T>)[Symbol.iterator]() as any;
        }
        else {
            this.it = (kernel as AsyncIterable<T>)[Symbol.asyncIterator]();
        }
    }

    private async tryChurn() {
        if (this.done)
            return;
        if (this.readers.every(x => x)) {
            await this.churn();
        }
    }

    async churn() {
        if (this.force && this.hasValue) {
            this.result.push(this.buf);
        }
        this.hasValue = false;
        this.readers = this.readers.map(_ => false);
        const x = await this.it.next();
        if (x.done) {
            this.done = true;
            this.hasValue = true;
        }
        else {
            this.buf = x.value;
            this.hasValue = true;
        }
        for (const r of this.waitingForValue) {
            r();
        }
        this.waitingForValue = [];

        this.tryChurn();
    }

    [Symbol.asyncIterator](): AsyncIterator<T, any, undefined> {
        let i = this.readers.length;
        this.readers.push(false);
        return {
            next: (): Promise<IteratorResult<T>> => {
                return new Promise((resolve, reject) => {

                    const pushValue = () => {
                        if (this.done) {
                            resolve({ done: true, value: undefined });
                        }
                        else {
                            resolve({ done: false, value: this.buf! });
                            this.readers[i] = true;
                            this.tryChurn();
                        }
                    };

                    if (this.readers[i] || !this.hasValue) {
                        // wait
                        this.waitingForValue.push(pushValue);
                    }
                    else {
                        pushValue();
                    }
                });
            }
        }
    }
}

export type Context = Record<string, Stream<any>>;

export type Ssd = number | null;

function sidList(v: Value): string[] {
    switch (v.kind) {
        case 'sid': return [v.sid];
        case 'tup': return v.sts.flatMap(sidList);
        case 'ss': return [v.ssd, ...sidList(v.v)];
        case 'sa': return [v.asd, ...sidList(v.v)];
    }
}

async function toArray<T>(s: Stream<T>): Promise<T[]> {
    const arr: T[] = [];
    for await (const i of s)
        arr.push(i);
    return arr;
}

async function observe<T>(s: Stream<T>): Promise<void> {
    for await (const _ of s) {}
}

export async function svcodeInterp(code: Svcode, value: Value): Promise<Result> {
    let ctx: Context = { ctrl: new Stream([null], false) };
    const sids = new Set(sidList(value));
    for (const c of code.code) {
        const force = sids.has(c.name);
        ctx = instructionInterp(c, ctx, force);
    }

    const p = Promise.all([...sids].map(x => observe(ctx[x])));

    for (const [_, stream] of Object.entries(ctx)) {
        stream.churn();
    }
    await p;

    return mapStreamTree(value, x => ctx[x].result);
}

export function instructionInterp(instr: NamedInstruction, ctx: Context, force: boolean) {
    const args = instr.args.map(x => ctx[x]);
    const v = new Stream(opInterp(instr.op, args), force);
    return { ...ctx, [instr.name]: v };
}

export function opInterp(op: Op, args: Stream<any>[]) {
    switch (op.name) {
        case 'rep': return rep(args[0], op.value);
        case 'iotas': return iotas(args[0]);
        case 'ssd_pack': return ssd_pack(args[0], args[1]);
        case 'pack': return pack(args[0], args[1]);
        case 'dist': return dist(args[0], args[1]);
        case 'bool_to_ssd': return bool_to_ssd(args[0])
        case 'num_to_ssd': return num_to_ssd(args[0]);
        case 'ssd_to_ctrl': return ssd_to_ctrl(args[0]);
        case 'map':
            switch (op.op.name) {
                case 'log': return map_log(args[0]);
                case 'plus': return map_plus(args[0], args[1]);
                case 'times': return map_times(args[0], args[1]);
                case 'div': return map_div(args[0], args[1]);
                default: throw new Error('not implemented');
            }
        case 'reduce':
            switch (op.op.name) {
                case 'sum': return reduce_sum(args[0], args[1]);
                case 'prod':
                case 'some':
                case 'every':
                case 'min':
                case 'max': throw new Error('not implemented');
            }
        case 'scan': throw new Error('not implemented');
    }
}


async function* num_to_ssd(xs: AsyncIterable<number>): AsyncIterable<Ssd> {
    for await (const x of xs) {
        yield x;
        yield null;
    }
}

async function* bool_to_ssd(xs: AsyncIterable<boolean>): AsyncIterable<Ssd> {
    let ends = 0;
    for await (const x of xs) {
        ends++;
        if (x) {
            yield 1;
        }
        yield null;
    }
}

async function* rep<T>(xs: AsyncIterable<null>, value: T): AsyncIterable<T> {
    for await (const x of xs)
        yield value;
}

async function* iotas(xs: AsyncIterable<number>): AsyncIterable<number> {
    for await (const x of xs) {
        for (let i = 0; i < x; ++i) {
            yield i;
        }
    }
}

async function* pack<T>(flags: AsyncIterable<boolean>, xs: AsyncIterable<T>): AsyncIterable<T> {
    const it = xs[Symbol.asyncIterator]();
    for await (const f of flags) {
        const x = (await it.next()).value;
        if (f)
            yield x;
    }
}

async function* ssd_pack(flags: AsyncIterable<boolean>, xs: AsyncIterable<Ssd>): AsyncIterable<Ssd> {
    const itXs = xs[Symbol.asyncIterator]();
    const itFlags = flags[Symbol.asyncIterator]();

    let yielding = false;
    let dropping = false;

    while (true) {
        if (yielding) {
            const x = await itXs.next(); if (x.done) throw '';
            if (x.value == null) {
                yielding = false;
                yield null;
            }
            else
                yield x.value;
        }
        else if (dropping) {
            const x = await itXs.next(); if (x.done) throw '';
            if (x.value == null)
                dropping = false;
        }
        else {
            let f = await itFlags.next();
            yielding = f.value;
            dropping = !f.value;
        }
    }
}

async function* ssd_to_ctrl(ssds: AsyncIterable<Ssd>): AsyncIterable<null> {
    for await (const ssd of ssds) {
        if (ssd != null) {
            for (let i = 0; i < ssd; ++i) {
                yield null;
            }
        }
    }
}

async function* dist<T>(ssds: AsyncIterable<Ssd>, xs: AsyncIterable<T>): AsyncIterable<T> {
    const itXs = xs[Symbol.asyncIterator]();
    let v = (await itXs.next()).value;
    for await (const ssd of ssds) {
        if (ssd == null) {
            v = (await itXs.next()).value;
        }
        else {
            for (let i = 0; i < ssd; ++i) {
                yield v;
            }
        }
    }
}

async function* map_times(s0: AsyncIterable<number>, s1: AsyncIterable<number>) {
    const itXs = s1[Symbol.asyncIterator]();
    for await (const x of s0) {
        const y = (await itXs.next()).value;
        yield x * y;
    }
}

async function* map_div(s0: AsyncIterable<number>, s1: AsyncIterable<number>) {
    const itXs = s1[Symbol.asyncIterator]();
    for await (const x of s0) {
        const y = (await itXs.next()).value;
        yield x / y;
    }
}


async function* map_plus(s0: AsyncIterable<number>, s1: AsyncIterable<number>) {
    const itXs = s1[Symbol.asyncIterator]();
    for await (const x of s0) {
        const y = (await itXs.next()).value;
        yield x + y;
    }
}

async function* map_log(s0: AsyncIterable<number>) {
    for await (const x of s0) {
        yield Math.log(x);
    }
}

async function* reduce_sum(ssds: AsyncIterable<Ssd>, s0: AsyncIterable<number>): AsyncIterable<number> {
    const itXs = s0[Symbol.asyncIterator]();
    let acc = 0;
    for await (const ssd of ssds) {
        if (ssd == null) {
            yield acc;
            acc = 0;
        }
        else {
            for (let i = 0; i < ssd; ++i) {
                acc += (await itXs.next()).value;
            }
        }
    }
}
