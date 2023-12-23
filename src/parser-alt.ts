import { P, ParseResult, Parser } from '@fmma-npm/parser';
import { Expr, FunDef, isConcrete, mkExpr, mkOp, mkReduceOp, mkType, Op, PrimType, Program, ReduceOp, Type } from './types';

const keywords: string[] = [
    'sum', 'prod', 'every', 'some', 'min', 'max', 'let', 'in', 'empty', 'the', 'append',
    'split', 'concat', 'tab', 'seq', 'zip', 'scan', 'using', 'log', 'sqrt', 'sin', 'cos'
] as (Op['name'] | ReduceOp['name'] | 'let' | 'in' | 'using')[]

const exprParser = (src: string): ParseResult<Expr> => exprParser0(src);

const nameParser: Parser<string> = P.regExp(/\s*[a-z]+\w*/)
    .transform(x => x[0].trimStart())
    .guard(x => {
        return !keywords.includes(x);
    });

const constantParser: Parser<any> = P.choices(
    P.int,
    P.keyword('true', true),
    P.keyword('false', false),
    P.singleQuotedString.guard(x => x.length === 1)
)

const tupleParser = exprParser.separate(',', false).surround('(', ')')

const primTypeParser: Parser<PrimType> = P.choicesString('num', 'bool', 'char');

const typeParser = (src: string): ParseResult<Type> => typeParser0(src);

const conreteTypeParser = typeParser.guard(isConcrete);

const typeParser0: Parser<Type> = P.choices(
    primTypeParser.transform(t => mkType({ kind: 'prim', t })),
    typeParser.separate(',').surround('(', ')').transform(ts => mkType({ kind: 'tup', ts })),
    P.object({
        _: P.keyword('A'),
        t: conreteTypeParser
    }).transform(({t}) => mkType({ kind: 'arr', t })),
    P.object({
        _: P.keyword('S'),
        t: typeParser
    }).transform(({t}) => mkType({ kind: 'seq', t })),
);


const reduceOpParser: Parser<ReduceOp> = P.choicesString('sum', 'prod', 'every', 'some', 'min', 'max')
    .transform(name => mkReduceOp({ name }));

const opParser: Parser<Op> = P.choices(
    P.choices(
        P.keyword('&', 'iota' as const),
        P.keyword('!', 'not' as const),
        P.keyword('-', 'uminus' as const),
        P.choicesString('log', 'sqrt', 'cos', 'sin'),
        P.keyword('empty'),
        P.keyword('the'),
        P.keyword('append'),
        P.keyword('split'),
        P.keyword('concat'),
        P.keyword('tab'),
        P.keyword('seq'),
        P.keyword('#', 'len' as const),
        P.keyword('elt'),
        P.keyword('zip'),
    ).transform(op => mkOp({ name: op })),
    P.object({
        name: P.keyword('mkseq'),
        t: typeParser.optional(),
    }).transform(mkOp),
    P.object({
        o: reduceOpParser,
        name: P.choices(P.keyword('-scan', 'scan' as const), P.of('reduce' as const))
    }).transform(mkOp),
);

const atomParser: Parser<Expr> = P.choices(
    constantParser.transform((value): Expr => mkExpr({ kind: 'cst', value })),
    P.object({ f: nameParser, e0: tupleParser }).transform(obj => mkExpr({ kind: 'app', ...obj })),
    P.object(({
        x: nameParser,
        _2: P.keyword('in'),
        e1: exprParser,
        e2: P.object({
            _: P.keyword('?'),
            e2: exprParser
        }).transform(x => x.e2).optional(),
        _1: P.keyword(':'),
        e0: exprParser,
    })).transform(({x, e0, e1, e2}) => {
        return mkExpr({ kind: 'compr', x, e0, e1, e2, using: [] });
    }),
    nameParser.transform((value): Expr => mkExpr({ kind: 'name', value })),
    P.object({ op: opParser, e0: exprParser }).transform(({ op, e0 }) => mkExpr({ kind: 'op', op, e0 })),
    exprParser.surround('(', ')'),
    P.object(
     { es: exprParser
        .separate(',', false)
        .surround('[', ']'),
      t: typeParser.optional()
     }
    ).transform(({es, t}) => {
        return mkExpr({ kind: 'op', op: { name: 'mkseq', t }, e0: mkExpr({ kind: 'tup', es }) })
    } ),
    P.doubleQuotedString.transform(xs => {
        const es = xs.split('').map(c => mkExpr({ kind: 'cst', value: c }));
        return mkExpr({ kind: 'op', op: { name: 'mkseq' }, e0: mkExpr({ kind: 'tup', es }) });
    }),
    tupleParser.transform((es): Expr => mkExpr({ kind: 'tup', es }))
);


function mkBinop<T>(name: T): (a: Expr, b: Expr) => { kind: 'op', op: { name: T }, e0: Expr } {
    return (a, b) => {
        return ({ kind: 'op', op: { name }, e0: mkExpr({ kind: 'tup', es: [a, b] }) });
    };
}

const arithExprParser =
    P.object({
        atom: atomParser,
        projs: P.choices(P.keyword('.').leading(P.int), exprParser.surround('[', ']')).many(false)
    }).transform(({ atom, projs }) => projs.reduce<Expr>((e, i) => typeof i === 'number'
        ? mkExpr({ kind: 'proj', e, i })
        : mkExpr({ kind: 'op', op: { name: 'elt' }, e0: mkExpr({ kind: 'tup', es: [e, i] }) })
        , atom))
        .reduceRight(P.keyword('^', mkBinop('pow' as const)))
        .reduce(P.choices(
            P.keyword('*', mkBinop('times' as const)),
            P.keyword('/', mkBinop('div' as const)),
            P.keyword('%', mkBinop('mod' as const)),
        ))
        .reduce(P.choices(
            P.keyword('+', mkBinop('plus' as const)),
            P.keyword('-', mkBinop('minus' as const)),
        ))
        .reduce(P.choices(
            P.keyword('==', mkBinop('eq' as const)),
            P.keyword('!=', mkBinop('neq' as const)),
            P.keyword('<', mkBinop('lt' as const)),
            P.keyword('>', mkBinop('gt' as const)),
            P.keyword('<=', mkBinop('leq' as const)),
            P.keyword('>=', mkBinop('geq' as const)),
        ))
        .reduce(P.keyword('&&', mkBinop('and' as const)))
        .reduce(P.keyword('||', mkBinop('or' as const)))
        .reduce(P.keyword('|', (e0, e1) => mkExpr({ kind: 'cond', e0, e1, using: [] })))

const patternParser = nameParser;

const exprParser0 = P.choices(
    P.object({
        _0: P.keyword('let'),
        pat: patternParser,
        _1: P.keyword('='),
        e0: exprParser,
        _2: P.keyword('in'),
        e1: exprParser
    }).transform(obj => mkExpr({ kind: 'let', ...obj })),
    arithExprParser);

const funDefParser: Parser<FunDef> = P.object({
    outType: typeParser,
    name: nameParser,
    args: P.object({
        type: typeParser,
        name: nameParser
    }).separate(',', false).surround('(', ')'),
    expr: exprParser.surround('{', '}')
});

const programParser: Parser<Program> = P.object({
    defs: funDefParser.many(false),
    main: exprParser
});

export const parseExpr = exprParser.endOfSource();
export const parseType = typeParser.endOfSource();
export const parseProgram = programParser.endOfSource();

