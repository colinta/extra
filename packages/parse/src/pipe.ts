import {createParser} from './create'
import type {Parser} from './types'

export function pipe<TA, TIn = unknown>(parsers: [Parser<TA, TIn>]): Parser<TA, TIn>

export function pipe<TA, TB = TA, TIn = unknown>(
  parsers: [Parser<TA, TIn>, Parser<TB, TA>],
): Parser<TB, TIn>

export function pipe<TA, TB = TA, TC = TB, TIn = unknown>(
  parsers: [Parser<TA, TIn>, Parser<TB, TA>, Parser<TC, TB>],
): Parser<TC, TIn>

export function pipe<TA, TB = TA, TC = TB, TD = TC, TIn = unknown>(
  parsers: [Parser<TA, TIn>, Parser<TB, TA>, Parser<TC, TB>, Parser<TD, TC>],
): Parser<TD, TIn>

export function pipe<TA, TB = TA, TC = TB, TD = TC, TE = TD, TIn = unknown>(
  parsers: [Parser<TA, TIn>, Parser<TB, TA>, Parser<TC, TB>, Parser<TD, TC>, Parser<TE, TD>],
): Parser<TE, TIn>

export function pipe<TA, TB = TA, TC = TB, TD = TC, TE = TD, TF = TE, TIn = unknown>(
  parsers: [
    Parser<TA, TIn>,
    Parser<TB, TA>,
    Parser<TC, TB>,
    Parser<TD, TC>,
    Parser<TE, TD>,
    Parser<TF, TE>,
  ],
): Parser<TF, TIn>

export function pipe<TA, TB = TA, TC = TB, TD = TC, TE = TD, TF = TE, TG = TF, TIn = unknown>(
  parsers: [
    Parser<TA, TIn>,
    Parser<TB, TA>,
    Parser<TC, TB>,
    Parser<TD, TC>,
    Parser<TE, TD>,
    Parser<TF, TE>,
    Parser<TG, TF>,
  ],
): Parser<TG, TIn>

export function pipe<
  TA,
  TB = TA,
  TC = TB,
  TD = TC,
  TE = TD,
  TF = TE,
  TG = TF,
  TH = TG,
  TIn = unknown,
>(
  parsers: [
    Parser<TA, TIn>,
    Parser<TB, TA>,
    Parser<TC, TB>,
    Parser<TD, TC>,
    Parser<TE, TD>,
    Parser<TF, TE>,
    Parser<TG, TF>,
    Parser<TH, TG>,
  ],
): Parser<TH, TIn>

export function pipe<
  TA,
  TB = TA,
  TC = TB,
  TD = TC,
  TE = TD,
  TF = TE,
  TG = TF,
  TH = TG,
  TI = TH,
  TIn = unknown,
>(
  parsers: [
    Parser<TA, TIn>,
    Parser<TB, TA>,
    Parser<TC, TB>,
    Parser<TD, TC>,
    Parser<TE, TD>,
    Parser<TF, TE>,
    Parser<TG, TF>,
    Parser<TH, TG>,
    Parser<TI, TH>,
  ],
): Parser<TI, TIn>

export function pipe<
  TA,
  TB = TA,
  TC = TB,
  TD = TC,
  TE = TD,
  TF = TE,
  TG = TF,
  TH = TG,
  TI = TH,
  TJ = TI,
  TIn = unknown,
>(
  parsers: [
    Parser<TA, TIn>,
    Parser<TB, TA>,
    Parser<TC, TB>,
    Parser<TD, TC>,
    Parser<TE, TD>,
    Parser<TF, TE>,
    Parser<TG, TF>,
    Parser<TH, TG>,
    Parser<TI, TH>,
    Parser<TJ, TI>,
  ],
): Parser<TJ, TIn>

export function pipe<
  TA,
  TB = TA,
  TC = TB,
  TD = TC,
  TE = TD,
  TF = TE,
  TG = TF,
  TH = TG,
  TI = TH,
  TJ = TI,
  TK = TJ,
  TIn = unknown,
>(
  parsers: [
    Parser<TA, TIn>,
    Parser<TB, TA>,
    Parser<TC, TB>,
    Parser<TD, TC>,
    Parser<TE, TD>,
    Parser<TF, TE>,
    Parser<TG, TF>,
    Parser<TH, TG>,
    Parser<TI, TH>,
    Parser<TJ, TI>,
    Parser<TK, TJ>,
  ],
): Parser<TK, TIn>

export function pipe<
  TA,
  TB = TA,
  TC = TB,
  TD = TC,
  TE = TD,
  TF = TE,
  TG = TF,
  TH = TG,
  TI = TH,
  TJ = TI,
  TK = TJ,
  TL = TK,
  TIn = unknown,
>(
  parsers: [
    Parser<TA, TIn>,
    Parser<TB, TA>,
    Parser<TC, TB>,
    Parser<TD, TC>,
    Parser<TE, TD>,
    Parser<TF, TE>,
    Parser<TG, TF>,
    Parser<TH, TG>,
    Parser<TI, TH>,
    Parser<TJ, TI>,
    Parser<TK, TJ>,
    Parser<TL, TK>,
  ],
): Parser<TL, TIn>

export function pipe<
  TA,
  TB = TA,
  TC = TB,
  TD = TC,
  TE = TD,
  TF = TE,
  TG = TF,
  TH = TG,
  TI = TH,
  TJ = TI,
  TK = TJ,
  TL = TK,
  TM = TL,
  TIn = unknown,
>(
  parsers: [
    Parser<TA, TIn>,
    Parser<TB, TA>,
    Parser<TC, TB>,
    Parser<TD, TC>,
    Parser<TE, TD>,
    Parser<TF, TE>,
    Parser<TG, TF>,
    Parser<TH, TG>,
    Parser<TI, TH>,
    Parser<TJ, TI>,
    Parser<TK, TJ>,
    Parser<TL, TK>,
    Parser<TM, TL>,
  ],
): Parser<TM, TIn>

export function pipe<
  TA,
  TB = TA,
  TC = TB,
  TD = TC,
  TE = TD,
  TF = TE,
  TG = TF,
  TH = TG,
  TI = TH,
  TJ = TI,
  TK = TJ,
  TL = TK,
  TM = TL,
  TN = TM,
  TIn = unknown,
>(
  parsers: [
    Parser<TA, TIn>,
    Parser<TB, TA>,
    Parser<TC, TB>,
    Parser<TD, TC>,
    Parser<TE, TD>,
    Parser<TF, TE>,
    Parser<TG, TF>,
    Parser<TH, TG>,
    Parser<TI, TH>,
    Parser<TJ, TI>,
    Parser<TK, TJ>,
    Parser<TL, TK>,
    Parser<TM, TL>,
    Parser<TN, TM>,
  ],
): Parser<TN, TIn>

export function pipe<
  TA,
  TB = TA,
  TC = TB,
  TD = TC,
  TE = TD,
  TF = TE,
  TG = TF,
  TH = TG,
  TI = TH,
  TJ = TI,
  TK = TJ,
  TL = TK,
  TM = TL,
  TN = TM,
  TO = TN,
  TIn = unknown,
>(
  parsers: [
    Parser<TA, TIn>,
    Parser<TB, TA>,
    Parser<TC, TB>,
    Parser<TD, TC>,
    Parser<TE, TD>,
    Parser<TF, TE>,
    Parser<TG, TF>,
    Parser<TH, TG>,
    Parser<TI, TH>,
    Parser<TJ, TI>,
    Parser<TK, TJ>,
    Parser<TL, TK>,
    Parser<TM, TL>,
    Parser<TN, TM>,
    Parser<TO, TN>,
  ],
): Parser<TO, TIn>

export function pipe<
  TA,
  TB = TA,
  TC = TB,
  TD = TC,
  TE = TD,
  TF = TE,
  TG = TF,
  TH = TG,
  TI = TH,
  TJ = TI,
  TK = TJ,
  TL = TK,
  TM = TL,
  TN = TM,
  TO = TN,
  TP = TO,
  TIn = unknown,
>(
  parsers: [
    Parser<TA, TIn>,
    Parser<TB, TA>,
    Parser<TC, TB>,
    Parser<TD, TC>,
    Parser<TE, TD>,
    Parser<TF, TE>,
    Parser<TG, TF>,
    Parser<TH, TG>,
    Parser<TI, TH>,
    Parser<TJ, TI>,
    Parser<TK, TJ>,
    Parser<TL, TK>,
    Parser<TM, TL>,
    Parser<TN, TM>,
    Parser<TO, TN>,
    Parser<TP, TO>,
  ],
): Parser<TP, TIn>

export function pipe<
  TA,
  TB = TA,
  TC = TB,
  TD = TC,
  TE = TD,
  TF = TE,
  TG = TF,
  TH = TG,
  TI = TH,
  TJ = TI,
  TK = TJ,
  TL = TK,
  TM = TL,
  TN = TM,
  TO = TN,
  TP = TO,
  TQ = TP,
  TIn = unknown,
>(
  parsers: [
    Parser<TA, TIn>,
    Parser<TB, TA>,
    Parser<TC, TB>,
    Parser<TD, TC>,
    Parser<TE, TD>,
    Parser<TF, TE>,
    Parser<TG, TF>,
    Parser<TH, TG>,
    Parser<TI, TH>,
    Parser<TJ, TI>,
    Parser<TK, TJ>,
    Parser<TL, TK>,
    Parser<TM, TL>,
    Parser<TN, TM>,
    Parser<TO, TN>,
    Parser<TP, TO>,
    Parser<TQ, TP>,
  ],
): Parser<TQ, TIn>

export function pipe<
  TA,
  TB = TA,
  TC = TB,
  TD = TC,
  TE = TD,
  TF = TE,
  TG = TF,
  TH = TG,
  TI = TH,
  TJ = TI,
  TK = TJ,
  TL = TK,
  TM = TL,
  TN = TM,
  TO = TN,
  TP = TO,
  TQ = TP,
  TR = TQ,
  TIn = unknown,
>(
  parsers: [
    Parser<TA, TIn>,
    Parser<TB, TA>,
    Parser<TC, TB>,
    Parser<TD, TC>,
    Parser<TE, TD>,
    Parser<TF, TE>,
    Parser<TG, TF>,
    Parser<TH, TG>,
    Parser<TI, TH>,
    Parser<TJ, TI>,
    Parser<TK, TJ>,
    Parser<TL, TK>,
    Parser<TM, TL>,
    Parser<TN, TM>,
    Parser<TO, TN>,
    Parser<TP, TO>,
    Parser<TQ, TP>,
    Parser<TR, TQ>,
  ],
): Parser<TR, TIn>

export function pipe<
  TA,
  TB = TA,
  TC = TB,
  TD = TC,
  TE = TD,
  TF = TE,
  TG = TF,
  TH = TG,
  TI = TH,
  TJ = TI,
  TK = TJ,
  TL = TK,
  TM = TL,
  TN = TM,
  TO = TN,
  TP = TO,
  TQ = TP,
  TR = TQ,
  TS = TR,
  TIn = unknown,
>(
  parsers: [
    Parser<TA, TIn>,
    Parser<TB, TA>,
    Parser<TC, TB>,
    Parser<TD, TC>,
    Parser<TE, TD>,
    Parser<TF, TE>,
    Parser<TG, TF>,
    Parser<TH, TG>,
    Parser<TI, TH>,
    Parser<TJ, TI>,
    Parser<TK, TJ>,
    Parser<TL, TK>,
    Parser<TM, TL>,
    Parser<TN, TM>,
    Parser<TO, TN>,
    Parser<TP, TO>,
    Parser<TQ, TP>,
    Parser<TR, TQ>,
    Parser<TS, TR>,
  ],
): Parser<TS, TIn>

export function pipe<
  TA,
  TB = TA,
  TC = TB,
  TD = TC,
  TE = TD,
  TF = TE,
  TG = TF,
  TH = TG,
  TI = TH,
  TJ = TI,
  TK = TJ,
  TL = TK,
  TM = TL,
  TN = TM,
  TO = TN,
  TP = TO,
  TQ = TP,
  TR = TQ,
  TS = TR,
  TT = TS,
  TIn = unknown,
>(
  parsers: [
    Parser<TA, TIn>,
    Parser<TB, TA>,
    Parser<TC, TB>,
    Parser<TD, TC>,
    Parser<TE, TD>,
    Parser<TF, TE>,
    Parser<TG, TF>,
    Parser<TH, TG>,
    Parser<TI, TH>,
    Parser<TJ, TI>,
    Parser<TK, TJ>,
    Parser<TL, TK>,
    Parser<TM, TL>,
    Parser<TN, TM>,
    Parser<TO, TN>,
    Parser<TP, TO>,
    Parser<TQ, TP>,
    Parser<TR, TQ>,
    Parser<TS, TR>,
    Parser<TT, TS>,
  ],
): Parser<TT, TIn>

export function pipe<
  TA,
  TB = TA,
  TC = TB,
  TD = TC,
  TE = TD,
  TF = TE,
  TG = TF,
  TH = TG,
  TI = TH,
  TJ = TI,
  TK = TJ,
  TL = TK,
  TM = TL,
  TN = TM,
  TO = TN,
  TP = TO,
  TQ = TP,
  TR = TQ,
  TS = TR,
  TT = TS,
  TU = TT,
  TIn = unknown,
>(
  parsers: [
    Parser<TA, TIn>,
    Parser<TB, TA>,
    Parser<TC, TB>,
    Parser<TD, TC>,
    Parser<TE, TD>,
    Parser<TF, TE>,
    Parser<TG, TF>,
    Parser<TH, TG>,
    Parser<TI, TH>,
    Parser<TJ, TI>,
    Parser<TK, TJ>,
    Parser<TL, TK>,
    Parser<TM, TL>,
    Parser<TN, TM>,
    Parser<TO, TN>,
    Parser<TP, TO>,
    Parser<TQ, TP>,
    Parser<TR, TQ>,
    Parser<TS, TR>,
    Parser<TT, TS>,
    Parser<TU, TT>,
  ],
): Parser<TU, TIn>

export function pipe<
  TA,
  TB = TA,
  TC = TB,
  TD = TC,
  TE = TD,
  TF = TE,
  TG = TF,
  TH = TG,
  TI = TH,
  TJ = TI,
  TK = TJ,
  TL = TK,
  TM = TL,
  TN = TM,
  TO = TN,
  TP = TO,
  TQ = TP,
  TR = TQ,
  TS = TR,
  TT = TS,
  TU = TT,
  TV = TU,
  TIn = unknown,
>(
  parsers: [
    Parser<TA, TIn>,
    Parser<TB, TA>,
    Parser<TC, TB>,
    Parser<TD, TC>,
    Parser<TE, TD>,
    Parser<TF, TE>,
    Parser<TG, TF>,
    Parser<TH, TG>,
    Parser<TI, TH>,
    Parser<TJ, TI>,
    Parser<TK, TJ>,
    Parser<TL, TK>,
    Parser<TM, TL>,
    Parser<TN, TM>,
    Parser<TO, TN>,
    Parser<TP, TO>,
    Parser<TQ, TP>,
    Parser<TR, TQ>,
    Parser<TS, TR>,
    Parser<TT, TS>,
    Parser<TU, TT>,
    Parser<TV, TU>,
  ],
): Parser<TV, TIn>

export function pipe<
  TA,
  TB = TA,
  TC = TB,
  TD = TC,
  TE = TD,
  TF = TE,
  TG = TF,
  TH = TG,
  TI = TH,
  TJ = TI,
  TK = TJ,
  TL = TK,
  TM = TL,
  TN = TM,
  TO = TN,
  TP = TO,
  TQ = TP,
  TR = TQ,
  TS = TR,
  TT = TS,
  TU = TT,
  TV = TU,
  TW = TV,
  TIn = unknown,
>(
  parsers: [
    Parser<TA, TIn>,
    Parser<TB, TA>,
    Parser<TC, TB>,
    Parser<TD, TC>,
    Parser<TE, TD>,
    Parser<TF, TE>,
    Parser<TG, TF>,
    Parser<TH, TG>,
    Parser<TI, TH>,
    Parser<TJ, TI>,
    Parser<TK, TJ>,
    Parser<TL, TK>,
    Parser<TM, TL>,
    Parser<TN, TM>,
    Parser<TO, TN>,
    Parser<TP, TO>,
    Parser<TQ, TP>,
    Parser<TR, TQ>,
    Parser<TS, TR>,
    Parser<TT, TS>,
    Parser<TU, TT>,
    Parser<TV, TU>,
    Parser<TW, TV>,
  ],
): Parser<TW, TIn>

export function pipe<
  TA,
  TB = TA,
  TC = TB,
  TD = TC,
  TE = TD,
  TF = TE,
  TG = TF,
  TH = TG,
  TI = TH,
  TJ = TI,
  TK = TJ,
  TL = TK,
  TM = TL,
  TN = TM,
  TO = TN,
  TP = TO,
  TQ = TP,
  TR = TQ,
  TS = TR,
  TT = TS,
  TU = TT,
  TV = TU,
  TW = TV,
  TX = TW,
  TIn = unknown,
>(
  parsers: [
    Parser<TA, TIn>,
    Parser<TB, TA>,
    Parser<TC, TB>,
    Parser<TD, TC>,
    Parser<TE, TD>,
    Parser<TF, TE>,
    Parser<TG, TF>,
    Parser<TH, TG>,
    Parser<TI, TH>,
    Parser<TJ, TI>,
    Parser<TK, TJ>,
    Parser<TL, TK>,
    Parser<TM, TL>,
    Parser<TN, TM>,
    Parser<TO, TN>,
    Parser<TP, TO>,
    Parser<TQ, TP>,
    Parser<TR, TQ>,
    Parser<TS, TR>,
    Parser<TT, TS>,
    Parser<TU, TT>,
    Parser<TV, TU>,
    Parser<TW, TV>,
    Parser<TX, TW>,
  ],
): Parser<TX, TIn>

export function pipe<
  TA,
  TB = TA,
  TC = TB,
  TD = TC,
  TE = TD,
  TF = TE,
  TG = TF,
  TH = TG,
  TI = TH,
  TJ = TI,
  TK = TJ,
  TL = TK,
  TM = TL,
  TN = TM,
  TO = TN,
  TP = TO,
  TQ = TP,
  TR = TQ,
  TS = TR,
  TT = TS,
  TU = TT,
  TV = TU,
  TW = TV,
  TX = TW,
  TY = TX,
  TIn = unknown,
>(
  parsers: [
    Parser<TA, TIn>,
    Parser<TB, TA>,
    Parser<TC, TB>,
    Parser<TD, TC>,
    Parser<TE, TD>,
    Parser<TF, TE>,
    Parser<TG, TF>,
    Parser<TH, TG>,
    Parser<TI, TH>,
    Parser<TJ, TI>,
    Parser<TK, TJ>,
    Parser<TL, TK>,
    Parser<TM, TL>,
    Parser<TN, TM>,
    Parser<TO, TN>,
    Parser<TP, TO>,
    Parser<TQ, TP>,
    Parser<TR, TQ>,
    Parser<TS, TR>,
    Parser<TT, TS>,
    Parser<TU, TT>,
    Parser<TV, TU>,
    Parser<TW, TV>,
    Parser<TX, TW>,
    Parser<TY, TX>,
  ],
): Parser<TY, TIn>

export function pipe<
  TA,
  TB = TA,
  TC = TB,
  TD = TC,
  TE = TD,
  TF = TE,
  TG = TF,
  TH = TG,
  TI = TH,
  TJ = TI,
  TK = TJ,
  TL = TK,
  TM = TL,
  TN = TM,
  TO = TN,
  TP = TO,
  TQ = TP,
  TR = TQ,
  TS = TR,
  TT = TS,
  TU = TT,
  TV = TU,
  TW = TV,
  TX = TW,
  TY = TX,
  TZ = TY,
  TIn = unknown,
>(
  parsers: [
    Parser<TA, TIn>,
    Parser<TB, TA>,
    Parser<TC, TB>,
    Parser<TD, TC>,
    Parser<TE, TD>,
    Parser<TF, TE>,
    Parser<TG, TF>,
    Parser<TH, TG>,
    Parser<TI, TH>,
    Parser<TJ, TI>,
    Parser<TK, TJ>,
    Parser<TL, TK>,
    Parser<TM, TL>,
    Parser<TN, TM>,
    Parser<TO, TN>,
    Parser<TP, TO>,
    Parser<TQ, TP>,
    Parser<TR, TQ>,
    Parser<TS, TR>,
    Parser<TT, TS>,
    Parser<TU, TT>,
    Parser<TV, TU>,
    Parser<TW, TV>,
    Parser<TX, TW>,
    Parser<TY, TX>,
    Parser<TZ, TY>,
  ],
): Parser<TZ, TIn>

/**/

export function pipe<T, TIn = unknown>(parsers: Parser<any, unknown>[]): Parser<T, TIn> {
  const name = parsers.reduce((name, parser) => {
    const parserName = parser.name
    if (name) {
      return `${parserName}<${name}>`
    }
    return parserName
  }, '')
  return createParser(
    (input: TIn, ok, err, Parser) => {
      let next = input
      for (const parser of parsers) {
        const result = parser(next)
        if (result.isOk()) {
          next = result.get()
        } else {
          return err(Parser, result.error.reason)
        }
      }

      return ok(next as unknown as T)
    },
    parsers[parsers.length - 1].expected,
    name,
  )
}
