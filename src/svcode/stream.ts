export interface Kernel<T = any, TArgs extends any[][] = any, TState = any> {
    // in
    args: TArgs;
    state: TState;

    // out
    data: T[];
    eltsRead: number[];
}

export class Stream<T> {

    constructor(
        readonly kernel: (params: Kernel<T>) => void,
        readonly state?: any
    ) {
    }

    fire(gc: boolean, minRequired: number): number {
        if (gc)
            this.gc();
        const args = this.ins.map(x => x.s.buffer.slice(x.rc.v));

        const minN = args.reduce((a, b) => a + b.length, 0);

        if (minN < minRequired) {
            return -1;
        }

        const { state } = this;
        const kernel: Kernel = { args, state } as any;

        this.kernel(kernel)
        const { data, eltsRead } = kernel;
        for (let i = 0; i < eltsRead.length; ++i) {
            this.ins[i].rc.v += eltsRead[i];
        }
        this.buffer.push(...data);
        return data.length;
    }

    gc(): number {
        const minRc = this.outs.reduce((a, b) => Math.min(a, b.rc.v), Number.MAX_SAFE_INTEGER);

        this.buffer.slice(minRc);

        for (const x of this.outs) {
            x.rc.v -= minRc;
        }
        return minRc;
    }

    ins: { s: Stream<any>, rc: { v: number } }[] = []; // k
    outs: { s: Stream<any>, rc: { v: number } }[] = []; // n

    buffer: T[] = [];

    static connect(input: Stream<any>, output: Stream<any>) {
        const rc = { v: 0 };
        input.outs.push({ s: output, rc });
        output.ins.push({ s: input, rc });
    }
}

function adder(s0: Stream<number>, s1: Stream<number>): Stream<number> {
    const s = new Stream(addKernel);
    Stream.connect(s0, s);
    Stream.connect(s1, s);

    return s;
}

function addKernel(params: Kernel<number, [number[], number[]]>): void {
    const [xs, ys] = params.args;
    const n = Math.min(xs.length, ys.length);
    params.data = Array(n).map((_, i) => xs[i] + ys[i]);
    params.eltsRead = [n, n];
}
